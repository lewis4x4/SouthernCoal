import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { Role, Permission, RoleAssignment } from '@/types/auth';

/**
 * Role → permission mapping from v6 Section 8.
 * Queries user_role_assignments (not user_profiles.role) per schema doc.
 * Supports global and site-scoped roles.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  executive: [
    'view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette', 'search',
    // CA: Full access including approver signature
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_sign_approver', 'ca_reopen', 'ca_generate_pdf',
  ],
  site_manager: [
    'view', 'upload', 'export', 'command_palette', 'search',
    // CA: Can view, edit assigned, advance workflow, sign as responsible, reopen
    // Issue #5 Fix: Added ca_advance_workflow and ca_reopen so site managers can complete assigned CAs
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_reopen', 'ca_generate_pdf',
  ],
  environmental_manager: [
    'view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette', 'search',
    // CA: Full access except approver signature
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_reopen', 'ca_generate_pdf',
  ],
  safety_manager: [
    'view', 'upload', 'command_palette', 'search',
    // CA: View only
    'ca_view',
  ],
  field_sampler: [
    'view', 'upload', 'command_palette', 'search',
    // CA: View only
    'ca_view',
  ],
  lab_tech: [
    'view', 'upload', 'command_palette', 'search',
    // CA: View only
    'ca_view',
  ],
  admin: [
    'view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette', 'search',
    // CA: Full access including signatures
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_sign_approver', 'ca_reopen', 'ca_generate_pdf',
  ],
  read_only: [
    'view', 'export', 'command_palette', 'search',
    // CA: View only
    'ca_view',
  ],
};

/** Priority order: higher index = more permissive. Used to resolve highest-privilege assignment. */
const ROLE_PRIORITY: Role[] = [
  'read_only',
  'field_sampler',
  'lab_tech',
  'safety_manager',
  'site_manager',
  'environmental_manager',
  'executive',
  'admin',
];

const CACHE_KEY = 'scc_role_assignments';

export function usePermissions() {
  const { user } = useAuth();
  const fetchingRef = useRef(false);
  const [assignments, setAssignments] = useState<RoleAssignment[]>(() => {
    // Hydrate from localStorage so role survives transient DB failures
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAssignments([]);
      // Keep loading=true while auth is resolving — AuthGuard handles
      // the genuinely-unauthenticated case. Setting false here causes
      // RBAC gates to redirect before the real role loads.
      return;
    }

    async function fetchAssignments() {
      // Prevent concurrent fetches from multiple renders exhausting the pool
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      const { data, error } = await supabase
        .from('user_role_assignments')
        .select('id, user_id, role_id, site_id, granted_at, roles(name)')
        .eq('user_id', user!.id);

      fetchingRef.current = false;

      console.log('[permissions] raw response:', { data, error, userId: user!.id });

      if (error || !data) {
        console.error('[permissions] Failed to fetch role assignments:', error?.message);
        // No retry — use cached assignments to avoid pool exhaustion
        console.warn('[permissions] Using cached role assignments');
        setLoading(false);
        return;
      }

      if (data.length === 0) {
        // If cache has assignments but DB returned empty, RLS may be blocking
        // (e.g. user_profiles row missing blocks org-scoped RLS). Keep cached data.
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          const cachedAssignments: RoleAssignment[] = cached ? JSON.parse(cached) : [];
          if (cachedAssignments.length > 0) {
            console.warn(
              '[permissions] DB returned 0 assignments but cache has data — keeping cache (likely RLS/connection issue)',
            );
            setAssignments(cachedAssignments);
            setLoading(false);
            return;
          }
        } catch { /* parse error — fall through */ }
        console.warn(
          '[permissions] No role assignments found — defaulting to read_only. Check RLS policies on user_role_assignments.',
        );
      }

      const mapped: RoleAssignment[] = data.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        role_id: row.role_id,
        role_name: (row.roles && typeof row.roles === 'object' && 'name' in row.roles
          ? row.roles.name
          : 'read_only') as Role,
        site_id: row.site_id,
        created_at: row.granted_at,
      }));

      setAssignments(mapped);
      // Only cache non-empty results — never let empty overwrites strip admin
      if (mapped.length > 0) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(mapped));
        } catch { /* quota exceeded — non-critical */ }
      }
      setLoading(false);
    }

    fetchAssignments();
    // Depend on user.id, NOT user object — token refresh creates new reference but same user
  }, [user?.id]);

  /**
   * Check if user can perform an action.
   * If siteId is provided, checks site-scoped assignments first, then global.
   * Falls back to read_only if no assignments found.
   */
  function can(action: Permission, siteId?: string): boolean {
    if (assignments.length === 0) {
      // Default to read_only permissions if no assignments
      return ROLE_PERMISSIONS.read_only.includes(action);
    }

    // Find applicable assignments: site-specific first, then global (site_id = null)
    const applicable = siteId
      ? assignments.filter((a) => a.site_id === siteId || a.site_id === null)
      : assignments.filter((a) => a.site_id === null);

    // If no matching assignments, check all (global fallback)
    const pool = applicable.length > 0 ? applicable : assignments;

    // Resolve highest-privilege role
    let highestPriority = -1;
    let effectiveRole: Role = 'read_only';

    for (const assignment of pool) {
      const priority = ROLE_PRIORITY.indexOf(assignment.role_name);
      if (priority > highestPriority) {
        highestPriority = priority;
        effectiveRole = assignment.role_name;
      }
    }

    return ROLE_PERMISSIONS[effectiveRole]?.includes(action) ?? false;
  }

  /** Get the user's highest-privilege role name for display */
  function getEffectiveRole(): Role {
    if (assignments.length === 0) return 'read_only';

    let highestPriority = -1;
    let effectiveRole: Role = 'read_only';

    for (const assignment of assignments) {
      const priority = ROLE_PRIORITY.indexOf(assignment.role_name);
      if (priority > highestPriority) {
        highestPriority = priority;
        effectiveRole = assignment.role_name;
      }
    }

    return effectiveRole;
  }

  return { can, getEffectiveRole, assignments, loading };
}

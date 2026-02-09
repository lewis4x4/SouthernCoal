import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { Role, Permission, RoleAssignment } from '@/types/auth';

/**
 * Role → permission mapping from v6 Section 8.
 * Queries user_role_assignments (not user_profiles.role) per schema doc.
 * Supports global and site-scoped roles.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  executive: ['view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette'],
  site_manager: ['view', 'upload', 'export', 'command_palette'],
  environmental_manager: ['view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette'],
  safety_manager: ['view', 'upload', 'command_palette'],
  field_sampler: ['view', 'upload', 'command_palette'],
  lab_tech: ['view', 'upload', 'command_palette'],
  admin: ['view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette'],
  read_only: ['view', 'export', 'command_palette'],
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

export function usePermissions() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    async function fetchAssignments() {
      const { data, error } = await supabase
        .from('user_role_assignments')
        .select('id, user_id, role_id, site_id, granted_at, roles(name)')
        .eq('user_id', user!.id);

      if (error || !data) {
        console.error('[permissions] Failed to fetch role assignments:', error?.message);
        setAssignments([]);
        setLoading(false);
        return;
      }

      if (data.length === 0) {
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
      setLoading(false);
    }

    fetchAssignments();
  }, [user]);

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

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { Permission, Role, RoleAssignment } from '@/types/auth';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  executive: [
    'view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette', 'search',
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_sign_approver', 'ca_reopen', 'ca_generate_pdf',
    'governance_review', 'governance_decide', 'classify_records',
  ],
  site_manager: [
    'view', 'upload', 'export', 'command_palette', 'search',
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_reopen', 'ca_generate_pdf',
    'dispatch_override',
  ],
  environmental_manager: [
    'view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette', 'search',
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_reopen', 'ca_generate_pdf',
    'governance_review', 'governance_decide', 'classify_records',
  ],
  safety_manager: [
    'view', 'upload', 'command_palette', 'search',
    'ca_view',
  ],
  field_sampler: [
    'view', 'upload', 'command_palette', 'search',
    'ca_view',
  ],
  lab_tech: [
    'view', 'upload', 'command_palette', 'search',
    'ca_view',
  ],
  admin: [
    'view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette', 'search',
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_sign_approver', 'ca_reopen', 'ca_generate_pdf',
    'governance_review', 'governance_decide', 'classify_records', 'legal_hold', 'dispatch_override',
  ],
  read_only: [
    'view', 'export', 'command_palette', 'search',
    'ca_view',
  ],
  // Phase 2 — expanded roles
  wv_supervisor: [
    'view', 'upload', 'export', 'command_palette', 'search',
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_generate_pdf',
    'dispatch_override',
  ],
  float_sampler: [
    'view', 'upload', 'command_palette', 'search',
    'ca_view',
  ],
  courier: [
    'view', 'search',
  ],
  compliance_reviewer: [
    'view', 'upload', 'export', 'command_palette', 'search',
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_generate_pdf',
    'governance_review', 'governance_decide', 'classify_records',
  ],
  coo: [
    'view', 'upload', 'process', 'retry', 'bulk_process', 'export', 'verify', 'set_expected', 'command_palette', 'search',
    'ca_view', 'ca_edit', 'ca_advance_workflow', 'ca_sign_responsible', 'ca_sign_approver', 'ca_reopen', 'ca_generate_pdf',
    'governance_review', 'governance_decide', 'classify_records', 'dispatch_override',
  ],
  ceo_view: [
    'view', 'export', 'command_palette', 'search',
    'ca_view', 'ca_generate_pdf',
    'governance_review',
  ],
  chief_counsel: [
    'view', 'export', 'command_palette', 'search',
    'ca_view', 'ca_generate_pdf',
    'governance_review', 'governance_decide', 'classify_records', 'legal_hold',
  ],
  maintenance_owner: [
    'view', 'upload', 'command_palette', 'search',
    'ca_view', 'ca_edit',
  ],
  lab_liaison: [
    'view', 'upload', 'command_palette', 'search',
    'ca_view',
  ],
};

const ROLE_PRIORITY: Role[] = [
  'read_only',
  'courier',
  'float_sampler',
  'field_sampler',
  'lab_tech',
  'lab_liaison',
  'maintenance_owner',
  'safety_manager',
  'wv_supervisor',
  'site_manager',
  'compliance_reviewer',
  'environmental_manager',
  'ceo_view',
  'chief_counsel',
  'executive',
  'coo',
  'admin',
];

const CACHE_KEY = 'scc_role_assignments';
const CACHE_VERSION = 1;
/** Beyond this age while online, drop cached assignments so RBAC cannot run on very stale roles. */
const CACHE_MAX_STALE_MS = 72 * 60 * 60 * 1000;

function maxStaleMsForRoleCacheRead(): number {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return Number.MAX_SAFE_INTEGER;
  }
  return CACHE_MAX_STALE_MS;
}

export type PermissionAvailability = 'ready' | 'degraded' | 'unavailable';
export type PermissionScope = 'global' | 'assignment';

interface PermissionsState {
  assignments: RoleAssignment[];
  loading: boolean;
  availability: PermissionAvailability;
  error: string | null;
}

type CachedAssignmentsEnvelope = {
  version: number;
  userId: string;
  cachedAt: string;
  assignments: RoleAssignment[];
};

type PermissionsListener = (state: PermissionsState) => void;

const initialPermissionsState: PermissionsState = {
  assignments: [],
  loading: true,
  availability: 'ready',
  error: null,
};

let permissionsState: PermissionsState = initialPermissionsState;
const permissionsListeners = new Set<PermissionsListener>();
let activeUserId: string | null = null;
let fetchPromise: Promise<void> | null = null;

function emitPermissionsState(next: PermissionsState) {
  permissionsState = next;
  permissionsListeners.forEach((listener) => listener(next));
}

function subscribePermissions(listener: PermissionsListener) {
  permissionsListeners.add(listener);
  return () => {
    permissionsListeners.delete(listener);
  };
}

function readCachedAssignments(userId: string): RoleAssignment[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedAssignmentsEnvelope | RoleAssignment[];

    if (Array.isArray(parsed)) {
      return parsed.length > 0 && parsed[0]?.user_id === userId ? parsed : [];
    }

    const ageMs = Date.now() - new Date(parsed.cachedAt).getTime();
    if (Number.isNaN(ageMs) || ageMs > maxStaleMsForRoleCacheRead()) {
      localStorage.removeItem(CACHE_KEY);
      return [];
    }

    if (parsed.version !== CACHE_VERSION || parsed.userId !== userId) {
      localStorage.removeItem(CACHE_KEY);
      return [];
    }

    return parsed.assignments;
  } catch {
    return [];
  }
}

function persistCachedAssignments(userId: string, assignments: RoleAssignment[]) {
  try {
    const payload: CachedAssignmentsEnvelope = {
      version: CACHE_VERSION,
      userId,
      cachedAt: new Date().toISOString(),
      assignments,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* non-critical */
  }
}

function clearCachedAssignments() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* non-critical */
  }
}

function getAssignmentsForScope(assignments: RoleAssignment[], scope: PermissionScope, siteId?: string) {
  if (scope === 'global') {
    return assignments.filter((assignment) => assignment.site_id === null);
  }

  if (siteId) {
    const applicable = assignments.filter((assignment) => assignment.site_id === siteId || assignment.site_id === null);
    return applicable.length > 0 ? applicable : assignments;
  }

  return assignments;
}

function resolveEffectiveRole(assignments: RoleAssignment[], scope: PermissionScope = 'assignment', siteId?: string): Role {
  const pool = getAssignmentsForScope(assignments, scope, siteId);
  if (pool.length === 0) return 'read_only';

  let highestPriority = -1;
  let effectiveRole: Role = 'read_only';

  for (const assignment of pool) {
    const priority = ROLE_PRIORITY.indexOf(assignment.role_name);
    if (priority > highestPriority) {
      highestPriority = priority;
      effectiveRole = assignment.role_name;
    }
  }

  return effectiveRole;
}

async function fetchAssignmentsForUser(userId: string) {
  if (fetchPromise) {
    await fetchPromise;
    return;
  }

  fetchPromise = (async () => {
    const cachedAssignments = readCachedAssignments(userId);
    if (cachedAssignments.length > 0) {
      emitPermissionsState({
        assignments: cachedAssignments,
        loading: true,
        availability: 'ready',
        error: null,
      });
    } else {
      emitPermissionsState({
        assignments: [],
        loading: true,
        availability: 'ready',
        error: null,
      });
    }

    try {
      const { data, error } = await supabase
        .from('user_role_assignments')
        .select('id, user_id, role_id, site_id, granted_at, roles(name)')
        .eq('user_id', userId);

      if (error || !data) {
        const message = error?.message ?? 'Failed to fetch permissions';
        console.error('[permissions] Failed to fetch role assignments:', message);

        if (cachedAssignments.length > 0) {
          emitPermissionsState({
            assignments: cachedAssignments,
            loading: false,
            availability: 'degraded',
            error: message,
          });
          return;
        }

        emitPermissionsState({
          assignments: [],
          loading: false,
          availability: 'unavailable',
          error: message,
        });
        return;
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

      if (mapped.length > 0) {
        persistCachedAssignments(userId, mapped);
      } else {
        clearCachedAssignments();
      }

      emitPermissionsState({
        assignments: mapped,
        loading: false,
        availability: 'ready',
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch permissions';
      console.error('[permissions] Unexpected error:', err);

      if (cachedAssignments.length > 0) {
        emitPermissionsState({
          assignments: cachedAssignments,
          loading: false,
          availability: 'degraded',
          error: message,
        });
        return;
      }

      emitPermissionsState({
        assignments: [],
        loading: false,
        availability: 'unavailable',
        error: message,
      });
    }
  })().finally(() => {
    fetchPromise = null;
  });

  await fetchPromise;
}

export function usePermissions() {
  const { user, status: authStatus } = useAuth();
  const [state, setState] = useState<PermissionsState>(permissionsState);

  useEffect(() => subscribePermissions(setState), []);

  useEffect(() => {
    if (authStatus === 'bootstrapping') {
      emitPermissionsState((permissionsState.loading && permissionsState.assignments.length === 0) ? permissionsState : {
        assignments: permissionsState.assignments,
        loading: true,
        availability: 'ready',
        error: null,
      });
      return;
    }

    if (!user || authStatus === 'unauthenticated' || authStatus === 'expired') {
      activeUserId = null;
      clearCachedAssignments();
      emitPermissionsState({
        assignments: [],
        loading: false,
        availability: 'ready',
        error: null,
      });
      return;
    }

    if (activeUserId !== user.id) {
      activeUserId = user.id;
      void fetchAssignmentsForUser(user.id);
    }
  }, [authStatus, user]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user?.id) return;
    if (typeof window === 'undefined') return;
    const uid = user.id;
    const onOnline = () => {
      void fetchAssignmentsForUser(uid);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [authStatus, user?.id]);

  const helpers = useMemo(() => {
    const can = (action: Permission, siteId?: string): boolean => {
      const effectiveRole = resolveEffectiveRole(state.assignments, 'assignment', siteId);
      return ROLE_PERMISSIONS[effectiveRole]?.includes(action) ?? false;
    };

    const getEffectiveRole = (scope: PermissionScope = 'assignment'): Role => (
      resolveEffectiveRole(state.assignments, scope)
    );

    const hasAllowedRole = (allowedRoles: Role[], scope: PermissionScope = 'assignment'): boolean => {
      const pool = getAssignmentsForScope(state.assignments, scope);
      if (pool.length === 0) {
        return allowedRoles.includes('read_only');
      }
      return pool.some((assignment) => allowedRoles.includes(assignment.role_name));
    };

    return { can, getEffectiveRole, hasAllowedRole };
  }, [state.assignments]);

  return {
    ...helpers,
    assignments: state.assignments,
    loading: state.loading,
    availability: state.availability,
    error: state.error,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, UserCheck, UserX, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAccessReview } from '@/hooks/useAccessReview';
import { ROLES, type Role } from '@/types/auth';

interface OrgUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  role_name: Role;
  role_assignment_id: string | null;
  role_id: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  executive: 'Executive',
  site_manager: 'Site Manager',
  environmental_manager: 'Env. Manager',
  safety_manager: 'Safety Manager',
  field_sampler: 'Field Sampler',
  lab_tech: 'Lab Tech',
  admin: 'Admin',
  read_only: 'Read-Only',
};

export function AccessControlPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getEffectiveRole } = usePermissions();
  const { log } = useAuditLog();
  const accessReview = useAccessReview();
  const role = getEffectiveRole();

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'role' | 'deactivate' | 'reactivate'; userId: string } | null>(null);
  const [rlsSummary, setRlsSummary] = useState<{ tbl_name: string; policy_count: number }[]>([]);

  // RBAC gate — admin + executive only
  useEffect(() => {
    if (!['admin', 'executive'].includes(role)) {
      navigate('/dashboard', { replace: true });
    }
  }, [role, navigate]);

  // Load org users
  const fetchUsers = useCallback(async () => {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name, is_active')
      .order('email');

    if (error || !profiles) {
      console.error('[access-control] Failed to fetch users:', error?.message);
      setLoading(false);
      return;
    }

    // Fetch role assignments for all users
    const { data: assignments } = await supabase
      .from('user_role_assignments')
      .select('id, user_id, role_id, roles(name)');

    const assignmentMap = new Map<string, { id: string; role_id: string; role_name: string }>();
    for (const a of assignments ?? []) {
      const roleName = (a.roles && typeof a.roles === 'object' && 'name' in a.roles)
        ? (a.roles as { name: string }).name
        : 'read_only';
      assignmentMap.set(a.user_id, { id: a.id, role_id: a.role_id, role_name: roleName });
    }

    const orgUsers: OrgUser[] = profiles.map(p => {
      const assignment = assignmentMap.get(p.id);
      return {
        id: p.id,
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        is_active: p.is_active ?? true,
        role_name: (assignment?.role_name ?? 'read_only') as Role,
        role_assignment_id: assignment?.id ?? null,
        role_id: assignment?.role_id ?? null,
      };
    });

    setUsers(orgUsers);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Load RLS summary
  useEffect(() => {
    async function loadRLS() {
      const { data, error } = await supabase.rpc('get_rls_policy_summary');
      if (!error && data) {
        setRlsSummary(data as { tbl_name: string; policy_count: number }[]);
      }
    }
    loadRLS();
  }, []);

  // Role change
  const handleRoleChange = useCallback(async (targetUser: OrgUser, newRole: Role) => {
    // Find role ID
    const { data: roleRow } = await supabase
      .from('roles')
      .select('id')
      .eq('name', newRole)
      .single();

    if (!roleRow) {
      toast.error('Role not found');
      return;
    }

    let error;
    if (targetUser.role_assignment_id) {
      // Update existing assignment
      ({ error } = await supabase
        .from('user_role_assignments')
        .update({ role_id: roleRow.id })
        .eq('id', targetUser.role_assignment_id));
    } else {
      // Create new assignment
      ({ error } = await supabase
        .from('user_role_assignments')
        .insert({ user_id: targetUser.id, role_id: roleRow.id }));
    }

    if (error) {
      toast.error('Failed to update role');
      return;
    }

    log('role_change', {
      target_user: targetUser.email,
      old_role: targetUser.role_name,
      new_role: newRole,
    }, {
      module: 'access_control',
      tableName: 'user_role_assignments',
      recordId: targetUser.role_assignment_id ?? undefined,
      oldValues: { role: targetUser.role_name },
      newValues: { role: newRole },
    });

    toast.success(`${targetUser.email} → ${ROLE_LABELS[newRole]}`);
    setConfirmAction(null);
    setEditingUserId(null);
    fetchUsers();
  }, [log, fetchUsers]);

  // Deactivate/reactivate
  const toggleActive = useCallback(async (targetUser: OrgUser) => {
    const newActive = !targetUser.is_active;
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: newActive })
      .eq('id', targetUser.id);

    if (error) {
      toast.error('Failed to update user status');
      return;
    }

    const action = newActive ? 'user_reactivated' : 'user_deactivated';
    log(action as 'user_deactivated' | 'user_reactivated', {
      target_user: targetUser.email,
    }, {
      module: 'access_control',
      tableName: 'user_profiles',
      recordId: targetUser.id,
      oldValues: { is_active: targetUser.is_active },
      newValues: { is_active: newActive },
    });

    toast.success(newActive ? `${targetUser.email} reactivated` : `${targetUser.email} deactivated`);
    setConfirmAction(null);
    fetchUsers();
  }, [log, fetchUsers]);

  const displayName = (u: OrgUser) =>
    [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;

  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-xl bg-blue-500/10 p-2.5">
          <Shield className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Access Control
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            User management, role assignments, and quarterly access review
          </p>
        </div>
      </div>

      {/* Access Review Warning */}
      {accessReview.isOverdue && !accessReview.isReviewing && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm text-amber-400">
            {accessReview.daysSinceLastReview === null
              ? 'No access review on record.'
              : `Last access review: ${accessReview.daysSinceLastReview} days ago.`}
            {' '}Quarterly review recommended.
          </span>
          <button
            onClick={() => accessReview.startReview(
              users.filter(u => u.is_active).map(u => ({
                id: u.id,
                name: displayName(u),
                role: ROLE_LABELS[u.role_name] ?? u.role_name,
              }))
            )}
            className="ml-auto rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            Start Review
          </button>
        </div>
      )}

      {/* Access Review Panel */}
      {accessReview.isReviewing && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Quarterly Access Review</h3>
            <div className="flex gap-2">
              <button
                onClick={accessReview.cancelReview}
                className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-text-muted hover:bg-white/[0.05]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const result = accessReview.completeReview();
                  // Deactivate revoked users
                  for (const userId of result.revokedUserIds) {
                    const u = users.find(usr => usr.id === userId);
                    if (u) toggleActive(u);
                  }
                }}
                className="rounded-lg bg-purple-500/15 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/25"
              >
                Complete Review
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {accessReview.reviewItems.map(item => (
              <div key={item.userId} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                <div className="text-sm">
                  <span className="text-text-primary">{item.userName}</span>
                  <span className="ml-2 text-xs text-text-muted">({item.role})</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => accessReview.setItemStatus(item.userId, true)}
                    className={cn(
                      'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                      item.confirmed === true
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'text-text-muted hover:bg-white/[0.05]',
                    )}
                  >
                    <CheckCircle size={12} /> Confirm
                  </button>
                  <button
                    onClick={() => accessReview.setItemStatus(item.userId, false)}
                    className={cn(
                      'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                      item.confirmed === false
                        ? 'bg-red-500/15 text-red-400'
                        : 'text-text-muted hover:bg-white/[0.05]',
                    )}
                  >
                    <XCircle size={12} /> Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Management Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <div className="grid grid-cols-[1fr_200px_120px_100px_120px] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs font-medium uppercase text-text-muted">
          <div>User</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">No users found.</div>
        ) : (
          users.map((u) => (
            <div key={u.id} className="border-b border-white/[0.04]">
              <div className="grid grid-cols-[1fr_200px_120px_100px_120px] items-center gap-3 px-4 py-3 text-sm">
                <div className="text-text-primary">
                  {displayName(u)}
                  {u.id === user?.id && (
                    <span className="ml-1.5 text-[10px] text-text-muted">(you)</span>
                  )}
                </div>
                <div className="truncate text-xs text-text-muted">{u.email}</div>
                <div>
                  {editingUserId === u.id ? (
                    <select
                      value={pendingRole ?? u.role_name}
                      onChange={(e) => {
                        const newRole = e.target.value as Role;
                        setPendingRole(newRole);
                        setConfirmAction({ type: 'role', userId: u.id });
                      }}
                      className="rounded border border-white/[0.12] bg-crystal-surface px-1.5 py-0.5 text-xs text-text-secondary outline-none"
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                      {ROLE_LABELS[u.role_name] ?? u.role_name}
                    </span>
                  )}
                </div>
                <div>
                  <span className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    u.is_active
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-red-500/20 bg-red-500/10 text-red-400',
                  )}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {editingUserId === u.id ? (
                    <button
                      onClick={() => { setEditingUserId(null); setPendingRole(null); }}
                      className="text-xs text-text-muted hover:text-text-secondary"
                    >
                      Cancel
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingUserId(u.id); setPendingRole(u.role_name); }}
                        className="rounded p-1 text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text-secondary"
                        title="Edit role"
                      >
                        <RefreshCw size={14} />
                      </button>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => setConfirmAction({
                            type: u.is_active ? 'deactivate' : 'reactivate',
                            userId: u.id,
                          })}
                          className={cn(
                            'rounded p-1 transition-colors hover:bg-white/[0.05]',
                            u.is_active ? 'text-red-400/60 hover:text-red-400' : 'text-emerald-400/60 hover:text-emerald-400',
                          )}
                          title={u.is_active ? 'Deactivate' : 'Reactivate'}
                        >
                          {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Confirmation Banner */}
              {confirmAction?.userId === u.id && (
                <div className="flex items-center gap-3 border-t border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs">
                  <span className="text-text-secondary">
                    {confirmAction.type === 'role' && pendingRole
                      ? `Change ${displayName(u)} from ${ROLE_LABELS[u.role_name]} to ${ROLE_LABELS[pendingRole]}?`
                      : confirmAction.type === 'deactivate'
                        ? `Deactivate ${displayName(u)}? They will lose access.`
                        : `Reactivate ${displayName(u)}?`
                    }
                    <span className="ml-1 text-text-muted">This will be audit logged.</span>
                  </span>
                  <button
                    onClick={() => {
                      if (confirmAction.type === 'role' && pendingRole) {
                        handleRoleChange(u, pendingRole);
                      } else {
                        toggleActive(u);
                      }
                    }}
                    className="rounded-lg bg-white/[0.08] px-3 py-1 text-xs font-medium text-text-primary hover:bg-white/[0.12]"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => { setConfirmAction(null); setEditingUserId(null); setPendingRole(null); }}
                    className="text-text-muted hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* RBAC Verification Panel */}
      {rlsSummary.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">RLS Policy Verification</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rlsSummary.map(row => (
              <div key={row.tbl_name} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <span className="font-mono text-xs text-text-secondary">{row.tbl_name}</span>
                <span className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  row.policy_count > 0
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/20 bg-red-500/10 text-red-400',
                )}>
                  {row.policy_count > 0 ? `${row.policy_count} policies` : 'Unprotected'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

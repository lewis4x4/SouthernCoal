import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';

const ALL_ROLES = [
  'admin',
  'environmental_manager',
  'executive',
  'field_sampler',
  'lab_tech',
  'read_only',
  'safety_manager',
  'site_manager',
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  environmental_manager: 'Environmental Manager',
  executive: 'Executive',
  field_sampler: 'Field Sampler',
  lab_tech: 'Lab Technician',
  read_only: 'Read-Only / Legal',
  safety_manager: 'Safety Manager',
  site_manager: 'Site Manager',
};

interface Props {
  reportDef: { id: string; report_key: string; title: string };
}

export function ReportPermissionsPanel({ reportDef }: Props) {
  const { log } = useAuditLog();
  const [grantedRoles, setGrantedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('report_role_permissions')
        .select('role_name')
        .eq('report_definition_id', reportDef.id);
      setGrantedRoles((data ?? []).map((d) => d.role_name));
      setLoading(false);
    }
    fetch();
  }, [reportDef.id]);

  async function toggleRole(role: string) {
    setSaving(true);
    const isGranted = grantedRoles.includes(role);

    if (isGranted) {
      const { error } = await supabase
        .from('report_role_permissions')
        .delete()
        .eq('report_definition_id', reportDef.id)
        .eq('role_name', role);
      if (error) {
        toast.error(`Failed to revoke ${role}: ${error.message}`);
      } else {
        setGrantedRoles((prev) => prev.filter((r) => r !== role));
        toast.success(`Revoked ${ROLE_LABELS[role]} access`);
        log('report_permission_changed', {
          report_key: reportDef.report_key,
          action: 'revoke_report_permission',
          role,
        });
      }
    } else {
      const { error } = await supabase
        .from('report_role_permissions')
        .insert({ report_definition_id: reportDef.id, role_name: role });
      if (error) {
        toast.error(`Failed to grant ${role}: ${error.message}`);
      } else {
        setGrantedRoles((prev) => [...prev, role]);
        toast.success(`Granted ${ROLE_LABELS[role]} access`);
        log('report_permission_changed', {
          report_key: reportDef.report_key,
          action: 'grant_report_permission',
          role,
        });
      }
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">Role Permissions</h4>
        <p className="text-xs text-text-muted mt-1">
          Select which roles can generate this report.
        </p>
      </div>

      <div className="space-y-1.5">
        {ALL_ROLES.map((role) => {
          const isChecked = grantedRoles.includes(role);
          const isAdminRole = role === 'admin';
          return (
            <button
              key={role}
              onClick={() => !isAdminRole && toggleRole(role)}
              disabled={saving || isAdminRole}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-all ${
                isChecked
                  ? 'bg-blue-500/10 border border-blue-500/20'
                  : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1]'
              } ${isAdminRole ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span className={`text-xs font-medium ${isChecked ? 'text-blue-300' : 'text-text-secondary'}`}>
                {ROLE_LABELS[role]}
              </span>
              <div
                className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-all ${
                  isChecked ? 'bg-blue-500 border-blue-500' : 'border-white/20'
                }`}
              >
                {isChecked && (
                  <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-text-muted">
        Admin role always has access and cannot be revoked.
      </p>
    </div>
  );
}

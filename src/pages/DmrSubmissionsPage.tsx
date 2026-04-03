import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Clock, CheckCircle2, AlertTriangle, Send, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDmrSubmissions } from '@/hooks/useDmrSubmissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import type { DmrSubmissionType, DmrSubmissionStatus } from '@/types/database';

// ─── Status display ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<DmrSubmissionStatus, { label: string; bg: string; text: string; border: string }> = {
  draft:              { label: 'Draft',       bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/20' },
  pending_submission: { label: 'Pending',     bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  submitted:          { label: 'Submitted',   bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  accepted:           { label: 'Accepted',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  rejected:           { label: 'Rejected',    bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20' },
  amended:            { label: 'Amended',     bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/20' },
};

const TYPE_LABELS: Record<DmrSubmissionType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  semi_annual: 'Semi-Annual',
};

interface PermitOption {
  id: string;
  permit_number: string;
  site_name: string | null;
}

export function DmrSubmissionsPage() {
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const { submissions, loading, statusCounts } = useDmrSubmissions();
  const { createSubmission } = useDmrSubmissions();

  const [statusFilter, setStatusFilter] = useState<DmrSubmissionStatus | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [permits, setPermits] = useState<PermitOption[]>([]);
  const [loadingPermits, setLoadingPermits] = useState(false);

  // Create form state
  const [newPermitId, setNewPermitId] = useState('');
  const [newType, setNewType] = useState<DmrSubmissionType>('monthly');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch permits for create form
  const fetchPermits = useCallback(async () => {
    if (!profile?.organization_id) return;
    setLoadingPermits(true);
    const { data } = await supabase
      .from('npdes_permits')
      .select('id, permit_number, site:sites(name)')
      .eq('organization_id', profile.organization_id)
      .order('permit_number');

    setPermits(
      (data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        permit_number: p.permit_number as string,
        site_name: (p.site as Record<string, unknown> | null)?.name as string | null,
      })),
    );
    setLoadingPermits(false);
  }, [profile?.organization_id]);

  useEffect(() => {
    if (showCreate && permits.length === 0) {
      fetchPermits();
    }
  }, [showCreate, permits.length, fetchPermits]);

  // Auto-compute period end from start and type
  useEffect(() => {
    if (!newPeriodStart) return;
    const start = new Date(newPeriodStart);
    let end: Date;
    switch (newType) {
      case 'monthly':
        end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        break;
      case 'quarterly':
        end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
        break;
      case 'semi_annual':
        end = new Date(start.getFullYear(), start.getMonth() + 6, 0);
        break;
      case 'annual':
        end = new Date(start.getFullYear() + 1, start.getMonth(), 0);
        break;
      default:
        end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    }
    setNewPeriodEnd(end.toISOString().split('T')[0] ?? '');
  }, [newPeriodStart, newType]);

  async function handleCreate() {
    if (!newPermitId || !newPeriodStart || !newPeriodEnd) return;
    setCreating(true);
    const id = await createSubmission({
      permitId: newPermitId,
      periodStart: newPeriodStart,
      periodEnd: newPeriodEnd,
      submissionType: newType,
    });
    setCreating(false);
    if (id) {
      setShowCreate(false);
      navigate(`/dmr/${id}`);
    }
  }

  // Export CSV
  function handleExport() {
    const headers = ['Permit', 'Site', 'Period Start', 'Period End', 'Type', 'Status', 'Submitted At', 'Confirmation'];
    const rows = filtered.map((s) =>
      [s.permit_number, s.site_name, s.monitoring_period_start, s.monitoring_period_end, s.submission_type, s.status, s.submitted_at ?? '', s.submission_confirmation ?? ''].join(','),
    );
    const disclaimer = '# Generated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or environmental consulting. All data and reports require independent verification by qualified personnel before regulatory submission.';
    const csv = `${disclaimer}\n${headers.join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dmr-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log('report_generated', { type: 'dmr_export_csv' }, { module: 'dmr', tableName: 'dmr_submissions' });
  }

  const filtered = statusFilter
    ? submissions.filter((s) => s.status === statusFilter)
    : submissions;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <FileText className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">DMR Submissions</h1>
            <p className="text-sm text-text-muted">Discharge Monitoring Reports · {submissions.length} total</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="rounded-lg bg-white/[0.06] border border-white/[0.08] px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/[0.1] transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/20 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/25 transition-colors"
          >
            <Plus size={14} />
            New DMR
          </button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {([
          { key: 'draft', count: statusCounts.draft, icon: Clock, color: 'slate' },
          { key: 'pending', count: statusCounts.pending, icon: Send, color: 'amber' },
          { key: 'submitted', count: statusCounts.submitted, icon: FileText, color: 'blue' },
          { key: 'accepted', count: statusCounts.accepted, icon: CheckCircle2, color: 'emerald' },
          { key: 'rejected', count: statusCounts.rejected, icon: AlertTriangle, color: 'red' },
        ] as const).map(({ key, count, icon: Icon, color }) => (
          <SpotlightCard key={key} className="p-4" spotlightColor={`rgba(var(--${color}-rgb, 100, 100, 100), 0.08)`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${color}-500/10 border border-${color}-500/20`}>
                <Icon className={`h-4 w-4 text-${color}-400`} />
              </div>
              <div>
                <div className={`text-2xl font-semibold text-${color}-400`}>{count}</div>
                <div className="text-[11px] text-text-muted uppercase tracking-wider">{key}</div>
              </div>
            </div>
          </SpotlightCard>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-4 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Create New DMR Submission</h3>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Permit *</label>
              <select
                value={newPermitId}
                onChange={(e) => setNewPermitId(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-blue-400/30"
                aria-label="Select permit"
                disabled={loadingPermits}
              >
                <option value="">{loadingPermits ? 'Loading...' : 'Select permit...'}</option>
                {permits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.permit_number}{p.site_name ? ` — ${p.site_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Submission Type *</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as DmrSubmissionType)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-blue-400/30"
                aria-label="Submission type"
              >
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Period Start *</label>
              <input
                type="date"
                value={newPeriodStart}
                onChange={(e) => setNewPeriodStart(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-blue-400/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Period End *</label>
              <input
                type="date"
                value={newPeriodEnd}
                onChange={(e) => setNewPeriodEnd(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-blue-400/30"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={creating || !newPermitId || !newPeriodStart || !newPeriodEnd}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/25 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create DMR'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-text-muted">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DmrSubmissionStatus | '')}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-text-primary outline-none focus:border-blue-400/30"
          aria-label="Filter by status"
        >
          <option value="">All</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Submissions list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-8 text-center">
          <FileText size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-muted">No DMR submissions{statusFilter ? ` with status "${STATUS_CONFIG[statusFilter]?.label}"` : ''}</p>
          <p className="text-xs text-text-muted mt-1">Create a new submission to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.04]">
          {filtered.map((sub) => {
            const cfg = STATUS_CONFIG[sub.status];
            return (
              <button
                key={sub.id}
                onClick={() => navigate(`/dmr/${sub.id}`)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {sub.permit_number ?? 'Unknown Permit'}
                    </span>
                    <span className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border',
                      cfg.bg, cfg.border, cfg.text,
                    )}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-text-muted uppercase">
                      {TYPE_LABELS[sub.submission_type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
                    {sub.site_name && <span>{sub.site_name}</span>}
                    <span>
                      {sub.monitoring_period_start} — {sub.monitoring_period_end}
                    </span>
                    {sub.submission_confirmation && (
                      <span className="text-blue-400">#{sub.submission_confirmation}</span>
                    )}
                  </div>
                </div>
                <ChevronDown size={14} className="text-text-muted -rotate-90" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DmrSubmissionsPage;

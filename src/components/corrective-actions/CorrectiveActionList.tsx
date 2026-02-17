import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCorrectiveActionsStore } from '@/stores/correctiveActions';
import {
  CA_STATUSES,
  CA_PRIORITIES,
  CA_STATUS_LABELS,
  CA_PRIORITY_LABELS,
  WORKFLOW_STEP_SHORT_LABELS,
  SOURCE_TYPE_LABELS,
  isOverdue,
  getDaysOpen,
  getDaysOverdue,
  type CorrectiveAction,
  type CAStatus,
  type CAPriority,
} from '@/types/corrective-actions';

// ---------------------------------------------------------------------------
// Badge Colors
// ---------------------------------------------------------------------------
const PRIORITY_COLORS: Record<CAPriority, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const STATUS_COLORS: Record<CAStatus, string> = {
  open: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  verified: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  closed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface Props {
  actions: CorrectiveAction[];
  loading?: boolean;
}

export function CorrectiveActionList({ actions, loading }: Props) {
  const navigate = useNavigate();
  const { filters, setFilters } = useCorrectiveActionsStore();

  // Toggle filter helper
  function toggleFilter<K extends keyof typeof filters>(
    key: K,
    value: (typeof filters)[K]
  ) {
    setFilters({ [key]: filters[key] === value ? undefined : value });
  }

  // Sort: overdue first, then by due date
  const sorted = [...actions].sort((a, b) => {
    const aOverdue = isOverdue(a);
    const bOverdue = isOverdue(b);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (a.due_date && b.due_date) {
      // Issue #11 Fix: Use Date comparison instead of localeCompare for correct sorting
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted mr-1">Status:</span>
        {CA_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => toggleFilter('status', s)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              filters.status === s
                ? STATUS_COLORS[s]
                : 'border-white/[0.08] text-text-muted hover:border-white/[0.15]'
            )}
          >
            {CA_STATUS_LABELS[s]}
          </button>
        ))}

        <div className="h-4 border-l border-white/[0.08] mx-1" />

        <span className="text-xs text-text-muted mr-1">Priority:</span>
        {CA_PRIORITIES.map((p) => (
          <button
            key={p}
            onClick={() => toggleFilter('priority', p)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              filters.priority === p
                ? PRIORITY_COLORS[p]
                : 'border-white/[0.08] text-text-muted hover:border-white/[0.15]'
            )}
          >
            {CA_PRIORITY_LABELS[p]}
          </button>
        ))}

        <div className="h-4 border-l border-white/[0.08] mx-1" />

        <button
          onClick={() =>
            setFilters({ overdue_only: !filters.overdue_only })
          }
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors flex items-center gap-1',
            filters.overdue_only
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'border-white/[0.08] text-text-muted hover:border-white/[0.15]'
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          Overdue
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] text-text-muted uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">CA #</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Step</th>
              <th className="px-4 py-3 font-medium">Assigned To</th>
              <th className="px-4 py-3 font-medium">Due Date</th>
              <th className="px-4 py-3 font-medium text-right">Days</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-text-muted">
                  Loading corrective actions...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-text-muted">
                  No corrective actions found
                </td>
              </tr>
            ) : (
              sorted.map((ca) => {
                const overdue = isOverdue(ca);
                const daysOpen = getDaysOpen(ca);
                const daysOverdueCount = getDaysOverdue(ca);

                return (
                  <tr
                    key={ca.id}
                    onClick={() => navigate(`/corrective-actions/${ca.id}`)}
                    className={cn(
                      'border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] cursor-pointer',
                      overdue && 'bg-red-500/[0.03] border-l-2 border-l-red-500/40'
                    )}
                  >
                    {/* Issue #17 Fix: Add title for full ID tooltip on hover */}
                    <td
                      className="px-4 py-3 font-mono text-sm text-text-secondary"
                      title={ca.id}
                    >
                      {ca.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary max-w-[250px] truncate">
                      {ca.title}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {SOURCE_TYPE_LABELS[ca.source_type]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                          PRIORITY_COLORS[ca.priority]
                        )}
                      >
                        {CA_PRIORITY_LABELS[ca.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                          STATUS_COLORS[ca.status]
                        )}
                      >
                        {CA_STATUS_LABELS[ca.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {WORKFLOW_STEP_SHORT_LABELS[ca.workflow_step]}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {ca.assigned_to_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {ca.due_date ? (
                        <span
                          className={cn(
                            overdue ? 'text-red-400' : 'text-text-secondary'
                          )}
                        >
                          {ca.due_date}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {overdue ? (
                        <span className="text-red-400 text-sm font-medium flex items-center justify-end gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {daysOverdueCount}d overdue
                        </span>
                      ) : ca.status === 'closed' ? (
                        <span className="text-emerald-400 text-sm flex items-center justify-end gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {daysOpen}d
                        </span>
                      ) : (
                        <span className="text-text-muted text-sm flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />
                          {daysOpen}d
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

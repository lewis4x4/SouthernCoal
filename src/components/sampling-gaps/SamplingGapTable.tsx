import { cn } from '@/lib/cn';
import { GAP_REVIEW_STATUS_LABELS } from '@/lib/samplingGapSeverity';
import { GapKindBadge, GapSeverityBadge } from '@/components/sampling-gaps/SamplingGapSummaryCards';
import type { SamplingGapRecord, SamplingGapReviewStatus } from '@/types/samplingGaps';
import { Link } from 'react-router-dom';

const STATUS_COLORS: Record<SamplingGapReviewStatus, string> = {
  pending: 'bg-black/[0.03] text-text-secondary border-black/[0.08]',
  acknowledged: 'bg-qo-accent/10 text-qo-accent border-qo-accent/20',
  disputed: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  force_majeure: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  resolved: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
};

interface Props {
  rows: SamplingGapRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  kindFilter?: 'missed' | 'at_risk' | null;
}

export function SamplingGapTable({ rows, selectedId, onSelect, kindFilter }: Props) {
  const filtered = kindFilter ? rows.filter((r) => r.gap_kind === kindFilter) : rows;

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-black/[0.08] bg-qo-nested p-8 text-center">
        <p className="text-sm font-medium text-text-primary">No open gaps detected</p>
        <p className="mt-2 text-xs text-text-muted max-w-md mx-auto">
          The calendar-gap detector runs nightly at 06:00 UTC. Run detection manually once sampling
          schedules are seeded, or after the Sampling Matrix populates the calendar.
        </p>
        <p className="mt-3 text-[10px] text-qo-ochre-text/90 uppercase tracking-wide">
          DRAFT — advisory flags for human review; not verified penalty amounts
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-qo-nested text-text-muted uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">Outfall</th>
              <th className="px-3 py-2 font-medium">Parameter</th>
              <th className="px-3 py-2 font-medium">Expected</th>
              <th className="px-3 py-2 font-medium">Days Late</th>
              <th className="px-3 py-2 font-medium">Dispatch</th>
              <th className="px-3 py-2 font-medium">Field Outcome</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">WO</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                className={cn(
                  'cursor-pointer border-t border-black/[0.06] hover:bg-black/[0.04]',
                  selectedId === row.id && 'bg-qo-accent/5',
                )}
              >
                <td className="px-3 py-2.5">
                  <GapKindBadge kind={row.gap_kind} />
                </td>
                <td className="px-3 py-2.5">
                  <GapSeverityBadge severity={row.severity} />
                </td>
                <td className="px-3 py-2.5 text-text-primary">
                  {row.outfalls?.outfall_number ?? row.outfall_id.slice(0, 8)}
                </td>
                <td className="px-3 py-2.5 text-text-secondary">
                  {row.parameters?.short_name ?? row.parameter_id.slice(0, 8)}
                </td>
                <td className="px-3 py-2.5 text-text-secondary tabular-nums">{row.scheduled_date}</td>
                <td className="px-3 py-2.5 tabular-nums text-text-primary">{row.days_late}</td>
                <td className="px-3 py-2.5 text-text-muted">{row.dispatch_status ?? '—'}</td>
                <td className="px-3 py-2.5 text-text-muted">{row.field_visit_outcome ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      STATUS_COLORS[row.review_status],
                    )}
                  >
                    {GAP_REVIEW_STATUS_LABELS[row.review_status] ?? row.review_status}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {row.work_order_id ? (
                    <Link
                      to={`/work-orders?highlight=${row.work_order_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-qo-accent hover:underline"
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

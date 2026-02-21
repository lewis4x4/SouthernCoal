import { cn } from '@/lib/cn';
import { useReviewQueueStore } from '@/stores/reviewQueue';
import type { DiscrepancyRow, DiscrepancySeverity, DiscrepancyStatus, DiscrepancyType } from '@/stores/reviewQueue';

const SEVERITY_COLORS: Record<DiscrepancySeverity, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const STATUS_COLORS: Record<DiscrepancyStatus, string> = {
  pending: 'bg-white/[0.05] text-text-secondary border-white/[0.08]',
  reviewed: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  dismissed: 'bg-white/[0.03] text-text-muted border-white/[0.06]',
  escalated: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const TYPE_LABELS: Record<DiscrepancyType, string> = {
  missing_internal: 'Missing Internally',
  missing_external: 'Missing Externally',
  value_mismatch: 'Value Mismatch',
  status_mismatch: 'Status Mismatch',
};

const SEVERITY_OPTIONS: DiscrepancySeverity[] = ['critical', 'high', 'medium', 'low'];
const STATUS_OPTIONS: DiscrepancyStatus[] = ['pending', 'reviewed', 'dismissed', 'escalated', 'resolved'];
const SOURCE_OPTIONS = ['echo', 'msha'];

interface Props {
  rows: DiscrepancyRow[];
  onSelect: (id: string) => void;
}

export function DiscrepancyTable({ rows, onSelect }: Props) {
  const { filters, setFilters } = useReviewQueueStore();

  // Apply filters
  const filtered = rows.filter((r) => {
    if (filters.severity && r.severity !== filters.severity) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.source && r.source !== filters.source) return false;
    if (filters.type && r.discrepancy_type !== filters.type) return false;
    return true;
  });

  function toggleFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters({ ...filters, [key]: filters[key] === value ? undefined : value });
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted mr-1">Filter:</span>
        {SEVERITY_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => toggleFilter('severity', s)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              filters.severity === s
                ? SEVERITY_COLORS[s]
                : 'border-white/[0.08] text-text-muted hover:border-white/[0.15] hover:text-text-secondary',
            )}
          >
            {s}
          </button>
        ))}
        <div className="h-4 border-l border-white/[0.08]" />
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => toggleFilter('status', s)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              filters.status === s
                ? STATUS_COLORS[s]
                : 'border-white/[0.08] text-text-muted hover:border-white/[0.15] hover:text-text-secondary',
            )}
          >
            {s}
          </button>
        ))}
        <div className="h-4 border-l border-white/[0.08]" />
        {SOURCE_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => toggleFilter('source', s)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase transition-colors',
              filters.source === s
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                : 'border-white/[0.08] text-text-muted hover:border-white/[0.15] hover:text-text-secondary',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium">
                Permit / Mine
              </th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium">
                Type
              </th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium">
                Severity
              </th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium">
                Status
              </th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium">
                Source
              </th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium">
                Detected
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-sm">
                  No discrepancies match the current filters
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(row.id); } }}
                tabIndex={0}
                role="row"
                className="cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] focus:bg-white/[0.03] focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30"
              >
                <td className="px-4 py-3 font-mono text-xs text-text-primary">
                  {row.npdes_id || row.mine_id || '—'}
                </td>
                <td className="px-4 py-3 text-xs text-text-secondary">
                  {TYPE_LABELS[row.discrepancy_type] || row.discrepancy_type}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      SEVERITY_COLORS[row.severity],
                    )}
                  >
                    {row.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      STATUS_COLORS[row.status],
                    )}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[10px] uppercase text-text-muted font-medium">
                  {row.source}
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {new Date(row.detected_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-text-muted">
        Showing {filtered.length} of {rows.length} discrepancies
      </p>
    </div>
  );
}

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatDiscrepancyReviewerLabel, selfReviewDisplayNameFromProfile } from '@/lib/reviewQueueDisplay';
import { useReviewQueueStore } from '@/stores/reviewQueue';
import type { DiscrepancyRow, DiscrepancySeverity, DiscrepancyStatus, DiscrepancyType } from '@/stores/reviewQueue';

const SEVERITY_COLORS: Record<DiscrepancySeverity, string> = {
  critical: 'bg-red-500/10 text-qo-risk border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const STATUS_COLORS: Record<DiscrepancyStatus, string> = {
  pending: 'bg-black/[0.03] text-text-secondary border-black/[0.08]',
  reviewed: 'bg-qo-accent/10 text-qo-accent border-qo-accent/20',
  dismissed: 'bg-qo-nested text-text-muted border-black/[0.06]',
  escalated: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  resolved: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
};

const TYPE_LABELS: Record<DiscrepancyType, string> = {
  missing_internal: 'Missing Internally',
  missing_external: 'Missing Externally',
  value_mismatch: 'Value Mismatch',
  status_mismatch: 'Status Mismatch',
};

const SEVERITY_OPTIONS: DiscrepancySeverity[] = ['critical', 'high', 'medium', 'low'];
const STATUS_OPTIONS: DiscrepancyStatus[] = ['pending', 'reviewed', 'escalated'];
const TYPE_OPTIONS: DiscrepancyType[] = [
  'status_mismatch',
  'missing_internal',
  'value_mismatch',
  'missing_external',
];
const SOURCE_OPTIONS = ['echo', 'msha'];

/** Fixed row height for virtualizer (single-line cells). */
const ROW_HEIGHT_PX = 52;

interface Props {
  rows: DiscrepancyRow[];
  reviewerNames?: Record<string, string>;
  onSelect: (id: string) => void;
  onQuickReview?: (id: string) => void;
}

export function DiscrepancyTable({ rows, reviewerNames, onSelect, onQuickReview }: Props) {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canTriage = can('verify');
  const { profile } = useUserProfile();
  const selfName = selfReviewDisplayNameFromProfile(profile);
  const { filters, setFilters } = useReviewQueueStore();

  // Apply filters — memoized so unrelated re-renders (hover, selection) don't
  // re-scan the full row set, and so the virtualizer's `count` stays stable.
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filters.severity && r.severity !== filters.severity) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (filters.source && r.source !== filters.source) return false;
        if (filters.type && r.discrepancy_type !== filters.type) return false;
        return true;
      }),
    [rows, filters.severity, filters.status, filters.source, filters.type],
  );

  function toggleFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters({ ...filters, [key]: filters[key] === value ? undefined : value });
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const firstItem = virtualItems[0];
  const lastItem = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1] : undefined;
  const paddingTop = firstItem?.start ?? 0;
  const paddingBottom = lastItem ? virtualizer.getTotalSize() - lastItem.end : 0;

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
                : 'border-black/[0.08] text-text-muted hover:border-white/[0.15] hover:text-text-secondary',
            )}
          >
            {s}
          </button>
        ))}
        <div className="h-4 border-l border-black/[0.08]" />
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => toggleFilter('status', s)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              filters.status === s
                ? STATUS_COLORS[s]
                : 'border-black/[0.08] text-text-muted hover:border-white/[0.15] hover:text-text-secondary',
            )}
          >
            {s}
          </button>
        ))}
        <div className="h-4 border-l border-black/[0.08]" />
        {SOURCE_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => toggleFilter('source', s)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase transition-colors',
              filters.source === s
                ? 'bg-qo-accent/10 text-qo-accent border-qo-accent/20'
                : 'border-black/[0.08] text-text-muted hover:border-white/[0.15] hover:text-text-secondary',
            )}
          >
            {s}
          </button>
        ))}
        <div className="h-4 border-l border-black/[0.08]" />
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t}
            onClick={() => toggleFilter('type', t)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              filters.type === t
                ? 'bg-qo-accent/10 text-qo-accent border-qo-accent/20'
                : 'border-black/[0.08] text-text-muted hover:border-white/[0.15] hover:text-text-secondary',
            )}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Table — virtualized body for large discrepancy lists */}
      <div className="overflow-x-auto rounded-xl border border-black/[0.08]">
        <div
          ref={scrollRef}
          className="max-h-[min(70vh,640px)] overflow-auto"
          role="region"
          aria-label="Discrepancy list"
        >
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="sticky top-0 z-[1] border-b border-black/[0.06] bg-white backdrop-blur-md">
              <tr>
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
                <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium">
                  Reviewer
                </th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-text-muted font-medium text-right">
                  Triage
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-text-muted text-sm">
                    No discrepancies match the current filters
                  </td>
                </tr>
              )}
              {filtered.length > 0 && paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={8} className="p-0 border-0" style={{ height: paddingTop, lineHeight: 0 }} />
                </tr>
              )}
              {virtualItems.map((vRow) => {
                const row = filtered[vRow.index]!;
                return (
                  <tr
                    key={row.id}
                    data-index={vRow.index}
                    ref={virtualizer.measureElement}
                    onClick={() => onSelect(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(row.id);
                      }
                    }}
                    tabIndex={0}
                    role="row"
                    className="cursor-pointer border-b border-black/[0.05] transition-colors hover:bg-qo-nested focus:bg-qo-nested focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-text-primary truncate" title={row.npdes_id || row.mine_id || undefined}>
                      {row.npdes_id || row.mine_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary truncate" title={TYPE_LABELS[row.discrepancy_type]}>
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
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                      {new Date(row.detected_at).toLocaleDateString()}
                    </td>
                    <td
                      className="px-4 py-3 text-xs text-text-muted truncate"
                      title={row.reviewed_by ?? undefined}
                    >
                      {formatDiscrepancyReviewerLabel(
                        row.reviewed_by,
                        user?.id ?? null,
                        selfName,
                        reviewerNames,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === 'pending' && onQuickReview && (
                        <button
                          type="button"
                          disabled={!canTriage}
                          title={
                            canTriage
                              ? 'Mark reviewed without opening detail'
                              : 'Requires verify permission'
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickReview(row.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-qo-accent/20 bg-qo-accent/10 px-2 py-1 text-[10px] font-medium text-qo-accent hover:bg-qo-accent/20 disabled:opacity-40"
                        >
                          <CheckCircle size={12} />
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length > 0 && paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={8} className="p-0 border-0" style={{ height: paddingBottom, lineHeight: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-text-muted">
        Showing {filtered.length} of {rows.length} discrepancies
      </p>
    </div>
  );
}

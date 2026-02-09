import { useQueueStore } from '@/stores/queue';
import { FILE_STATUSES, CATEGORIES, STATES } from '@/lib/constants';

/**
 * Filter bar for the Processing Queue — status, state, and category dropdowns.
 */
export function QueueFilters() {
  const filters = useQueueStore((s) => s.filters);
  const setFilters = useQueueStore((s) => s.setFilters);

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/[0.04]">
      <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
        Filter
      </span>

      {/* Status */}
      <select
        value={filters.status}
        onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}
        className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-xs text-text-secondary focus:outline-none focus:border-status-queued/50"
      >
        <option value="all">All statuses</option>
        {FILE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>

      {/* State */}
      <select
        value={filters.stateCode}
        onChange={(e) => setFilters({ stateCode: e.target.value })}
        className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-xs text-text-secondary focus:outline-none focus:border-status-queued/50"
      >
        <option value="all">All states</option>
        {STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.code} — {s.name}
          </option>
        ))}
      </select>

      {/* Category */}
      <select
        value={filters.category}
        onChange={(e) => setFilters({ category: e.target.value })}
        className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-xs text-text-secondary focus:outline-none focus:border-status-queued/50"
      >
        <option value="all">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c.dbKey} value={c.dbKey}>
            {c.label}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {(filters.status !== 'all' ||
        filters.stateCode !== 'all' ||
        filters.category !== 'all') && (
        <button
          onClick={() =>
            setFilters({ status: 'all', stateCode: 'all', category: 'all' })
          }
          className="px-2 py-1 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

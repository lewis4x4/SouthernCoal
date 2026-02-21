import { useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GlassButton } from '@/components/ui/GlassButton';
import { FtsViolationDetail } from '@/components/fts/FtsViolationDetail';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { FtsViolation } from '@/types/fts';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW_HEIGHT = 48;
const STATE_TABS = ['All', 'KY', 'WV', 'VA'] as const;
const STATE_LABELS: Record<string, string> = {
  All: 'All States',
  KY: 'Kentucky',
  WV: 'West Virginia',
  VA: 'Virginia',
};

const formatDollars = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

type SortField = 'monitoring_month' | 'state' | 'dnr_number' | 'outfall_number' | 'penalty_category' | 'penalty_amount';
type SortDir = 'asc' | 'desc';

interface Props {
  violations: FtsViolation[];
}

export function FtsViolationsTable({ violations }: Props) {
  const { log } = useAuditLog();
  const [activeTab, setActiveTab] = useState<string>('All');
  const [sortField, setSortField] = useState<SortField>('monitoring_month');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [dnrSearch, setDnrSearch] = useState('');
  const [selectedViolation, setSelectedViolation] = useState<FtsViolation | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let rows = [...violations];
    if (activeTab !== 'All') rows = rows.filter((v) => v.state === activeTab);
    if (dnrSearch) {
      const lower = dnrSearch.toLowerCase();
      rows = rows.filter((v) => v.dnr_number.toLowerCase().includes(lower));
    }

    rows.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [violations, activeTab, dnrSearch, sortField, sortDir]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const exportCsv = useCallback(() => {
    const headers = ['Month', 'Quarter', 'Year', 'State', 'DNR Number', 'Outfall', 'Category', 'Penalty', 'Notes'];
    const rows = filtered.map((v) => [
      MONTH_NAMES[v.monitoring_month],
      `Q${v.monitoring_quarter}`,
      v.monitoring_year,
      v.state,
      v.dnr_number,
      v.outfall_number,
      `Category ${v.penalty_category}`,
      v.penalty_amount,
      v.notes ?? '',
    ]);

    const csv =
      [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') +
      '\n\n"Software outputs are informational only and do not constitute legal advice. See full disclaimer."';

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failure_to_sample_violations_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log('fts_export_csv' , { row_count: filtered.length, tab: activeTab });
  }, [filtered, activeTab, log]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Violations{' '}
            <span className="text-xs font-normal text-text-muted">
              {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search DNR..."
              value={dnrSearch}
              onChange={(e) => setDnrSearch(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-white/20 w-40"
            />
          </div>
          <GlassButton variant="ghost" onClick={exportCsv}>
            <Download size={14} className="mr-1.5" />
            CSV
          </GlassButton>
        </div>
      </div>

      {/* State tabs */}
      <div className="flex gap-1 px-5 py-2 border-b border-white/[0.06]">
        {STATE_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === tab
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-text-muted hover:bg-white/[0.05] hover:text-text-secondary border border-transparent',
            )}
          >
            {STATE_LABELS[tab] ?? tab}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-white/[0.06] text-[10px] uppercase tracking-widest text-text-muted font-medium">
        <button className="w-16" onClick={() => toggleSort('monitoring_month')}>
          Month <SortIcon field="monitoring_month" />
        </button>
        <button className="w-12" onClick={() => toggleSort('state')}>
          State <SortIcon field="state" />
        </button>
        <button className="flex-1 min-w-0" onClick={() => toggleSort('dnr_number')}>
          DNR Number <SortIcon field="dnr_number" />
        </button>
        <button className="w-16" onClick={() => toggleSort('outfall_number')}>
          Outfall <SortIcon field="outfall_number" />
        </button>
        <button className="w-24" onClick={() => toggleSort('penalty_category')}>
          Category <SortIcon field="penalty_category" />
        </button>
        <button className="w-24 text-right" onClick={() => toggleSort('penalty_amount')}>
          Penalty <SortIcon field="penalty_amount" />
        </button>
        <span className="w-32">Notes</span>
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="h-[400px] overflow-y-auto">
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const v = filtered[virtualRow.index];
            if (!v) return null;
            return (
              <div
                key={v.id}
                className="flex items-center gap-2 px-5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => setSelectedViolation(v)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <span className="w-16 text-xs text-text-secondary font-mono">
                  {MONTH_NAMES[v.monitoring_month]} {v.monitoring_year}
                </span>
                <span className="w-12 text-xs text-text-secondary">{v.state}</span>
                <span className="flex-1 min-w-0 text-xs text-text-primary font-mono truncate">
                  {v.dnr_number}
                </span>
                <span className="w-16 text-xs text-text-secondary font-mono">{v.outfall_number}</span>
                <span className="w-24">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                      v.penalty_category === 1
                        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400',
                    )}
                  >
                    Cat {v.penalty_category} · {formatDollars(v.penalty_amount)}
                  </span>
                </span>
                <span className="w-24 text-right text-xs text-text-primary font-mono">
                  {formatDollars(v.penalty_amount)}
                </span>
                <span className="w-32 text-xs text-text-muted truncate">
                  {v.notes ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-text-muted">
            No violations found
          </div>
        )}
      </div>

      <FtsViolationDetail
        violation={selectedViolation}
        onClose={() => setSelectedViolation(null)}
      />
    </div>
  );
}

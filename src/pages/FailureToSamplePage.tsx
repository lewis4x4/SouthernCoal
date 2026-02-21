import { useState, useMemo } from 'react';
import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/cn';
import { FtsKpiCards } from '@/components/fts/FtsKpiCards';
import { FtsTrendChart } from '@/components/fts/FtsTrendChart';
import { FtsViolationsTable } from '@/components/fts/FtsViolationsTable';
import { FtsUploadPanel } from '@/components/fts/FtsUploadPanel';
import { useFtsData } from '@/hooks/useFtsData';
import { useFtsStore } from '@/stores/fts';
import type { FtsMonthlyTotal } from '@/types/fts';

type TimeRange = 'current_quarter' | 'last_6_months' | 'ytd' | 'all_time';

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: 'current_quarter', label: 'Current Quarter' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all_time', label: 'All Time' },
];

function filterByTimeRange(totals: FtsMonthlyTotal[], range: TimeRange): FtsMonthlyTotal[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);

  switch (range) {
    case 'current_quarter': {
      const qStart = (currentQuarter - 1) * 3 + 1;
      const qEnd = currentQuarter * 3;
      return totals.filter(
        (t) => t.monitoring_year === currentYear && t.monitoring_month >= qStart && t.monitoring_month <= qEnd,
      );
    }
    case 'last_6_months': {
      const pairs: { year: number; month: number }[] = [];
      for (let i = 0; i < 6; i++) {
        let m = currentMonth - i;
        let y = currentYear;
        if (m <= 0) { m += 12; y -= 1; }
        pairs.push({ year: y, month: m });
      }
      return totals.filter((t) => pairs.some((p) => p.year === t.monitoring_year && p.month === t.monitoring_month));
    }
    case 'ytd':
      return totals.filter((t) => t.monitoring_year === currentYear);
    case 'all_time':
    default:
      return totals;
  }
}

export function FailureToSamplePage() {
  const { uploads, violations, monthlyTotals, kpis } = useFtsData();
  const { filters, setFilters, resetFilters } = useFtsStore();
  const [timeRange, setTimeRange] = useState<TimeRange>('all_time');

  const filteredTotals = useMemo(() => filterByTimeRange(monthlyTotals, timeRange), [monthlyTotals, timeRange]);

  const currentYear = new Date().getFullYear();
  const years = Array.from(new Set(violations.map((v) => v.monitoring_year))).sort((a, b) => b - a);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign size={20} className="text-red-400" />
            <h2 className="text-xl font-semibold text-text-primary">
              Failure to Sample Penalties
            </h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Consent Decree penalty tracking by state, permit, and outfall
          </p>
        </div>

        {/* Year / Quarter filters */}
        <div className="flex items-center gap-2">
          <select
            value={filters.year ?? ''}
            onChange={(e) => setFilters({ year: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-white/20"
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={filters.quarter ?? ''}
            onChange={(e) =>
              setFilters({ quarter: e.target.value ? Number(e.target.value) : null })
            }
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-white/20"
          >
            <option value="">All Quarters</option>
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </select>

          <select
            value={filters.state ?? ''}
            onChange={(e) => setFilters({ state: e.target.value || null })}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-white/20"
          >
            <option value="">All States</option>
            <option value="KY">Kentucky</option>
            <option value="WV">West Virginia</option>
            <option value="VA">Virginia</option>
          </select>

          {(filters.year || filters.quarter || filters.state) && (
            <button
              onClick={resetFilters}
              className="text-[10px] text-text-muted hover:text-text-secondary"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <FtsKpiCards kpis={kpis} />

      {/* Trend Chart */}
      <div>
        <div className="flex gap-1 mb-4">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              className={cn(
                'px-3 py-1 rounded-full text-sm transition-colors',
                timeRange === r.key
                  ? 'text-white bg-white/15 border border-white/25'
                  : 'text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <FtsTrendChart monthlyTotals={filteredTotals} />
      </div>

      {/* Main content: Table + Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FtsViolationsTable violations={violations} />
        </div>
        <div>
          <FtsUploadPanel uploads={uploads} />
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/cn';
import type { FtsMonthlyTotal } from '@/types/fts';

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATE_COLORS: Record<string, string> = {
  KY: '#3b82f6', // blue
  WV: '#a855f7', // purple
  VA: '#f59e0b', // amber
  Total: '#ef4444', // red
};

const formatDollars = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value}`;
};

interface Props {
  monthlyTotals: FtsMonthlyTotal[];
}

export function FtsTrendChart({ monthlyTotals }: Props) {
  const [visibleStates, setVisibleStates] = useState<Set<string>>(
    new Set(['KY', 'WV', 'VA', 'Total']),
  );

  const toggleState = (state: string) => {
    setVisibleStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  };

  const chartData = useMemo(() => {
    // Group by month
    const byMonth = new Map<string, Record<string, string | number>>();

    for (const t of monthlyTotals) {
      if (t.state === 'TN') continue; // Always $0
      const key = `${t.monitoring_year}-${String(t.monitoring_month).padStart(2, '0')}`;
      const label = `${MONTH_LABELS[t.monitoring_month]} ${t.monitoring_year}`;

      if (!byMonth.has(key)) {
        byMonth.set(key, { label, KY: 0, WV: 0, VA: 0, Total: 0 });
      }
      const entry = byMonth.get(key)!;
      entry[t.state] = ((entry[t.state] as number) ?? 0) + t.total_penalties;
      entry['Total'] = (entry['Total'] as number) + t.total_penalties;
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [monthlyTotals]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-6">
        <h3 className="text-sm font-semibold text-text-primary">Penalty Trend</h3>
        <p className="text-sm text-text-muted mt-4">No data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Penalty Trend</h3>
        <div className="flex gap-1.5">
          {(['KY', 'WV', 'VA', 'Total'] as const).map((state) => (
            <button
              key={state}
              onClick={() => toggleState(state)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide border transition-all',
                visibleStates.has(state)
                  ? 'border-white/20 bg-white/10 text-text-primary'
                  : 'border-white/[0.06] bg-transparent text-text-muted',
              )}
              style={{
                borderColor: visibleStates.has(state) ? STATE_COLORS[state] : undefined,
                color: visibleStates.has(state) ? STATE_COLORS[state] : undefined,
              }}
            >
              {state}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <YAxis
            tickFormatter={formatDollars}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(13, 17, 23, 0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#f1f5f9',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '12px',
            }}
            formatter={(value: number | undefined) => [formatDollars(value ?? 0)]}
          />
          {visibleStates.has('KY') && (
            <Line type="monotone" dataKey="KY" stroke={STATE_COLORS.KY} strokeWidth={2} dot={{ r: 3 }} />
          )}
          {visibleStates.has('WV') && (
            <Line type="monotone" dataKey="WV" stroke={STATE_COLORS.WV} strokeWidth={2} dot={{ r: 3 }} />
          )}
          {visibleStates.has('VA') && (
            <Line type="monotone" dataKey="VA" stroke={STATE_COLORS.VA} strokeWidth={2} dot={{ r: 3 }} />
          )}
          {visibleStates.has('Total') && (
            <Line type="monotone" dataKey="Total" stroke={STATE_COLORS.Total} strokeWidth={2.5} dot={{ r: 3 }} strokeDasharray="6 3" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

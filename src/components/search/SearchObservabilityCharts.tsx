import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, Clock, DollarSign } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';

const DOMAIN_COLORS: Record<string, string> = {
  permits: '#60a5fa',
  exceedances: '#f87171',
  penalties: '#fbbf24',
  sampling: '#34d399',
  organizations: '#a78bfa',
};

interface SearchObservabilityChartsProps {
  costByDay: Array<{ date: string; avg: number }>;
  failByDay: Array<{ date: string; success: number; fail: number }>;
  domainVolume: Array<{ name: string; value: number }>;
  responseTimeStats: { p50: number; p95: number; p99: number; avg: number };
}

export default function SearchObservabilityCharts({
  costByDay,
  failByDay,
  domainVolume,
  responseTimeStats,
}: SearchObservabilityChartsProps) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <DollarSign className="h-4 w-4" />
            Cost per Query (avg)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={costByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={(v) => `$${Number(v).toFixed(4)}`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  formatter={(value: unknown) => [`$${Number(value).toFixed(5)}`, 'Avg Cost']}
                />
                <Line type="monotone" dataKey="avg" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <AlertTriangle className="h-4 w-4" />
            Success / Failure by Day
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={failByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} />
                <Tooltip
                  contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                />
                <Bar dataKey="success" stackId="a" fill="#34d399" name="Success" />
                <Bar dataKey="fail" stackId="a" fill="#f87171" name="Failed" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SpotlightCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <BarChart3 className="h-4 w-4" />
            Query Volume by Domain
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={domainVolume}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {domainVolume.map((entry) => (
                    <Cell key={entry.name} fill={DOMAIN_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
            <Clock className="h-4 w-4" />
            Response Time Distribution
          </h3>
          <div className="grid grid-cols-4 gap-3 py-6">
            {[
              { label: 'Avg', value: responseTimeStats.avg },
              { label: 'p50', value: responseTimeStats.p50 },
              { label: 'p95', value: responseTimeStats.p95 },
              { label: 'p99', value: responseTimeStats.p99 },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="font-mono text-xl font-bold text-text-primary">
                  {(value / 1000).toFixed(1)}s
                </p>
                <p className="text-xs text-text-muted">{label}</p>
              </div>
            ))}
          </div>
        </SpotlightCard>
      </div>
    </>
  );
}

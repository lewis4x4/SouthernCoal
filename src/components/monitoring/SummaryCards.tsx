import { AlertTriangle, TrendingUp, TrendingDown, Minus, TestTube, Activity, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import type { MonitoringStats } from '@/hooks/useMonitoringStats';

interface SummaryCardsProps {
  stats: MonitoringStats | null;
  loading: boolean;
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: typeof AlertTriangle;
  iconColor?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  loading?: boolean;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-primary',
  trend,
  trendValue,
  loading,
}: StatCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400' : 'text-gray-400';

  return (
    <SpotlightCard className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <div className="h-8 w-16 bg-white/10 animate-pulse rounded mt-1" />
          ) : (
            <p className="text-3xl font-bold mt-1">{value}</p>
          )}
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={clsx('p-2 rounded-lg bg-white/5', iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && trendValue !== undefined && (
        <div className={clsx('flex items-center gap-1 mt-3 text-xs', trendColor)}>
          <TrendIcon className="h-3 w-3" />
          <span>{trendValue}% vs last 30 days</span>
        </div>
      )}
    </SpotlightCard>
  );
}

export function SummaryCards({ stats, loading }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Open Exceedances */}
      <StatCard
        title="Open Exceedances"
        value={stats?.openExceedances ?? 0}
        subtitle={stats?.acknowledgedExceedances ? `${stats.acknowledgedExceedances} acknowledged` : undefined}
        icon={AlertTriangle}
        iconColor="text-red-400"
        trend={stats?.exceedanceTrend}
        trendValue={stats?.exceedanceTrendPct}
        loading={loading}
      />

      {/* Critical/Major */}
      <StatCard
        title="Critical & Major"
        value={(stats?.criticalExceedances ?? 0) + (stats?.majorExceedances ?? 0)}
        subtitle={stats ? `${stats.criticalExceedances} critical, ${stats.majorExceedances} major` : undefined}
        icon={AlertCircle}
        iconColor="text-orange-400"
        loading={loading}
      />

      {/* Recent Lab Results */}
      <StatCard
        title="Lab Results (30d)"
        value={stats?.recentLabResults ?? 0}
        icon={TestTube}
        iconColor="text-blue-400"
        loading={loading}
      />

      {/* Recent Sampling Events */}
      <StatCard
        title="Sampling Events (30d)"
        value={stats?.recentSamplingEvents ?? 0}
        icon={Activity}
        iconColor="text-green-400"
        loading={loading}
      />
    </div>
  );
}

interface SeverityBreakdownProps {
  stats: MonitoringStats | null;
  loading: boolean;
}

export function SeverityBreakdown({ stats, loading }: SeverityBreakdownProps) {
  const severities = [
    { key: 'critical' as const, label: 'Critical', color: 'bg-red-500' },
    { key: 'major' as const, label: 'Major', color: 'bg-orange-500' },
    { key: 'moderate' as const, label: 'Moderate', color: 'bg-yellow-500' },
    { key: 'minor' as const, label: 'Minor', color: 'bg-blue-500' },
  ];

  const total = stats
    ? stats.criticalExceedances + stats.majorExceedances + stats.moderateExceedances + stats.minorExceedances
    : 0;

  return (
    <SpotlightCard className="p-6">
      <h3 className="text-lg font-medium mb-4">Exceedances by Severity</h3>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-white/10 animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {severities.map(({ key, label, color }) => {
            const count = stats?.exceedancesBySeverity[key] ?? 0;
            const percentage = total > 0 ? (count / total) * 100 : 0;

            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-mono">{count}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-500', color)}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && total === 0 && (
        <p className="text-center text-muted-foreground py-4">No active exceedances</p>
      )}
    </SpotlightCard>
  );
}

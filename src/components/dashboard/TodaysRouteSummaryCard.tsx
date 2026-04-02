import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Route, CheckCircle2, Circle, AlertTriangle, Droplets } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useFieldOps } from '@/hooks/useFieldOps';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { getEasternTodayYmd } from '@/lib/operationalDate';

interface TodaysRouteSummaryCardProps {
  scope: 'mine' | 'org';
}

export function TodaysRouteSummaryCard({ scope }: TodaysRouteSummaryCardProps) {
  const { visits, loading } = useFieldOps();
  const { user } = useAuth();

  const stats = useMemo(() => {
    const today = getEasternTodayYmd();
    let filtered = visits.filter((v) => v.scheduled_date === today);
    if (scope === 'mine' && user) {
      filtered = filtered.filter((v) => v.assigned_to === user.id);
    }

    const total = filtered.length;
    const completed = filtered.filter((v) => v.visit_status === 'completed').length;
    const open = filtered.filter((v) => v.visit_status !== 'completed' && v.visit_status !== 'cancelled').length;
    const noDischarge = filtered.filter((v) => v.outcome === 'no_discharge').length;
    const accessIssue = filtered.filter((v) => v.outcome === 'access_issue').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, open, noDischarge, accessIssue, pct };
  }, [visits, scope, user]);

  if (loading) {
    return (
      <SpotlightCard className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-40 rounded bg-white/[0.06]" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-white/[0.04]" />
            ))}
          </div>
          <div className="h-3 w-full rounded-full bg-white/[0.04]" />
        </div>
      </SpotlightCard>
    );
  }

  const STAT_BLOCKS = [
    { label: 'Total Stops', value: stats.total, icon: Route, color: 'text-cyan-400' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Open', value: stats.open, icon: Circle, color: 'text-amber-400' },
    { label: 'Issues', value: stats.accessIssue, icon: AlertTriangle, color: 'text-red-400' },
  ];

  return (
    <SpotlightCard className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Route className="h-4 w-4 text-emerald-400" />
          {scope === 'mine' ? "Today's Route" : "Today's Field Activity"}
        </h3>
        {stats.noDischarge > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
            <Droplets className="h-3 w-3" />
            {stats.noDischarge} no-discharge
          </span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_BLOCKS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
            <Icon className={cn('mx-auto mb-1 h-5 w-5', color)} />
            <p className="font-mono text-xl font-bold text-text-primary">{value}</p>
            <p className="text-[10px] text-text-muted">{label}</p>
          </div>
        ))}
      </div>

      {stats.total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>Progress</span>
            <span>{stats.pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
        </div>
      )}

      <Link
        to="/field/route"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
      >
        <Route className="h-4 w-4" />
        {stats.completed === 0 && stats.total > 0 ? 'Start Route' : 'View Route'}
      </Link>
    </SpotlightCard>
  );
}

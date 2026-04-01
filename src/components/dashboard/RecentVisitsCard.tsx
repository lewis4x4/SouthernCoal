import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CheckCircle2, Droplets, AlertTriangle } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useFieldOps } from '@/hooks/useFieldOps';
import { cn } from '@/lib/cn';
import type { FieldVisitOutcome } from '@/types/field';

const OUTCOME_CONFIG: Record<FieldVisitOutcome, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  sample_collected: { label: 'Sampled', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  no_discharge: { label: 'No Discharge', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Droplets },
  access_issue: { label: 'Access Issue', color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: AlertTriangle },
};

export function RecentVisitsCard() {
  const { visits, loading } = useFieldOps();

  const recentCompleted = useMemo(
    () =>
      visits
        .filter((v) => v.visit_status === 'completed' && v.completed_at)
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
        .slice(0, 5),
    [visits],
  );

  if (loading) {
    return (
      <SpotlightCard className="p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-36 rounded bg-white/[0.06]" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      </SpotlightCard>
    );
  }

  return (
    <SpotlightCard className="p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-text-secondary">
        <ClipboardCheck className="h-4 w-4 text-cyan-400" />
        Recent Visits
      </h3>

      {recentCompleted.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">No completed visits yet</p>
      ) : (
        <div className="space-y-2">
          {recentCompleted.map((v) => {
            const cfg = v.outcome ? OUTCOME_CONFIG[v.outcome] : null;
            const Icon = cfg?.icon ?? CheckCircle2;
            const completedDate = v.completed_at
              ? new Date(v.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : '';

            return (
              <Link
                key={v.id}
                to={`/field/visits/${v.id}`}
                className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-muted">
                    {v.outfall_number ?? '—'}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {v.permit_number ?? ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted">{completedDate}</span>
                  {cfg && (
                    <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', cfg.color)}>
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SpotlightCard>
  );
}

import { Link } from 'react-router-dom';
import { ClipboardCheck, AlertTriangle, Clock, CheckCircle2, CircleDot } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useCorrectiveActions } from '@/hooks/useCorrectiveActions';
import { cn } from '@/lib/cn';

export function CorrectiveActionSummaryCard() {
  const { counts, loading } = useCorrectiveActions();

  if (loading) {
    return (
      <SpotlightCard className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-40 rounded bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </SpotlightCard>
    );
  }

  const BLOCKS = [
    { label: 'Open', value: counts.open ?? 0, icon: CircleDot, color: 'text-cyan-400' },
    { label: 'In Progress', value: counts.in_progress ?? 0, icon: Clock, color: 'text-amber-400' },
    { label: 'Overdue', value: counts.overdue, icon: AlertTriangle, color: 'text-red-400' },
    { label: 'Completed', value: counts.completed ?? 0, icon: CheckCircle2, color: 'text-emerald-400' },
  ];

  return (
    <SpotlightCard className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <ClipboardCheck className="h-4 w-4 text-cyan-400" />
          Corrective Actions
        </h3>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-text-muted">
          {counts.total} total
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {BLOCKS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              <Icon className={cn('h-4 w-4', color)} />
              <span className="text-[10px] text-text-muted">{label}</span>
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-text-primary">{value}</p>
          </div>
        ))}
      </div>

      <Link
        to="/corrective-actions"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 py-2 text-sm font-semibold text-cyan-400 transition-colors hover:bg-cyan-500/20"
      >
        <ClipboardCheck className="h-4 w-4" />
        View All Actions
      </Link>
    </SpotlightCard>
  );
}

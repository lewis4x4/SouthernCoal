import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRoadmapTasks } from '@/hooks/useRoadmapTasks';
import { PHASE_LABELS } from '@/types/roadmap';
import type { PhaseStats } from '@/types/handoff';

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        className={`h-full ${color} rounded-full`}
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  if (value === 0) return null;

  return (
    <div className={`flex items-center gap-1 text-xs ${color}`}>
      <span className="font-mono font-medium">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

export function PhaseProgressSnapshot() {
  const { tasks, loading } = useRoadmapTasks();

  const stats = useMemo((): PhaseStats[] => {
    const phases = [1, 2, 3, 4, 5];

    return phases.map((phase) => {
      const phaseTasks = tasks.filter((t) => t.phase === phase);

      const done = phaseTasks.filter((t) => t.status === 'complete').length;
      const partial = phaseTasks.filter((t) => t.status === 'in_progress').length;
      const blocked = phaseTasks.filter((t) => t.status === 'blocked').length;
      const awaitingTom = phaseTasks.filter(
        (t) =>
          t.status !== 'complete' &&
          (t.owner_type === 'tom' || t.owner_type === 'scc_mgmt')
      ).length;
      const notStarted = phaseTasks.filter((t) => t.status === 'not_started').length;

      return {
        phase,
        label: PHASE_LABELS[phase] ?? `Phase ${phase}`,
        done,
        partial,
        blocked,
        awaiting_tom: awaitingTom,
        not_started: notStarted,
        total: phaseTasks.length,
      };
    });
  }, [tasks]);

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, s) => ({
        done: acc.done + s.done,
        partial: acc.partial + s.partial,
        blocked: acc.blocked + s.blocked,
        awaiting_tom: acc.awaiting_tom + s.awaiting_tom,
        not_started: acc.not_started + s.not_started,
        total: acc.total + s.total,
      }),
      { done: 0, partial: 0, blocked: 0, awaiting_tom: 0, not_started: 0, total: 0 }
    );
  }, [stats]);

  const overallPercent = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-white/[0.08] bg-white/[0.02]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Progress */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-2xl font-bold text-text-primary">{overallPercent}%</span>
          <span className="text-sm text-text-muted ml-2">Complete</span>
        </div>
        <div className="flex gap-4 text-sm">
          <StatBadge label="Done" value={totals.done} color="text-emerald-400" />
          <StatBadge label="Partial" value={totals.partial} color="text-blue-400" />
          <StatBadge label="Blocked" value={totals.blocked} color="text-amber-400" />
          <StatBadge label="Awaiting" value={totals.awaiting_tom} color="text-purple-400" />
        </div>
      </div>

      {/* Phase Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map((phase, index) => {
          const phasePercent = phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0;

          return (
            <motion.div
              key={phase.phase}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3"
            >
              {/* Phase label */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-muted">
                  Phase {phase.phase}
                </span>
                <span className="text-xs font-mono text-text-secondary">
                  {phasePercent}%
                </span>
              </div>

              {/* Progress bar */}
              <ProgressBar
                value={phase.done}
                max={phase.total}
                color="bg-emerald-500"
              />

              {/* Stats row */}
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {phase.done > 0 && (
                  <span className="text-xs text-emerald-400">{phase.done} done</span>
                )}
                {phase.partial > 0 && (
                  <span className="text-xs text-blue-400">{phase.partial} partial</span>
                )}
                {phase.blocked > 0 && (
                  <span className="text-xs text-amber-400">{phase.blocked} blocked</span>
                )}
                {phase.awaiting_tom > 0 && (
                  <span className="text-xs text-purple-400">{phase.awaiting_tom} awaiting</span>
                )}
              </div>

              {/* Phase name */}
              <p className="text-xs text-text-muted truncate" title={phase.label}>
                {phase.label.replace('Phase ', '').replace(/^\d+ — /, '')}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

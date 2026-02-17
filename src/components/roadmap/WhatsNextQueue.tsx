import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Zap,
  GitBranch,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useHandoffStore } from '@/stores/handoff';
import { useHandoffProcessing } from '@/hooks/useHandoffProcessing';
import { GlassButton } from '@/components/ui/GlassButton';
import { TIER_LABELS, TIER_DESCRIPTIONS, TIER_COLORS, type PriorityTier } from '@/lib/constants';
import { STATUS_COLORS, STATUS_LABELS, OWNER_LABELS, OWNER_COLORS } from '@/types/roadmap';
import type { PriorityTask } from '@/types/handoff';

const TIER_ICONS: Record<PriorityTier, React.ElementType> = {
  1: AlertTriangle,
  2: Zap,
  3: GitBranch,
};

interface TierSectionProps {
  tier: PriorityTier;
  tasks: PriorityTask[];
  defaultExpanded?: boolean;
}

function TierSection({ tier, tasks, defaultExpanded = false }: TierSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  const Icon = TIER_ICONS[tier];

  return (
    <div className={`rounded-xl border ${TIER_COLORS[tier]} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500/50"
        aria-expanded={expanded}
        aria-controls={`tier-${tier}-content`}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} />
          <span className="font-medium">{TIER_LABELS[tier]}</span>
          <span className="text-sm opacity-70">({tasks.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-60">{TIER_DESCRIPTIONS[tier]}</span>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {/* Task List */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            id={`tier-${tier}-content`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
              {tasks.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-text-muted">
                  No tasks in this tier
                </div>
              ) : (
                tasks.map((task, index) => (
                  <motion.div
                    key={task.task_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="px-4 py-3 hover:bg-white/[0.02] transition-colors"
                    onMouseEnter={() => setHoveredTask(task.task_id)}
                    onMouseLeave={() => setHoveredTask(null)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Task info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-text-primary">
                            {task.task_id}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[task.status]}`}>
                            {STATUS_LABELS[task.status]}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${OWNER_COLORS[task.owner_type]}`}>
                            {OWNER_LABELS[task.owner_type]}
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary mt-1 truncate">
                          {task.task_description}
                        </p>
                      </div>

                      {/* Right: Score */}
                      <div className="flex-shrink-0 relative">
                        <div
                          className={`
                            px-3 py-1.5 rounded-lg text-center
                            ${task.score.total >= 15
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : task.score.total >= 10
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-white/[0.04] text-text-secondary border border-white/[0.08]'
                            }
                          `}
                        >
                          <span className="font-mono font-bold">{task.score.total}</span>
                        </div>

                        {/* Score breakdown tooltip */}
                        {hoveredTask === task.task_id && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute right-0 top-full mt-2 z-50 w-72 p-3 rounded-lg bg-crystal-surface border border-white/[0.12] shadow-xl"
                          >
                            <div className="text-xs space-y-2">
                              <div className="font-medium text-text-primary mb-2">
                                Priority Score Breakdown
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-text-muted">
                                <span>Downstream Impact:</span>
                                <span className="text-text-secondary text-right">
                                  {task.score.factors.downstream_impact} × 3 = {task.score.factors.downstream_impact * 3}
                                </span>
                                <span>Blocker Removal:</span>
                                <span className="text-text-secondary text-right">
                                  {task.score.factors.is_blocker_removal ? '1' : '0'} × 5 = {task.score.factors.is_blocker_removal ? 5 : 0}
                                </span>
                                <span>Phase Weight:</span>
                                <span className="text-text-secondary text-right">
                                  {task.score.factors.phase_weight} × 2 = {task.score.factors.phase_weight * 2}
                                </span>
                                <span>External Dependency:</span>
                                <span className="text-text-secondary text-right">
                                  {task.score.factors.has_external_dependency ? '1' : '0'} × 4 = -{task.score.factors.has_external_dependency ? 4 : 0}
                                </span>
                              </div>
                              <div className="border-t border-white/[0.08] pt-2 mt-2">
                                <code className="text-[10px] text-text-muted font-mono">
                                  {task.score.formula}
                                </code>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* Dependency info */}
                    {(task.depends_on.length > 0 || task.blocks.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {task.depends_on.length > 0 && (
                          <span className="text-text-muted">
                            Blocked by:{' '}
                            {task.depends_on.map((id, i) => (
                              <span key={id}>
                                <span className="font-mono text-amber-400">{id}</span>
                                {i < task.depends_on.length - 1 && ', '}
                              </span>
                            ))}
                          </span>
                        )}
                        {task.blocks.length > 0 && (
                          <span className="text-text-muted">
                            Unblocks:{' '}
                            {task.blocks.map((id, i) => (
                              <span key={id}>
                                <span className="font-mono text-emerald-400">{id}</span>
                                {i < task.blocks.length - 1 && ', '}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function WhatsNextQueue() {
  const { whatsNextQueue, recentlyResolved } = useHandoffStore();
  const { recalculatePriorityQueue, status } = useHandoffProcessing();

  // Recalculate on mount
  useEffect(() => {
    recalculatePriorityQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run on mount
  }, []);

  const isRefreshing = status === 'extracting';

  // Top priority task
  const topPriority = useMemo(() => {
    if (!whatsNextQueue) return null;
    return (
      whatsNextQueue.tier_2_actionable[0] ??
      whatsNextQueue.tier_3_parallel[0] ??
      whatsNextQueue.tier_1_critical[0]
    );
  }, [whatsNextQueue]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">What's Next?</h2>
          <p className="text-sm text-text-muted mt-1">
            Priority-ranked tasks based on downstream impact and dependencies
          </p>
        </div>
        <GlassButton
          onClick={() => recalculatePriorityQueue()}
          disabled={isRefreshing}
          variant="ghost"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          <span className="ml-2">Refresh</span>
        </GlassButton>
      </div>

      {/* Top Priority Callout */}
      {topPriority && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
          <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-2">
            <Zap size={14} />
            Recommended Next Action
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold text-text-primary">
              {topPriority.task_id}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${OWNER_COLORS[topPriority.owner_type]}`}>
              {OWNER_LABELS[topPriority.owner_type]}
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {topPriority.task_description}
          </p>
          {topPriority.blocks.length > 0 && (
            <p className="text-xs text-emerald-400 mt-2">
              Completing this unblocks: {topPriority.blocks.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Tier Sections */}
      {whatsNextQueue ? (
        <div className="space-y-4">
          <TierSection
            tier={1}
            tasks={whatsNextQueue.tier_1_critical}
            defaultExpanded={true}
          />
          <TierSection
            tier={2}
            tasks={whatsNextQueue.tier_2_actionable}
            defaultExpanded={true}
          />
          <TierSection
            tier={3}
            tasks={whatsNextQueue.tier_3_parallel}
            defaultExpanded={false}
          />
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted">
          <Info size={24} className="mx-auto mb-3 opacity-50" />
          <p>No priority queue generated yet</p>
          <p className="text-sm mt-1">Click Refresh to calculate priorities</p>
        </div>
      )}

      {/* Recently Resolved */}
      {recentlyResolved.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-secondary">
            Recently Resolved ({recentlyResolved.length})
          </h3>
          <div className="space-y-2">
            {recentlyResolved.slice(0, 5).map((task) => (
              <div
                key={task.task_id}
                className="flex items-center gap-3 px-4 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20"
              >
                <span className="font-mono text-sm text-emerald-400">
                  {task.task_id}
                </span>
                <span className="text-sm text-text-secondary truncate flex-1">
                  {task.task_description}
                </span>
                <span className="text-xs text-text-muted">
                  {task.source_from}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last generated */}
      {whatsNextQueue && (
        <p className="text-xs text-text-muted text-center">
          Last updated: {new Date(whatsNextQueue.generated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

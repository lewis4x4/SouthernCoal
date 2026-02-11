import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, ChevronDown, ChevronRight, X, Sparkles, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';
import { usePermissions } from '@/hooks/usePermissions';
import { useRoadmapTasks } from '@/hooks/useRoadmapTasks';
import { useAuditLog } from '@/hooks/useAuditLog';
import { EvidenceCaptureUpload } from '@/components/submissions/EvidenceCaptureUpload';
import { SubmissionEvidenceViewer } from '@/components/submissions/SubmissionEvidenceViewer';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  OWNER_LABELS,
  OWNER_COLORS,
  PHASE_LABELS,
} from '@/types/roadmap';
import type { RoadmapTask, RoadmapStatus, OwnerType } from '@/types/roadmap';

// ─── Filters ────────────────────────────────────────────────────────────────

type PhaseFilter = 'all' | 1 | 2 | 3 | 4 | 5;
type StatusFilterType = 'all' | RoadmapStatus;
type OwnerFilter = 'all' | OwnerType;

function FilterBar({
  phase, setPhase,
  status, setStatus,
  owner, setOwner,
  sections, section, setSection,
}: {
  phase: PhaseFilter; setPhase: (v: PhaseFilter) => void;
  status: StatusFilterType; setStatus: (v: StatusFilterType) => void;
  owner: OwnerFilter; setOwner: (v: OwnerFilter) => void;
  sections: string[]; section: string; setSection: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3">
      <FilterSelect
        label="Phase"
        value={String(phase)}
        onChange={v => setPhase(v === 'all' ? 'all' : Number(v) as 1 | 2 | 3 | 4 | 5)}
        options={[
          { value: 'all', label: 'All Phases' },
          ...([1, 2, 3, 4, 5] as const).map(p => ({ value: String(p), label: `Phase ${p}` })),
        ]}
      />
      <FilterSelect
        label="Status"
        value={status}
        onChange={v => setStatus(v as StatusFilterType)}
        options={[
          { value: 'all', label: 'All Statuses' },
          { value: 'not_started', label: 'Not Started' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'blocked', label: 'Blocked' },
          { value: 'complete', label: 'Complete' },
          { value: 'na', label: 'N/A' },
        ]}
      />
      <FilterSelect
        label="Owner"
        value={owner}
        onChange={v => setOwner(v as OwnerFilter)}
        options={[
          { value: 'all', label: 'All Owners' },
          { value: 'you', label: 'Tom' },
          { value: 'scc_mgmt', label: 'SCC Mgmt' },
          { value: 'both', label: 'Both' },
          { value: 'legal', label: 'Legal' },
          { value: 'software', label: 'Software' },
        ]}
      />
      {sections.length > 0 && (
        <FilterSelect
          label="Section"
          value={section}
          onChange={setSection}
          options={[
            { value: 'all', label: 'All Sections' },
            ...sections.map(s => ({ value: s, label: s })),
          ]}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium uppercase text-text-muted">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-white/[0.08] bg-crystal-surface px-2.5 py-1.5 text-base text-text-secondary outline-none"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Stats Bar ──────────────────────────────────────────────────────────────

function StatsBar({ tasks }: { tasks: RoadmapTask[] }) {
  const total = tasks.length;
  const complete = tasks.filter(t => t.status === 'complete').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  const na = tasks.filter(t => t.status === 'na').length;
  const actionable = total - na;
  const pct = actionable > 0 ? Math.round((complete / actionable) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatCard label="Total Tasks" value={total} />
      <StatCard label="Complete" value={complete} color="text-emerald-400" />
      <StatCard label="In Progress" value={inProgress} color="text-blue-400" />
      <StatCard label="Blocked" value={blocked} color="text-amber-400" />
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="text-sm font-medium uppercase text-text-muted">Progress</div>
        <div className="mt-1 text-2xl font-bold text-text-primary">{pct}%</div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-sm font-medium uppercase text-text-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold', color ?? 'text-text-primary')}>{value}</div>
    </div>
  );
}

// ─── Phase Accordion ────────────────────────────────────────────────────────

function PhaseAccordion({
  phase,
  tasks,
  allTasks,
  expanded,
  onToggle,
  onSelectTask,
}: {
  phase: number;
  tasks: RoadmapTask[];
  allTasks: RoadmapTask[];
  expanded: boolean;
  onToggle: () => void;
  onSelectTask: (task: RoadmapTask) => void;
}) {
  // Group by section
  const sections: [string, RoadmapTask[]][] = useMemo(() => {
    const grouped: Record<string, RoadmapTask[]> = {};
    for (const t of tasks) {
      (grouped[t.section] ??= []).push(t);
    }
    return Object.entries(grouped);
  }, [tasks]);

  const complete = tasks.filter(t => t.status === 'complete').length;
  const actionable = tasks.filter(t => t.status !== 'na').length;
  const phasePct = actionable > 0 ? Math.round((complete / actionable) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-text-primary">
            {PHASE_LABELS[phase] ?? `Phase ${phase}`}
          </div>
          <div className="mt-0.5 text-sm text-text-muted">
            {tasks.length} tasks &middot; {complete}/{actionable} complete
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-medium text-text-secondary">{phasePct}%</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${phasePct}%` }}
            />
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-5 pb-3 pt-2">
              {sections.map(([sectionName, sectionTasks]) => (
                <div key={sectionName} className="mt-2">
                  <div className="mb-1.5 text-sm font-medium uppercase tracking-wider text-text-muted">
                    {sectionName}
                  </div>
                  <div className="space-y-1">
                    {sectionTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        allTasks={allTasks}
                        onClick={() => onSelectTask(task)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({
  task,
  allTasks,
  onClick,
}: {
  task: RoadmapTask;
  allTasks: RoadmapTask[];
  onClick: () => void;
}) {
  // Check if any dependencies are incomplete
  const hasBlockingDeps = (task.depends_on ?? []).some(depId => {
    const dep = allTasks.find(t => t.task_id === depId);
    return dep && dep.status !== 'complete' && dep.status !== 'na';
  });

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/[0.04]"
    >
      {/* Task ID */}
      <span className="w-16 shrink-0 font-mono text-sm font-bold text-text-secondary">
        {task.task_id}
      </span>

      {/* Description */}
      <span className="min-w-0 flex-1 truncate text-base text-text-primary">
        {task.task_description}
      </span>

      {/* Badges */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Dependency indicator */}
        {hasBlockingDeps && (
          <span className="text-amber-400" title="Has incomplete dependencies">
            <Link2 size={12} />
          </span>
        )}

        {/* v3 NEW badge */}
        {task.is_new_v3 && (
          <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
            <Sparkles size={12} /> NEW
          </span>
        )}

        {/* Owner badge */}
        <span className={cn(
          'rounded-full border px-2 py-0.5 text-xs font-medium',
          OWNER_COLORS[task.owner_type],
        )}>
          {OWNER_LABELS[task.owner_type]}
        </span>

        {/* Status badge */}
        <span className={cn(
          'rounded-full border px-2 py-0.5 text-xs font-medium',
          STATUS_COLORS[task.status],
        )}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>
    </button>
  );
}

// ─── Task Detail Drawer ─────────────────────────────────────────────────────

function TaskDetailDrawer({
  task,
  allTasks,
  onClose,
  onStatusChange,
  onNotesChange,
  onEvidenceUploaded,
}: {
  task: RoadmapTask;
  allTasks: RoadmapTask[];
  onClose: () => void;
  onStatusChange: (taskId: string, dbId: string, newStatus: RoadmapStatus, oldStatus: RoadmapStatus) => void;
  onNotesChange: (dbId: string, notes: string) => void;
  onEvidenceUploaded: () => void;
}) {
  const [notes, setNotes] = useState(task.notes ?? '');
  const { log } = useAuditLog();

  const deps = (task.depends_on ?? []).map(depId => allTasks.find(t => t.task_id === depId)).filter(Boolean) as RoadmapTask[];
  const blockedBy = allTasks.filter(t => (t.depends_on ?? []).includes(task.task_id));

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-white/[0.06] bg-crystal-surface shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold text-text-primary">{task.task_id}</span>
            {task.is_new_v3 && (
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                <Sparkles size={12} /> v3 NEW
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-text-muted">{PHASE_LABELS[task.phase]}</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-white/[0.05]">
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Description */}
        <div>
          <div className="text-sm font-medium uppercase text-text-muted">Description</div>
          <div className="mt-1 text-base text-text-primary">{task.task_description}</div>
        </div>

        {/* Section + Owner */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-medium uppercase text-text-muted">Section</div>
            <div className="mt-1 text-base text-text-secondary">{task.section}</div>
          </div>
          <div>
            <div className="text-sm font-medium uppercase text-text-muted">Owner</div>
            <span className={cn(
              'mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium',
              OWNER_COLORS[task.owner_type],
            )}>
              {OWNER_LABELS[task.owner_type]}
            </span>
          </div>
        </div>

        {/* Status dropdown */}
        <div>
          <div className="text-sm font-medium uppercase text-text-muted">Status</div>
          <select
            value={task.status}
            onChange={e => onStatusChange(task.task_id, task.id, e.target.value as RoadmapStatus, task.status)}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-crystal-surface px-3 py-2.5 text-base text-text-secondary outline-none"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="complete">Complete</option>
            <option value="na">N/A</option>
          </select>
        </div>

        {/* Dependencies */}
        {deps.length > 0 && (
          <div>
            <div className="text-sm font-medium uppercase text-text-muted">
              Depends On ({deps.length})
            </div>
            <div className="mt-1 space-y-1">
              {deps.map(dep => (
                <div key={dep.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
                  <span className="font-mono text-sm font-bold text-text-secondary">{dep.task_id}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-muted">{dep.task_description}</span>
                  <span className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                    STATUS_COLORS[dep.status],
                  )}>
                    {STATUS_LABELS[dep.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocked by */}
        {blockedBy.length > 0 && (
          <div>
            <div className="text-sm font-medium uppercase text-text-muted">
              Blocking ({blockedBy.length})
            </div>
            <div className="mt-1 space-y-1">
              {blockedBy.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm text-text-muted">
                  <span className="font-mono font-bold">{t.task_id}</span>
                  <span className="truncate">{t.task_description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <div className="text-sm font-medium uppercase text-text-muted">Notes</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (task.notes ?? '')) {
                onNotesChange(task.id, notes);
              }
            }}
            placeholder="Add notes..."
            rows={3}
            className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-base text-text-secondary outline-none placeholder:text-text-muted"
          />
        </div>

        {/* Evidence */}
        <div>
          <div className="text-sm font-medium uppercase text-text-muted">Evidence</div>
          <div className="mt-1.5">
            {(task.evidence_paths ?? []).length > 0 && (
              <div className="mb-2">
                <SubmissionEvidenceViewer paths={task.evidence_paths!} bucket="other" />
              </div>
            )}
            <EvidenceCaptureUpload
              submissionType="roadmap"
              referenceId={task.id}
              bucket="other"
              pathPrefix="roadmap/"
              onUploaded={(path) => {
                log('roadmap_evidence_upload', { task_id: task.task_id, path }, {
                  module: 'roadmap',
                  tableName: 'roadmap_tasks',
                  recordId: task.id,
                });
                onEvidenceUploaded();
              }}
            />
          </div>
        </div>

        {/* Timestamps */}
        <div className="border-t border-white/[0.04] pt-3 text-sm text-text-muted">
          <div>Created: {new Date(task.created_at).toLocaleString()}</div>
          <div>Updated: {new Date(task.updated_at).toLocaleString()}</div>
          {task.completed_at && (
            <div>Completed: {new Date(task.completed_at).toLocaleString()}</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function RoadmapPage() {
  const navigate = useNavigate();
  const { getEffectiveRole, loading: permissionsLoading } = usePermissions();
  const { tasks, loading, updateStatus, updateNotes, refresh } = useRoadmapTasks();
  const role = getEffectiveRole();

  // Filters
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [sectionFilter, setSectionFilter] = useState('all');

  // Accordion + drawer
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([1]));
  const [selectedTask, setSelectedTask] = useState<RoadmapTask | null>(null);

  // RBAC gate — wait for permissions to load before deciding
  useEffect(() => {
    if (permissionsLoading) return;
    if (!['executive', 'environmental_manager', 'admin', 'site_manager'].includes(role)) {
      navigate('/dashboard', { replace: true });
    }
  }, [role, permissionsLoading, navigate]);

  // Derive unique sections for the current phase filter
  const availableSections = useMemo(() => {
    const filtered = phaseFilter === 'all' ? tasks : tasks.filter(t => t.phase === phaseFilter);
    return [...new Set(filtered.map(t => t.section))].sort();
  }, [tasks, phaseFilter]);

  // Apply all filters
  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (phaseFilter !== 'all' && t.phase !== phaseFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (ownerFilter !== 'all' && t.owner_type !== ownerFilter) return false;
      if (sectionFilter !== 'all' && t.section !== sectionFilter) return false;
      return true;
    });
  }, [tasks, phaseFilter, statusFilter, ownerFilter, sectionFilter]);

  // Group filtered tasks by phase
  const phases: [number, RoadmapTask[]][] = useMemo(() => {
    const grouped: Record<number, RoadmapTask[]> = {};
    for (const t of filtered) {
      (grouped[t.phase] ??= []).push(t);
    }
    return (Object.entries(grouped) as [string, RoadmapTask[]][])
      .map(([k, v]) => [Number(k), v] as [number, RoadmapTask[]])
      .sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  function togglePhase(phase: number) {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-cyan-500/10 p-3">
            <Map className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              Implementation Roadmap
            </h1>
            <p className="mt-0.5 text-base text-text-muted">
              Consent Decree compliance implementation tracker — 5 phases, {tasks.length} tasks
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatsBar tasks={tasks} />

      {/* Filters */}
      <FilterBar
        phase={phaseFilter} setPhase={setPhaseFilter}
        status={statusFilter} setStatus={setStatusFilter}
        owner={ownerFilter} setOwner={setOwnerFilter}
        sections={availableSections} section={sectionFilter} setSection={setSectionFilter}
      />

      {/* Phase Accordions */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        </div>
      ) : phases.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-12 text-center text-sm text-text-muted">
          No tasks match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {phases.map(([phase, phaseTasks]) => (
            <PhaseAccordion
              key={phase}
              phase={phase}
              tasks={phaseTasks}
              allTasks={tasks}
              expanded={expandedPhases.has(phase)}
              onToggle={() => togglePhase(phase)}
              onSelectTask={setSelectedTask}
            />
          ))}
        </div>
      )}

      {/* Task Detail Drawer */}
      <AnimatePresence>
        {selectedTask && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black/40"
              onClick={() => setSelectedTask(null)}
            />
            <TaskDetailDrawer
              task={selectedTask}
              allTasks={tasks}
              onClose={() => setSelectedTask(null)}
              onStatusChange={(taskId, dbId, newStatus, oldStatus) => {
                updateStatus(taskId, dbId, newStatus, oldStatus);
                setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
              }}
              onNotesChange={updateNotes}
              onEvidenceUploaded={refresh}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

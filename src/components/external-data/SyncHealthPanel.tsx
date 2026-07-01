import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { ECHO_STALE_DAYS, type SyncRunRow, type StaleFacilityRow } from '@/hooks/useSyncHealth';

interface Props {
  recentRuns: SyncRunRow[];
  staleFacilities: StaleFacilityRow[];
  staleCount: number;
  lastCompleted: SyncRunRow | null;
  runningRun: SyncRunRow | null;
  failedRuns30d: SyncRunRow[];
  loading: boolean;
  isSyncing: boolean;
  canSync: boolean;
  onSyncNow: () => void;
  onSyncStale: () => void;
}

function formatDuration(started: string, completed: string | null): string {
  if (!completed) return '—';
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function runLabel(run: SyncRunRow): string {
  const meta = run.metadata;
  const tag = typeof meta?.run_tag === 'string' ? meta.run_tag : null;
  if (tag) return tag;
  return run.sync_type === 'scheduled' ? 'Scheduled' : 'Manual';
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === 'completed'
      ? 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20'
      : s === 'running'
        ? 'bg-qo-accent/10 text-qo-accent border-qo-accent/20'
        : 'bg-red-500/10 text-qo-risk border-red-500/20';
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize', cls)}>
      {status}
    </span>
  );
}

export function SyncHealthPanel({
  recentRuns,
  staleFacilities,
  staleCount,
  lastCompleted,
  runningRun,
  failedRuns30d,
  loading,
  isSyncing,
  canSync,
  onSyncNow,
  onSyncStale,
}: Props) {
  const [runsExpanded, setRunsExpanded] = useState(false);
  const [staleExpanded, setStaleExpanded] = useState(false);

  const healthOk = !runningRun && failedRuns30d.length === 0 && staleCount === 0;

  return (
    <section className="space-y-4" aria-labelledby="sync-health-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-qo-accent" />
          <div>
            <h2 id="sync-health-heading" className="text-sm font-semibold text-text-primary">
              ECHO Sync Health
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Weekly cron refreshes permits older than {ECHO_STALE_DAYS} days (up to 5 per run)
            </p>
          </div>
        </div>
        {canSync && (
          <div className="flex flex-wrap items-center gap-2">
            {staleCount > 0 && (
              <button
                type="button"
                onClick={onSyncStale}
                disabled={isSyncing}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                title={`Sync up to 5 permits not refreshed in ${ECHO_STALE_DAYS}+ days`}
              >
                {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Sync stale ({Math.min(staleCount, 5)})
              </button>
            )}
            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg border border-qo-accent/30 bg-qo-accent/10 px-3 py-2 text-xs font-medium text-qo-accent transition-colors hover:bg-qo-accent/20 disabled:opacity-40"
            >
              {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {isSyncing ? 'Syncing…' : 'Full sync'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SpotlightCard
          spotlightColor={healthOk ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.06)'}
          className="p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            {healthOk ? (
              <CheckCircle2 size={14} className="text-qo-sage-text" />
            ) : (
              <AlertTriangle size={14} className="text-qo-ochre-text" />
            )}
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Overall
            </span>
          </div>
          <p className={cn('text-sm font-semibold', healthOk ? 'text-qo-sage-text' : 'text-amber-300')}>
            {runningRun ? 'Sync in progress' : healthOk ? 'Healthy' : 'Needs attention'}
          </p>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-qo-accent" />
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Last success
            </span>
          </div>
          <p className="text-sm font-semibold text-text-primary">
            {loading
              ? '…'
              : lastCompleted?.completed_at
                ? new Date(lastCompleted.completed_at).toLocaleString()
                : 'Never'}
          </p>
          {lastCompleted && (
            <p className="text-[10px] text-text-muted mt-1 font-mono">
              {lastCompleted.records_synced ?? 0} facilities · {runLabel(lastCompleted)}
            </p>
          )}
        </SpotlightCard>

        <SpotlightCard
          spotlightColor={failedRuns30d.length > 0 ? 'rgba(239, 68, 68, 0.06)' : 'rgba(6, 182, 212, 0.06)'}
          className="p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className={failedRuns30d.length > 0 ? 'text-qo-risk' : 'text-qo-accent'} />
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Failed (30d)
            </span>
          </div>
          <p
            className={cn(
              'text-2xl font-bold',
              failedRuns30d.length > 0 ? 'text-qo-risk' : 'text-qo-sage-text',
            )}
          >
            {loading ? '…' : failedRuns30d.length}
          </p>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor={staleCount > 0 ? 'rgba(245, 158, 11, 0.06)' : 'rgba(6, 182, 212, 0.06)'}
          className="p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className={staleCount > 0 ? 'text-qo-ochre-text' : 'text-qo-accent'} />
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Stale permits
            </span>
          </div>
          <p className={cn('text-2xl font-bold', staleCount > 0 ? 'text-qo-ochre-text' : 'text-qo-sage-text')}>
            {loading ? '…' : staleCount}
          </p>
          <p className="text-[10px] text-text-muted mt-1">&gt;{ECHO_STALE_DAYS} days since ECHO refresh</p>
        </SpotlightCard>
      </div>

      {/* Recent runs */}
      <div className="rounded-xl border border-black/[0.08] bg-qo-nested overflow-hidden">
        <button
          type="button"
          onClick={() => setRunsExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-qo-nested transition-colors"
        >
          <span className="text-xs font-semibold text-text-primary">
            Recent sync runs ({recentRuns.length})
          </span>
          {runsExpanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
        </button>
        {runsExpanded && (
          <div className="overflow-x-auto border-t border-black/[0.06]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-black/[0.06]">
                  <th className="text-left py-2 px-3 font-medium">Started</th>
                  <th className="text-left py-2 px-3 font-medium">Run</th>
                  <th className="text-left py-2 px-3 font-medium">Type</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Synced</th>
                  <th className="text-left py-2 px-3 font-medium">Failed</th>
                  <th className="text-left py-2 px-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <SyncRunTableRow key={run.id} run={run} />
                ))}
                {recentRuns.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-text-muted">
                      No ECHO sync runs logged yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stale permits */}
      {staleCount > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] overflow-hidden">
          <button
            type="button"
            onClick={() => setStaleExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs font-semibold text-amber-200/90">
              Stale permits — not refreshed in {ECHO_STALE_DAYS}+ days ({staleCount})
            </span>
            {staleExpanded ? (
              <ChevronDown size={14} className="text-qo-ochre-text/70" />
            ) : (
              <ChevronRight size={14} className="text-qo-ochre-text/70" />
            )}
          </button>
          {staleExpanded && (
            <div className="max-h-48 overflow-y-auto border-t border-amber-500/15 px-4 py-2 space-y-1">
              {staleFacilities.slice(0, 30).map((f) => (
                <div key={f.npdes_id} className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-text-secondary w-8">{f.state_code ?? '—'}</span>
                  <span className="font-mono text-text-primary w-28">{f.npdes_id}</span>
                  <span className="text-text-muted truncate flex-1">{f.facility_name ?? '—'}</span>
                  <span className="text-amber-300/80 whitespace-nowrap">{f.days_stale}d stale</span>
                </div>
              ))}
              {staleCount > 30 && (
                <p className="text-[10px] text-text-muted pt-2">
                  +{staleCount - 30} more — use Sync stale to refresh the oldest batch
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SyncRunTableRow({ run }: { run: SyncRunRow }) {
  const [showErrors, setShowErrors] = useState(false);
  const errors = run.error_details?.errors ?? [];
  const hasErrors = errors.length > 0 || (run.records_failed ?? 0) > 0;

  return (
    <>
      <tr className="border-t border-white/[0.03] hover:bg-qo-nested">
        <td className="py-2 px-3 text-text-muted whitespace-nowrap">
          {new Date(run.started_at).toLocaleString()}
        </td>
        <td className="py-2 px-3 text-text-secondary">{runLabel(run)}</td>
        <td className="py-2 px-3 text-text-muted capitalize">{run.sync_type}</td>
        <td className="py-2 px-3">
          <StatusPill status={run.status} />
        </td>
        <td className="py-2 px-3 font-mono text-text-secondary">{run.records_synced ?? 0}</td>
        <td className="py-2 px-3 font-mono">
          {(run.records_failed ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => setShowErrors((v) => !v)}
              className="text-qo-risk hover:text-red-300 underline-offset-2 hover:underline"
            >
              {run.records_failed}
            </button>
          ) : (
            <span className="text-text-muted">0</span>
          )}
        </td>
        <td className="py-2 px-3 text-text-muted">
          {formatDuration(run.started_at, run.completed_at)}
        </td>
      </tr>
      {showErrors && hasErrors && (
        <tr className="bg-red-500/[0.03]">
          <td colSpan={7} className="px-4 py-2">
            <ul className="text-[10px] text-red-300/90 space-y-0.5 font-mono max-h-24 overflow-y-auto">
              {errors.length > 0
                ? errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)
                : (
                  <li>Sync reported {run.records_failed} failed record(s); see external_sync_log metadata</li>
                )}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

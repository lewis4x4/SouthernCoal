import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2, Clock, Wifi } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  getFieldOutboundQueue,
  dismissOutboundQueueOp,
  dismissOutboundQueueOpsForVisit,
  clearOutboundQueue,
  processFieldOutboundQueue,
  type FieldOutboundOp,
} from '@/lib/fieldOutboundQueue';
import { SpotlightCard } from '@/components/ui/SpotlightCard';

interface SyncLogEntry {
  id: string;
  user_id: string;
  ops_processed: number;
  ops_failed: number;
  ops_held: number;
  held_op_kinds: string[];
  error_message: string | null;
  conflict_hold_reason: string | null;
  synced_at: string;
}

function formatOpKind(kind: FieldOutboundOp['kind']): string {
  switch (kind) {
    case 'field_measurement_insert': return 'Measurement';
    case 'outlet_inspection_upsert': return 'Inspection';
    case 'field_visit_start': return 'Visit Start';
    case 'field_visit_complete': return 'Visit Complete';
    case 'coc_primary_upsert': return 'COC Container';
    default: return kind;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function SyncQueuePage() {
  const { profile } = useUserProfile();
  const { log: auditLog } = useAuditLog();
  const [queue, setQueue] = useState<FieldOutboundOp[]>([]);
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [flushing, setFlushing] = useState(false);

  const organizationId = profile?.organization_id ?? null;

  const refreshQueue = useCallback(() => {
    setQueue(getFieldOutboundQueue());
  }, []);

  const loadSyncLog = useCallback(async () => {
    if (!organizationId) return;
    setLoadingLog(true);
    const { data, error } = await supabase
      .from('field_outbound_sync_log')
      .select('*')
      .eq('organization_id', organizationId)
      .order('synced_at', { ascending: false })
      .limit(50);

    if (error) {
      toast.error(`Failed to load sync log: ${error.message}`);
    } else {
      setSyncLog((data ?? []) as SyncLogEntry[]);
    }
    setLoadingLog(false);
  }, [organizationId]);

  useEffect(() => {
    refreshQueue();
    loadSyncLog();
  }, [refreshQueue, loadSyncLog]);

  const handleFlush = useCallback(async () => {
    setFlushing(true);
    try {
      const result = await processFieldOutboundQueue(supabase);
      if (result.processed > 0) {
        toast.success(`Synced ${result.processed} operation(s)`);
      }
      if (result.failed) {
        toast.error(`Sync error: ${result.failed.message}`);
      }
      if (!result.failed && result.processed === 0) {
        toast.info('No operations to sync');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setFlushing(false);
      refreshQueue();
      loadSyncLog();
    }
  }, [refreshQueue, loadSyncLog]);

  const handleDismissOp = useCallback(async (op: FieldOutboundOp) => {
    const ok = await dismissOutboundQueueOp(op.id);
    if (ok) {
      auditLog('sync_queue_op_dismissed', {
        op_id: op.id,
        op_kind: op.kind,
        visit_id: op.visitId,
      }, {
        module: 'field_ops',
        tableName: 'field_outbound_queue',
        recordId: op.visitId,
      });
      toast.success(`Dismissed ${formatOpKind(op.kind)} operation`);
      refreshQueue();
    } else {
      toast.error('Failed to dismiss operation');
    }
  }, [auditLog, refreshQueue]);

  const handleDismissVisit = useCallback(async (visitId: string) => {
    const removed = await dismissOutboundQueueOpsForVisit(visitId);
    if (removed > 0) {
      auditLog('sync_queue_op_dismissed', {
        visit_id: visitId,
        ops_removed: removed,
        action: 'dismiss_all_for_visit',
      }, {
        module: 'field_ops',
        tableName: 'field_outbound_queue',
        recordId: visitId,
      });
      toast.success(`Dismissed ${removed} operation(s) for visit`);
      refreshQueue();
    }
  }, [auditLog, refreshQueue]);

  const handleClearAll = useCallback(async () => {
    if (!confirm('Clear ALL queued operations? This cannot be undone. Only do this if you have confirmed the server state is correct.')) {
      return;
    }
    const cleared = await clearOutboundQueue();
    auditLog('sync_queue_cleared', { ops_cleared: cleared }, {
      module: 'field_ops',
      tableName: 'field_outbound_queue',
    });
    toast.success(`Cleared ${cleared} operation(s) from queue`);
    refreshQueue();
  }, [auditLog, refreshQueue]);

  // Group queue ops by visit
  const opsByVisit = queue.reduce<Record<string, FieldOutboundOp[]>>((acc, op) => {
    const key = op.visitId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(op);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="inline-flex rounded-xl bg-amber-500/10 p-2.5">
            <Wifi className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Sync Queue
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Manage offline field operations pending sync. Dismiss stuck operations or force retry.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshQueue}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-text-secondary hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={handleFlush}
            disabled={flushing || queue.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${flushing ? 'animate-spin' : ''}`} />
            {flushing ? 'Syncing…' : 'Force Sync'}
          </button>
        </div>
      </div>

      {/* Queue Status Card */}
      <SpotlightCard
        spotlightColor={queue.length > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)'}
        className="p-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {queue.length > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            )}
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {queue.length === 0
                  ? 'Queue Empty — All synced'
                  : `${queue.length} operation${queue.length !== 1 ? 's' : ''} pending`}
              </p>
              <p className="text-xs text-text-muted">
                {queue.length > 0
                  ? `Across ${Object.keys(opsByVisit).length} visit(s)`
                  : 'No offline operations waiting'}
              </p>
            </div>
          </div>
          {queue.length > 0 && (
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </button>
          )}
        </div>
      </SpotlightCard>

      {/* Queued Operations by Visit */}
      {Object.entries(opsByVisit).map(([visitId, ops]) => (
        <SpotlightCard key={visitId} spotlightColor="rgba(168, 85, 247, 0.06)" className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-mono text-text-muted">Visit {visitId.slice(0, 8)}…</p>
              <p className="text-sm font-semibold text-text-primary">{ops.length} queued op(s)</p>
            </div>
            <button
              onClick={() => handleDismissVisit(visitId)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-text-muted hover:bg-white/10 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Dismiss All
            </button>
          </div>
          <div className="space-y-2">
            {ops.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-mono text-text-secondary">
                    {formatOpKind(op.kind)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-text-muted">
                    <Clock className="h-3 w-3" />
                    {timeAgo(op.enqueuedAt)}
                  </span>
                </div>
                <button
                  onClick={() => handleDismissOp(op)}
                  className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Dismiss this operation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </SpotlightCard>
      ))}

      {/* Server Sync Log */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Sync History</h2>
        {loadingLog ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : syncLog.length === 0 ? (
          <p className="text-sm text-text-muted py-4">No sync events recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {syncLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {entry.ops_failed > 0 || entry.ops_held > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                  <div>
                    <p className="text-sm text-text-primary">
                      {entry.ops_processed} synced
                      {entry.ops_failed > 0 && <span className="text-red-400 ml-2">{entry.ops_failed} failed</span>}
                      {entry.ops_held > 0 && <span className="text-amber-400 ml-2">{entry.ops_held} held</span>}
                    </p>
                    {entry.error_message && (
                      <p className="text-xs text-red-400/80 mt-0.5 truncate max-w-md">{entry.error_message}</p>
                    )}
                    {entry.conflict_hold_reason && (
                      <p className="text-xs text-amber-400/80 mt-0.5">Hold: {entry.conflict_hold_reason}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-text-muted">{timeAgo(entry.synced_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SyncQueuePage;

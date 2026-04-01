import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ImageOff, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { FieldEvidenceDraftSyncFailure } from '@/lib/fieldEvidenceDrafts';
import type { OutboundQueueFlushDiagnostic } from '@/lib/fieldOutboundQueueDiagnostic';

function humanizeOutboundOpKind(kind: string): string {
  const labels: Record<string, string> = {
    field_measurement_insert: 'Field measurement',
    outlet_inspection_upsert: 'Outlet inspection',
    field_visit_start: 'Visit start',
    coc_primary_upsert: 'Chain of custody (container)',
    field_visit_complete: 'Visit completion',
  };
  return labels[kind] ?? kind.replace(/_/g, ' ');
}

type Props = {
  /** True while server fetch for this surface is in flight */
  loading: boolean;
  lastSyncedAt: Date | null;
  onRefresh: () => Promise<{ success: boolean }>;
  /** Phase 4: outbound action queue (localStorage) + offline evidence drafts (IndexedDB) not yet uploaded */
  pendingOutboundCount?: number;
  /** Phase 4: first op that failed during last flush (from `processFieldOutboundQueue`) */
  queueFlushDiagnostic?: OutboundQueueFlushDiagnostic | null;
  onDismissQueueFlushDiagnostic?: () => void;
  /** Logged after a successful Refresh (fire-and-forget); identifies which field screen triggered sync. */
  auditRefreshPayload?: Record<string, unknown>;
  /** Visit-scoped: offline evidence drafts that failed to upload (shown with queue diagnostics — M2 single surface). */
  evidenceSyncFailures?: readonly Pick<
    FieldEvidenceDraftSyncFailure,
    'draftId' | 'fileName' | 'message'
  >[];
  onRetryEvidenceSync?: () => void;
  onDismissEvidenceFailures?: () => void;
};

/**
 * Phase 3 sync visibility: browser online/offline, last successful load time, manual refresh.
 */
export function FieldDataSyncBar({
  loading,
  lastSyncedAt,
  onRefresh,
  pendingOutboundCount = 0,
  queueFlushDiagnostic = null,
  onDismissQueueFlushDiagnostic,
  auditRefreshPayload,
  evidenceSyncFailures = [],
  onRetryEvidenceSync,
  onDismissEvidenceFailures,
}: Props) {
  const { log } = useAuditLog();
  const [manualBusy, setManualBusy] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setManualBusy(true);
    try {
      const result = await onRefresh();
      if (result.success && auditRefreshPayload) {
        log('field_sync_manual_refresh', auditRefreshPayload, {
          module: 'field_operations',
          tableName: 'field_visits',
        });
      }
    } catch (err) {
      console.error('[FieldDataSyncBar] refresh failed', err);
      toast.error(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setManualBusy(false);
    }
  }, [auditRefreshPayload, log, onRefresh]);

  const busy = loading || manualBusy;
  const timeLabel = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  const pendingLabel =
    pendingOutboundCount > 0
      ? `${pendingOutboundCount} pending upload${pendingOutboundCount === 1 ? '' : 's'} (actions and/or offline photos). `
      : '';

  const statusText = online
    ? `${pendingLabel}Online. Last updated ${timeLabel}${busy ? ', syncing' : ''}.`
    : `${pendingLabel}Offline, data may be stale. Last updated ${timeLabel}${busy ? ', syncing' : ''}.`;

  const hasEvidenceFailures = evidenceSyncFailures.length > 0;

  return (
    <div id="field-sync-health" className="scroll-mt-24 space-y-3">
      {queueFlushDiagnostic ? (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-red-100">
              {queueFlushDiagnostic.conflictHold
                ? 'Field sync conflict — queue on hold'
                : 'Field upload queue blocked'}
            </p>
            <p className="text-xs text-red-200/90">
              <span className="font-semibold">{humanizeOutboundOpKind(queueFlushDiagnostic.opKind)}</span>
              <span className="text-red-200/70"> · op </span>
              <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-[11px] text-red-100/95">
                {queueFlushDiagnostic.opKind}
              </code>
            </p>
            <p className="text-xs text-red-200/85">
              Visit ID:{' '}
              {queueFlushDiagnostic.visitId !== '—' ? (
                <Link
                  to={`/field/visits/${queueFlushDiagnostic.visitId}`}
                  className="font-mono text-[11px] text-amber-200 underline decoration-amber-200/40 underline-offset-2 hover:text-amber-100"
                >
                  {queueFlushDiagnostic.visitId}
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </p>
            <p className="text-xs text-text-muted">{queueFlushDiagnostic.message}</p>
          </div>
          {onDismissQueueFlushDiagnostic ? (
            <button
              type="button"
              onClick={onDismissQueueFlushDiagnostic}
              className="shrink-0 rounded-lg border border-white/[0.12] bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-white/[0.1]"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      {hasEvidenceFailures ? (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-4 py-3 text-sm"
        >
          <ImageOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-rose-100">Photo or file upload needs a retry</p>
            <p className="text-xs text-rose-200/85">
              Evidence drafts are still on this device. Stay online, then retry or use Refresh below.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-text-secondary">
              {evidenceSyncFailures.map((f) => (
                <li key={f.draftId}>
                  <span className="font-medium text-text-primary">{f.fileName}</span>
                  <span className="text-text-muted"> — {f.message}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start">
            {onRetryEvidenceSync ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRetryEvidenceSync()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/35 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-50 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${busy ? 'animate-spin' : ''}`} aria-hidden />
                Retry uploads
              </button>
            ) : null}
            {onDismissEvidenceFailures ? (
              <button
                type="button"
                onClick={onDismissEvidenceFailures}
                className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.1]"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm"
        aria-busy={busy}
      >
      <div className="flex flex-wrap items-center gap-3 text-text-secondary">
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {statusText}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 ${online ? 'text-emerald-200/90' : 'text-amber-200'}`}
          aria-hidden
        >
          {online ? (
            <Wifi className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {online ? 'Online' : 'Offline — shown data may be stale'}
        </span>
        <span className="text-text-muted" aria-hidden>
          {pendingOutboundCount > 0 ? (
            <span className="mr-2 font-medium text-amber-200/95">
              {pendingOutboundCount} pending (queue + device photos)
            </span>
          ) : null}
          Last updated{' '}
          <span className="font-medium text-text-primary">{timeLabel}</span>
          {busy ? ' (syncing…)' : ''}
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label="Refresh field data from server"
        aria-busy={busy}
        onClick={() => void handleRefresh()}
        className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${busy ? 'animate-spin' : ''}`} aria-hidden />
        Refresh
      </button>
      </div>
    </div>
  );
}

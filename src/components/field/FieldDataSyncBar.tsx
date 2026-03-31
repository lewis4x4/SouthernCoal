import { useEffect, useState } from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

type Props = {
  /** True while server fetch for this surface is in flight */
  loading: boolean;
  onRefresh: () => Promise<void>;
  /** Field mutations waiting to upload after reconnect (Phase 4 outbound queue) */
  pendingOutboundCount?: number;
};

/**
 * Phase 3 sync visibility: browser online/offline, last successful load time, manual refresh.
 */
export function FieldDataSyncBar({ loading, onRefresh, pendingOutboundCount = 0 }: Props) {
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
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

  useEffect(() => {
    if (!loading && !manualBusy) {
      setLastSyncedAt(new Date());
    }
  }, [loading, manualBusy]);

  async function handleRefresh() {
    setManualBusy(true);
    try {
      await onRefresh();
    } catch (err) {
      console.error('[FieldDataSyncBar] refresh failed', err);
    } finally {
      setManualBusy(false);
    }
  }

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
      ? `${pendingOutboundCount} field ${pendingOutboundCount === 1 ? 'entry' : 'entries'} waiting to upload. `
      : '';

  const statusText = online
    ? `${pendingLabel}Online. Last updated ${timeLabel}${busy ? ', syncing' : ''}.`
    : `${pendingLabel}Offline, data may be stale. Last updated ${timeLabel}${busy ? ', syncing' : ''}.`;

  return (
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
              {pendingOutboundCount} pending upload{pendingOutboundCount === 1 ? '' : 's'}
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
  );
}

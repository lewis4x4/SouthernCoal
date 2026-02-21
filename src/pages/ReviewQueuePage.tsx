import { ShieldAlert, RefreshCw, Loader2 } from 'lucide-react';
import { DiscrepancySummaryCards } from '@/components/review-queue/DiscrepancySummaryCards';
import { DiscrepancyTable } from '@/components/review-queue/DiscrepancyTable';
import { DiscrepancyDetailPanel } from '@/components/review-queue/DiscrepancyDetailPanel';
import { useDiscrepancies } from '@/hooks/useDiscrepancies';
import { useSyncTrigger } from '@/hooks/useSyncTrigger';
import { useReviewQueueStore } from '@/stores/reviewQueue';
import { usePermissions } from '@/hooks/usePermissions';

export function ReviewQueuePage() {
  const { rows, loading, error, counts, refetch, updateStatus } = useDiscrepancies();
  const { syncing, triggerEchoSync } = useSyncTrigger();
  const { selectedId, setSelectedId } = useReviewQueueStore();
  const { getEffectiveRole } = usePermissions();

  const role = getEffectiveRole();
  const canTriage = role === 'environmental_manager' || role === 'executive' || role === 'admin';

  const selectedRow = selectedId ? rows.find((r) => r.id === selectedId) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-cyan-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Review Queue</h1>
            <p className="text-xs text-text-muted">
              Cross-validation discrepancies between internal records and public compliance data
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06] disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>

          {canTriage && (
            <button
              onClick={triggerEchoSync}
              disabled={syncing.echo}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
            >
              {syncing.echo ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync ECHO
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4">
          <p className="text-sm text-text-primary">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      <DiscrepancySummaryCards counts={counts} loading={loading} />

      {/* Loading */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
          <span className="ml-3 text-sm text-text-secondary">Loading discrepancies...</span>
        </div>
      ) : (
        <DiscrepancyTable rows={rows} onSelect={setSelectedId} />
      )}

      {/* Detail panel */}
      {selectedRow && (
        <DiscrepancyDetailPanel
          discrepancy={selectedRow}
          onClose={() => setSelectedId(null)}
          onAction={updateStatus}
        />
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-text-muted text-center">
        Public data may be delayed 30-90 days. Discrepancies are for review only — not alerts.
      </p>
    </div>
  );
}

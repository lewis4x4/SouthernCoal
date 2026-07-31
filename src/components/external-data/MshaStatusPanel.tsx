import { RefreshCw, HardHat, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useExternalData } from '@/hooks/useExternalData';
import type { MshaMapStatus } from '@/hooks/useMshaMapStatus';

interface Props {
  mineId?: string;
  mapStatus?: MshaMapStatus | null;
  mapLoading?: boolean;
  refreshingMap?: boolean;
  canRefreshMap?: boolean;
  onRefreshMap?: () => void;
}

export function MshaStatusPanel({
  mineId,
  mapStatus,
  mapLoading = false,
  refreshingMap = false,
  canRefreshMap = false,
  onRefreshMap,
}: Props) {
  const { mshaInspections, mshaLoading, refetchMsha } = useExternalData(undefined, mineId);

  const hasDerivedMap = mapStatus != null;
  const configured = !!mineId || hasDerivedMap;
  const hasData = mshaInspections.length > 0;
  const isRefreshing = mineId ? mshaLoading : refreshingMap;
  const canRefresh = mineId ? configured : configured && canRefreshMap && !!onRefreshMap;
  const statusLabel = mineId
    ?? (mapLoading ? 'Checking derived map' : hasDerivedMap
      ? `${mapStatus?.active_mines ?? 0} mapped mines`
      : 'Not configured');

  function handleRefresh() {
    if (mineId) {
      void refetchMsha();
      return;
    }
    onRefreshMap?.();
  }

  return (
    <SpotlightCard spotlightColor="rgba(234, 179, 8, 0.06)" className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">MSHA</h3>
          <p className="text-[10px] text-text-muted mt-0.5">
            {statusLabel}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || !canRefresh}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-secondary disabled:opacity-40"
          title={mineId ? 'Refresh MSHA data' : canRefreshMap ? 'Refresh derived MSHA map' : 'Requires bulk_process permission'}
        >
          {isRefreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {mapLoading && !mineId ? (
        <div className="py-6 text-center space-y-2">
          <Loader2 size={20} className="mx-auto animate-spin text-text-muted" />
          <p className="text-xs text-text-muted">Checking MSHA map coverage...</p>
        </div>
      ) : !configured ? (
        <div className="py-6 text-center space-y-2">
          <HardHat size={24} className="mx-auto text-text-muted" />
          <p className="text-xs text-text-muted">
            MSHA integration requires mine ID configuration.
          </p>
          <p className="text-[10px] text-text-muted">
            Contact admin to set up MSHA mine ID mapping.
          </p>
        </div>
      ) : !mineId && hasDerivedMap ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-text-muted">Mines</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {mapStatus?.active_mines ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-text-muted">Orgs</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {mapStatus?.active_orgs ?? 0}
            </p>
          </div>
          <div className="rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-text-muted">Review</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {mapStatus?.review_mines ?? 0}
            </p>
          </div>
        </div>
      ) : !hasData ? (
        <p className="text-xs text-text-muted py-4 text-center">
          {mshaLoading ? 'Loading...' : 'No MSHA data synced for this mine'}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
            Recent Inspections
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {mshaInspections.slice(0, 10).map((insp) => (
              <div
                key={insp.id}
                className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2"
              >
                <div>
                  <p className="text-xs text-text-primary">
                    {insp.inspection_type || 'Inspection'}
                    {insp.significant_substantial && (
                      <span className="ml-1 rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[9px] text-qo-risk font-medium">
                        S&S
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {insp.inspection_date
                      ? new Date(insp.inspection_date).toLocaleDateString()
                      : '—'}
                    {insp.violation_number && ` · Violation ${insp.violation_number}`}
                  </p>
                </div>
                {insp.proposed_penalty != null && insp.proposed_penalty > 0 && (
                  <span className={cn(
                    'text-xs font-mono',
                    insp.proposed_penalty > 5000 ? 'text-qo-risk' : 'text-qo-ochre-text',
                  )}>
                    ${insp.proposed_penalty.toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-black/[0.06] flex items-center justify-between">
        {hasData && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock size={10} />
            Last synced {new Date(mshaInspections[0]!.synced_at).toLocaleDateString()}
          </div>
        )}
        {!mineId && hasDerivedMap && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock size={10} />
            Last map{' '}
            {mapStatus?.last_reconcile || mapStatus?.last_refresh
              ? new Date(mapStatus.last_reconcile ?? mapStatus.last_refresh!).toLocaleDateString()
              : 'pending'}
          </div>
        )}
        <p className="text-[9px] text-text-muted italic">
          MSHA data published weekly (Fridays)
        </p>
      </div>
    </SpotlightCard>
  );
}

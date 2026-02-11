import { RefreshCw, HardHat, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useExternalData } from '@/hooks/useExternalData';

interface Props {
  mineId?: string;
}

export function MshaStatusPanel({ mineId }: Props) {
  const { mshaInspections, loading, refetchMsha } = useExternalData(undefined, mineId);

  const configured = !!mineId;
  const hasData = mshaInspections.length > 0;

  return (
    <SpotlightCard spotlightColor="rgba(234, 179, 8, 0.06)" className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">MSHA</h3>
          <p className="text-[10px] text-text-muted mt-0.5">
            {mineId || 'Not configured'}
          </p>
        </div>
        <button
          onClick={refetchMsha}
          disabled={loading || !configured}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-secondary disabled:opacity-40"
          title="Refresh MSHA data"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {!configured ? (
        <div className="py-6 text-center space-y-2">
          <HardHat size={24} className="mx-auto text-text-muted" />
          <p className="text-xs text-text-muted">
            MSHA integration requires mine ID configuration.
          </p>
          <p className="text-[10px] text-text-muted">
            Contact admin to set up MSHA mine ID mapping.
          </p>
        </div>
      ) : !hasData ? (
        <p className="text-xs text-text-muted py-4 text-center">
          {loading ? 'Loading...' : 'No MSHA data synced for this mine'}
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
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div>
                  <p className="text-xs text-text-primary">
                    {insp.inspection_type || 'Inspection'}
                    {insp.significant_substantial && (
                      <span className="ml-1 rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[9px] text-red-400 font-medium">
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
                    insp.proposed_penalty > 5000 ? 'text-red-400' : 'text-amber-400',
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
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
        {hasData && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock size={10} />
            Last synced {new Date(mshaInspections[0]!.synced_at).toLocaleDateString()}
          </div>
        )}
        <p className="text-[9px] text-text-muted italic">
          MSHA data published weekly (Fridays)
        </p>
      </div>
    </SpotlightCard>
  );
}

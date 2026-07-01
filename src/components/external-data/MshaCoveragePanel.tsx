import { AlertTriangle, HardHat, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { MshaStatusPanel } from '@/components/external-data/MshaStatusPanel';
import { useMshaAbatement } from '@/hooks/useMshaAbatement';
import { useSyncTrigger } from '@/hooks/useSyncTrigger';

/**
 * MSHA sync + abatement countdown surface.
 * Mine IDs come from the MSHA_MINE_ID_MAP Edge Function secret until Tom Lusk's map is loaded in-app.
 */
export function MshaCoveragePanel() {
  const { rows, loading, refetch } = useMshaAbatement();
  const { syncing, triggerMshaSync } = useSyncTrigger();
  const isSyncing = syncing.msha ?? false;

  async function handleSync() {
    await triggerMshaSync();
    await refetch();
  }

  const overdue = rows.filter((r) => r.urgency === 'overdue');
  const dueSoon = rows.filter((r) => r.urgency === 'due_soon');

  return (
    <section className="space-y-4" aria-labelledby="msha-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardHat size={18} className="text-amber-400" />
          <div>
            <h2 id="msha-heading" className="text-sm font-semibold text-text-primary">
              MSHA Sync &amp; Abatement Clocks
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Weekly OGD violations feed · DRAFT operational aid — verify with counsel
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={isSyncing}
          className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
        >
          {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {isSyncing ? 'Syncing MSHA…' : 'Sync MSHA now'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MshaStatusPanel />

        <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.06)" className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-text-primary">Abatement at risk</h3>
          </div>
          <p className="text-[10px] text-text-muted mb-3">
            Open citations with abatement due overdue or within 14 days
          </p>

          {loading ? (
            <Loader2 className="mx-auto animate-spin text-text-muted" size={18} />
          ) : rows.length === 0 ? (
            <p className="text-xs text-text-muted py-4 text-center">
              No abatement clocks in range — sync MSHA data or configure mine IDs.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {rows.slice(0, 12).map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-primary">
                      Mine {row.mine_id}
                      {row.significant_substantial && (
                        <span className="ml-1 rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[9px] text-red-400">
                          S&amp;S
                        </span>
                      )}
                    </p>
                    <span
                      className={cn(
                        'text-[10px] font-medium uppercase',
                        row.urgency === 'overdue' ? 'text-red-400' : 'text-amber-400',
                      )}
                    >
                      {row.urgency === 'overdue' ? 'Overdue' : 'Due soon'}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Violation {row.violation_number ?? '—'} · Abate by{' '}
                    {new Date(row.abatement_due_date).toLocaleDateString()} ({row.days_until_due}d)
                  </p>
                </div>
              ))}
            </div>
          )}

          {(overdue.length > 0 || dueSoon.length > 0) && (
            <p className="mt-3 text-[10px] text-text-muted border-t border-white/[0.06] pt-3">
              {overdue.length} overdue · {dueSoon.length} due within 14 days
            </p>
          )}
        </SpotlightCard>
      </div>
    </section>
  );
}

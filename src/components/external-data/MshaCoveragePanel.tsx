import { AlertTriangle, HardHat, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { MshaStatusPanel } from '@/components/external-data/MshaStatusPanel';
import { useMshaAbatement } from '@/hooks/useMshaAbatement';
import { useStatutoryAlertAcks } from '@/hooks/useStatutoryAlertAcks';
import { useMshaMapStatus } from '@/hooks/useMshaMapStatus';
import { useSyncTrigger } from '@/hooks/useSyncTrigger';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { StatutoryAckButton } from '@/components/compliance/StatutoryAckButton';

export function MshaCoveragePanel() {
  const { status, drift, reviewMines, loading, refreshing, error, refreshMap } = useMshaMapStatus();
  const { rows, alerts, loading: abatementLoading, detecting, refetch: refetchAbatement, runAbatementDetection } = useMshaAbatement();
  const statutoryAcks = useStatutoryAlertAcks();
  const { syncing, triggerMshaSync } = useSyncTrigger();
  const { can } = usePermissions();
  const { log } = useAuditLog();
  const canSync = can('bulk_process');
  const isSyncing = syncing.msha ?? false;

  async function handleSyncViolations() {
    if (!canSync) return;
    await triggerMshaSync();
    log('msha_sync_manual_trigger', {}, { module: 'external_data', tableName: 'external_sync_log' });
    await refetchAbatement();
  }

  async function handleRefreshMap() {
    if (!canSync) return;
    await refreshMap('refresh');
  }

  async function handleAbatementDetection() {
    if (!canSync) return;
    await runAbatementDetection();
  }

  const overdue = rows.filter((r) => r.urgency === 'overdue');
  const dueSoon = rows.filter((r) => r.urgency === 'due_soon');
  const driftSummary = drift?.summary as Record<string, unknown> | undefined;

  return (
    <section className="space-y-4" aria-labelledby="msha-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardHat size={18} className="text-qo-ochre-text" />
          <div>
            <h2 id="msha-heading" className="text-sm font-semibold text-text-primary">
              MSHA Sync &amp; Abatement Clocks
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Derived mine→org map · DRAFT operational aid — verify with counsel
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshMap()}
            disabled={refreshing || !canSync}
            title={canSync ? 'Refresh derived mine→org map' : 'Requires bulk_process permission'}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.12] px-3 py-2 text-xs font-medium text-text-primary hover:bg-black/[0.05] disabled:opacity-40"
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh map
          </button>
          <button
            type="button"
            onClick={() => void handleSyncViolations()}
            disabled={isSyncing || !canSync}
            title={canSync ? 'Pull MSHA violations for configured mine IDs' : 'Requires bulk_process permission'}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"
          >
            {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync violations
          </button>
          <button
            type="button"
            onClick={() => void handleAbatementDetection()}
            disabled={detecting || !canSync}
            title={canSync ? 'Run abatement-clock detection' : 'Requires bulk_process permission'}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.12] px-3 py-2 text-xs font-medium text-text-primary hover:bg-black/[0.05] disabled:opacity-40"
          >
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Run abatement detection
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.06)" className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Active mines</p>
          <p className="text-xl font-semibold text-text-primary tabular-nums">
            {loading ? '—' : status?.active_mines ?? 0}
          </p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.06)" className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Mapped orgs</p>
          <p className="text-xl font-semibold text-text-primary tabular-nums">
            {loading ? '—' : status?.active_orgs ?? 0}
          </p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(239, 68, 68, 0.06)" className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Review queue</p>
          <p className="text-xl font-semibold text-text-primary tabular-nums">
            {loading ? '—' : status?.review_mines ?? 0}
          </p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.06)" className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Last reconcile</p>
          <p className="text-xs font-medium text-text-primary mt-1">
            {status?.last_reconcile
              ? new Date(status.last_reconcile).toLocaleString()
              : 'Not yet run'}
          </p>
        </SpotlightCard>
      </div>

      {driftSummary && (
        <div className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-[10px] text-text-muted">
          Latest {drift?.run_type}: {String(driftSummary.mapped ?? '—')} mapped ·{' '}
          {String(driftSummary.review ?? '—')} review ·{' '}
          {String(driftSummary.deactivated ?? '—')} deactivated
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MshaStatusPanel />

        <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.06)" className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-qo-ochre-text" />
            <h3 className="text-sm font-semibold text-text-primary">Abatement at risk</h3>
          </div>
          {alerts.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">
                Open alerts ({alerts.length}) — coupled work orders
              </p>
              {alerts.slice(0, 6).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-primary">
                      Mine {alert.mine_id} · {alert.violation_number}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      Due {new Date(alert.abatement_due_date).toLocaleDateString()}
                      {alert.significant_substantial ? ' · S&S' : ''}
                    </p>
                  </div>
                  {alert.work_order_id && (
                    <Link
                      to={`/work-orders?highlight=${alert.work_order_id}`}
                      className="shrink-0 text-[10px] font-medium text-qo-accent hover:underline"
                    >
                      Work order
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
          {abatementLoading ? (
            <Loader2 className="mx-auto animate-spin text-text-muted" size={18} />
          ) : rows.length === 0 ? (
            <p className="text-xs text-text-muted py-4 text-center">
              No abatement clocks in range — sync violations after map refresh.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {rows.slice(0, 12).map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-text-primary">Mine {row.mine_id}</p>
                    <span
                      className={cn(
                        'text-[10px] font-medium uppercase',
                        row.urgency === 'overdue' ? 'text-qo-risk' : 'text-qo-ochre-text',
                      )}
                    >
                      {row.urgency === 'overdue' ? 'Overdue' : 'Due soon'}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Violation {row.violation_number ?? '—'} · Abate by{' '}
                    {new Date(row.abatement_due_date).toLocaleDateString()}
                  </p>
                  <div className="mt-2">
                    <StatutoryAckButton
                      needsAck={statutoryAcks.isUnacknowledged('msha_abatement', row.id)}
                      onAck={() => statutoryAcks.acknowledge('msha_abatement', row.id)}
                      acknowledging={statutoryAcks.isAcknowledging('msha_abatement', row.id)}
                      loading={statutoryAcks.loading}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {(overdue.length > 0 || dueSoon.length > 0) && (
            <p className="mt-3 text-[10px] text-text-muted border-t border-black/[0.06] pt-3">
              {overdue.length} overdue · {dueSoon.length} due within 14 days
            </p>
          )}
        </SpotlightCard>
      </div>

      {reviewMines.length > 0 && (
        <SpotlightCard spotlightColor="rgba(239, 68, 68, 0.04)" className="p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            Review queue (Justice controller, unresolved operator)
          </h3>
          <p className="text-[10px] text-text-muted mb-3">
            Assign via <code className="text-text-secondary">msha_mine_org_override</code> — never guessed.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[10px]">
              <thead className="text-text-muted uppercase">
                <tr>
                  <th className="py-1 pr-3">Mine ID</th>
                  <th className="py-1 pr-3">Operator</th>
                  <th className="py-1 pr-3">State</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {reviewMines.map((mine) => (
                  <tr key={mine.mine_id} className="border-t border-black/[0.06]">
                    <td className="py-1.5 pr-3 font-mono">{mine.mine_id}</td>
                    <td className="py-1.5 pr-3">{mine.operator_name}</td>
                    <td className="py-1.5 pr-3">{mine.state}</td>
                    <td className="py-1.5">{mine.mine_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SpotlightCard>
      )}
    </section>
  );
}

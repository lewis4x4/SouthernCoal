import { useMemo } from 'react';
import { useReviewerProfiles } from '@/hooks/useReviewerProfiles';
import { ShieldAlert, RefreshCw, Loader2, ListFilter, CheckCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { DiscrepancySummaryCards } from '@/components/review-queue/DiscrepancySummaryCards';
import { DiscrepancyTable } from '@/components/review-queue/DiscrepancyTable';
import { DiscrepancyDetailPanel } from '@/components/review-queue/DiscrepancyDetailPanel';
import { useDiscrepancies } from '@/hooks/useDiscrepancies';
import { useSyncTrigger } from '@/hooks/useSyncTrigger';
import { useDiscrepancyDetection } from '@/hooks/useDiscrepancyDetection';
import { useComplianceAlerts } from '@/hooks/useComplianceAlerts';
import { ComplianceAlertRulesPanel } from '@/components/review-queue/ComplianceAlertRulesPanel';
import { useReviewQueueStore } from '@/stores/reviewQueue';
import { usePermissions } from '@/hooks/usePermissions';
import type { DiscrepancySeverity } from '@/stores/reviewQueue';

export function ReviewQueuePage() {
  const {
    rows,
    loading,
    error,
    counts,
    pendingCount,
    escalatedCount,
    refetch,
    updateStatus,
    bulkMarkReviewed,
  } = useDiscrepancies();
  const { syncing, triggerEchoSync } = useSyncTrigger();
  const { running: detecting, runDetection } = useDiscrepancyDetection();
  const { dispatching: alerting, dispatchDryRun, dispatchDigest } = useComplianceAlerts();
  const { selectedId, setSelectedId, filters, setFilters, clearFilters } = useReviewQueueStore();
  const { can } = usePermissions();
  const canRunEchoSync = can('bulk_process');
  const canTriage = can('verify');

  const reviewerIds = useMemo(
    () => rows.map((r) => r.reviewed_by).filter((id): id is string => Boolean(id)),
    [rows],
  );
  const reviewerNames = useReviewerProfiles(reviewerIds);

  const filteredPendingIds = useMemo(() => {
    return rows
      .filter((r) => {
        if (r.status !== 'pending') return false;
        if (filters.severity && r.severity !== filters.severity) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (filters.source && r.source !== filters.source) return false;
        if (filters.type && r.discrepancy_type !== filters.type) return false;
        return true;
      })
      .map((r) => r.id);
  }, [rows, filters]);

  async function handleRunDetection() {
    const result = await runDetection();
    if (result?.success) {
      setFilters({ status: 'pending' });
      await refetch();
    }
  }

  function handleSeverityClick(severity: DiscrepancySeverity) {
    setFilters({
      ...filters,
      severity: filters.severity === severity ? undefined : severity,
    });
  }

  function showPendingOnly() {
    setFilters({ ...filters, status: 'pending' });
  }

  async function handleQuickReview(id: string) {
    const err = await updateStatus(id, 'reviewed');
    if (err) {
      toast.error(err);
    } else {
      toast.success('Marked reviewed');
    }
  }

  async function handleBulkReviewVisible() {
    if (filteredPendingIds.length === 0) {
      toast.info('No pending discrepancies match the current filters');
      return;
    }
    const err = await bulkMarkReviewed(filteredPendingIds);
    if (err) {
      toast.error(err);
    } else {
      toast.success(`Marked ${filteredPendingIds.length} discrepancies reviewed`);
    }
  }

  const selectedRow = selectedId ? rows.find((r) => r.id === selectedId) : null;
  const triagePct =
    pendingCount + rows.length > 0
      ? Math.round(((rows.length - pendingCount) / Math.max(rows.length, 1)) * 100)
      : 100;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-qo-accent" />
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Review Queue</h1>
            <p className="text-xs text-text-muted">
              Triage cross-validation issues — pending first, then escalate or resolve in detail
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={showPendingOnly}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            <ListFilter size={14} />
            Pending ({pendingCount})
          </button>

          {canTriage && filteredPendingIds.length > 0 && (
            <button
              type="button"
              onClick={() => void handleBulkReviewVisible()}
              disabled={loading}
              title="Mark all pending rows matching current filters as reviewed"
              className="flex items-center gap-1.5 rounded-lg border border-qo-accent/20 bg-qo-accent/10 px-3 py-2 text-xs font-medium text-qo-accent transition-colors hover:bg-qo-accent/20 disabled:opacity-40"
            >
              <CheckCheck size={14} />
              Review visible ({filteredPendingIds.length})
            </button>
          )}

          {(filters.severity || filters.status || filters.source || filters.type) && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-black/[0.08] px-3 py-2 text-xs text-text-muted hover:text-text-secondary"
            >
              Clear filters
            </button>
          )}

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-black/[0.05] disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>

          <button
            type="button"
            onClick={() => void handleRunDetection()}
            disabled={detecting || !canRunEchoSync}
            title={
              !canRunEchoSync
                ? 'Requires bulk_process permission'
                : 'Re-run ECHO discrepancy rules against current internal DMR data'
            }
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-black/[0.05] disabled:opacity-40"
          >
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
            Run Detection
          </button>

          {canRunEchoSync && (
            <>
              <button
                type="button"
                onClick={() => void dispatchDryRun()}
                disabled={alerting}
                title="Preview who would receive an alert without sending"
                className="flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/20 disabled:opacity-40"
              >
                {alerting ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                Test alert
              </button>
              <button
                type="button"
                onClick={() => void dispatchDigest()}
                disabled={alerting}
                title="Force medium-pending digest if rate limits allow"
                className="flex items-center gap-1.5 rounded-lg border border-purple-500/20 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-purple-500/10 disabled:opacity-40"
              >
                Send digest
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => void triggerEchoSync()}
            disabled={syncing.echo || !canRunEchoSync}
            title={
              !canRunEchoSync
                ? 'Requires bulk_process permission to run ECHO sync'
                : 'Sync EPA ECHO data, then auto-run detection'
            }
            className="flex items-center gap-1.5 rounded-lg bg-qo-accent/10 border border-qo-accent/20 px-3 py-2 text-xs font-medium text-qo-accent transition-colors hover:bg-qo-accent/20 disabled:opacity-40"
          >
            {syncing.echo ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync ECHO
          </button>
        </div>
      </div>

      {/* Triage progress */}
      {!loading && (pendingCount > 0 || escalatedCount > 0) && (
        <div className="rounded-xl border border-black/[0.08] bg-qo-nested px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-text-secondary">
            <span className="font-semibold text-amber-300">{pendingCount} pending</span>
            {escalatedCount > 0 && (
              <span className="text-text-muted">
                {' '}
                · <span className="text-purple-300">{escalatedCount} escalated</span> awaiting follow-up
              </span>
            )}
            <span className="text-text-muted"> · {triagePct}% of queue triaged</span>
          </div>
          <p className="text-[10px] text-text-muted max-w-md">
            Workflow: Run Detection → filter Pending → quick Review or open row for Escalate / Dismiss /
            Resolve
          </p>
        </div>
      )}

      {canRunEchoSync && <ComplianceAlertRulesPanel />}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4">
          <p className="text-sm text-text-primary">{error}</p>
        </div>
      )}

      <DiscrepancySummaryCards
        counts={counts}
        loading={loading}
        activeSeverity={filters.severity}
        onSeverityClick={handleSeverityClick}
      />

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-qo-accent" />
          <span className="ml-3 text-sm text-text-secondary">Loading discrepancies...</span>
        </div>
      ) : (
        <DiscrepancyTable
          rows={rows}
          reviewerNames={reviewerNames}
          onSelect={setSelectedId}
          onQuickReview={canTriage ? handleQuickReview : undefined}
        />
      )}

      {selectedRow && (
        <DiscrepancyDetailPanel
          discrepancy={selectedRow}
          reviewerNames={reviewerNames}
          onClose={() => setSelectedId(null)}
          onAction={updateStatus}
        />
      )}

      <p className="text-[10px] text-text-muted text-center">
        Public data may be delayed 30–90 days. Queue updates live after detection runs. Email/SMS
        alerts follow rules on this page and your notification preferences.
      </p>
    </div>
  );
}

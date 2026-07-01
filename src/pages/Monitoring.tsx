import { useMemo } from 'react';
import { toast } from 'sonner';
import { Activity, RefreshCw, Bell, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useExceedanceAlerts } from '@/hooks/useExceedanceAlerts';
import { ExceedanceAlertRulesPanel } from '@/components/monitoring/ExceedanceAlertRulesPanel';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { SummaryCards, SeverityBreakdown } from '@/components/monitoring/SummaryCards';
import { ExceedanceTable } from '@/components/monitoring/ExceedanceTable';
import { FilterChips } from '@/components/monitoring/FilterChips';
import { useExceedances } from '@/hooks/useExceedances';
import { useMonitoringStats } from '@/hooks/useMonitoringStats';
import { useMonitoringStore } from '@/stores/monitoring';

export function Monitoring() {
  const { filters } = useMonitoringStore();
  const { can } = usePermissions();
  const canAlert = can('bulk_process');
  const { dispatching: alerting, dispatchDryRun, dispatchDigest } = useExceedanceAlerts();

  // Convert store filters to hook filters
  const hookFilters = useMemo(() => ({
    status: filters.status === 'all' ? undefined : filters.status,
    severity: filters.severity === 'all' ? undefined : filters.severity,
    outfallId: filters.outfallId ?? undefined,
    parameterId: filters.parameterId ?? undefined,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
  }), [filters]);

  const {
    exceedances,
    loading: exceedancesLoading,
    error: exceedancesError,
    refresh: refreshExceedances,
    acknowledgeExceedance,
    resolveExceedance,
    markFalsePositive,
  } = useExceedances(hookFilters);

  const {
    stats,
    loading: statsLoading,
    refresh: refreshStats,
  } = useMonitoringStats();

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeExceedance(id);
      toast.success('Exceedance acknowledged');
      refreshStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to acknowledge');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await resolveExceedance(id);
      toast.success('Exceedance resolved');
      refreshStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve');
    }
  };

  const handleMarkFalsePositive = async (id: string) => {
    try {
      await markFalsePositive(id);
      toast.success('Marked as false positive');
      refreshStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark false positive');
    }
  };

  const handleRefresh = () => {
    refreshExceedances();
    refreshStats();
    toast.success('Data refreshed');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10">
            <Activity className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Real-Time Monitoring</h1>
            <p className="text-sm text-muted-foreground">
              Track permit limit exceedances and compliance status
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAlert && (
            <>
              <button
                type="button"
                onClick={() => void dispatchDryRun()}
                disabled={alerting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs text-orange-300 hover:bg-orange-500/20 disabled:opacity-40"
              >
                {alerting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                Test alert
              </button>
              <button
                type="button"
                onClick={() => void dispatchDigest()}
                disabled={alerting}
                className="px-3 py-2 rounded-lg border border-white/10 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-40"
              >
                Send digest
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {canAlert && <ExceedanceAlertRulesPanel />}

      {/* Summary Cards */}
      <SummaryCards stats={stats} loading={statsLoading} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Exceedances Table - spans 3 columns */}
        <div className="lg:col-span-3">
          <SpotlightCard className="p-6">
            <div className="space-y-4">
              {/* Filter chips */}
              <FilterChips />

              {/* Error state */}
              {exceedancesError && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {exceedancesError}
                </div>
              )}

              {/* Table */}
              <ExceedanceTable
                exceedances={exceedances}
                loading={exceedancesLoading}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
                onMarkFalsePositive={handleMarkFalsePositive}
              />
            </div>
          </SpotlightCard>
        </div>

        {/* Sidebar - severity breakdown */}
        <div className="lg:col-span-1">
          <SeverityBreakdown stats={stats} loading={statsLoading} />
        </div>
      </div>
    </div>
  );
}

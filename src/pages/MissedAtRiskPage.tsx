import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { SamplingGapDetailPanel } from '@/components/sampling-gaps/SamplingGapDetailPanel';
import { SamplingGapSummaryCards } from '@/components/sampling-gaps/SamplingGapSummaryCards';
import { SamplingGapTable } from '@/components/sampling-gaps/SamplingGapTable';
import { useSamplingGaps } from '@/hooks/useSamplingGaps';
import { useStatutoryAlertAcks } from '@/hooks/useStatutoryAlertAcks';
import { usePermissions } from '@/hooks/usePermissions';
import type { SamplingGapKind } from '@/lib/samplingGapSeverity';

export function MissedAtRiskPage() {
  const [searchParams] = useSearchParams();
  const deepLinkGapId = searchParams.get('gapId');
  const {
    rows,
    loading,
    detecting,
    error,
    counts,
    runDetection,
    updateReviewStatus,
  } = useSamplingGaps();
  const statutoryAcks = useStatutoryAlertAcks();
  const { can } = usePermissions();
  const canTriage = can('verify');
  const canRunDetection = can('bulk_process');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<SamplingGapKind | null>(null);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (!deepLinkGapId || loading) return;
    if (rows.some((r) => r.id === deepLinkGapId)) {
      setSelectedId(deepLinkGapId);
    }
  }, [deepLinkGapId, loading, rows]);

  async function handleRunDetection() {
    const result = await runDetection();
    if (!result) {
      if (!error) toast.error('Gap detection failed');
      return;
    }

    toast.success(
      `Scanned ${result.calendars_scanned} calendar rows — ${result.gaps_opened} new, ${result.gaps_updated} updated, ${result.gaps_resolved} resolved`,
    );
  }

  function toggleKindFilter(kind: SamplingGapKind) {
    setKindFilter((prev) => (prev === kind ? null : kind));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-qo-ochre-text" />
            <h2 className="text-xl font-semibold text-text-primary">Missed / At-Risk Sampling</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Nightly calendar-gap detection — expected events vs. arrived lab results
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-qo-ochre-text/90">
            DRAFT — severity for human review; not verified penalty amounts
          </p>
        </div>

        {canRunDetection && (
          <button
            type="button"
            onClick={() => void handleRunDetection()}
            disabled={detecting || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-black/[0.12] bg-black/[0.03] px-4 py-2 text-xs font-medium text-text-primary hover:bg-white/[0.1] disabled:opacity-50"
          >
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Run gap detection
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <SamplingGapSummaryCards
        missed={counts.missed}
        atRisk={counts.at_risk}
        pending={counts.pending}
        critical={counts.critical}
        activeKind={kindFilter}
        onKindClick={toggleKindFilter}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading gap queue…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SamplingGapTable
              rows={rows}
              selectedId={selectedId}
              onSelect={setSelectedId}
              kindFilter={kindFilter}
            />
          </div>
          <div>
            <SamplingGapDetailPanel
              row={selectedRow}
              onUpdate={updateReviewStatus}
              canTriage={canTriage}
              needsStatutoryAck={
                selectedRow
                  ? statutoryAcks.isUnacknowledged('sampling_gap', selectedRow.id)
                  : false
              }
              onStatutoryAck={
                selectedRow
                  ? () => statutoryAcks.acknowledge('sampling_gap', selectedRow.id)
                  : undefined
              }
              statutoryAckBusy={
                selectedRow
                  ? statutoryAcks.isAcknowledging('sampling_gap', selectedRow.id)
                  : false
              }
              statutoryAckLoading={statutoryAcks.loading}
            />
          </div>
        </div>
      )}
    </div>
  );
}

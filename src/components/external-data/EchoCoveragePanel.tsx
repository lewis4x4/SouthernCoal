import { useState, useMemo } from 'react';
import { Loader2, AlertTriangle, Database, Shield, Link2, Save, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useEchoCoverage } from '@/hooks/useEchoCoverage';
import { useSyncHealth, ECHO_STALE_DAYS } from '@/hooks/useSyncHealth';
import { useNpdesOverrides } from '@/hooks/useNpdesOverrides';
import { useSyncTrigger } from '@/hooks/useSyncTrigger';
import { SyncHealthPanel } from '@/components/external-data/SyncHealthPanel';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { STATES } from '@/lib/constants';
import {
  classifyRegistryPermitId,
  registryGapHint,
  validateFederalNpdesId,
} from '@/lib/npdesMapping';
import type { CoverageFacility, StateCoverage } from '@/hooks/useEchoCoverage';
import type { NpdesOverride, RegistryFederalMappingGap, UnmatchedPermit } from '@/hooks/useNpdesOverrides';

type SortKey = 'npdes_id' | 'facility_name' | 'state_code' | 'compliance_status' | 'dmr_count' | 'synced_at';
type SortDir = 'asc' | 'desc';

function ComplianceBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-[10px] text-text-muted">-</span>;
  const isSNC = status.toLowerCase().includes('snc') || status.toLowerCase().includes('significant');
  return (
    <span
      className={cn(
        'inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium',
        isSNC
          ? 'bg-red-500/10 text-qo-risk border-red-500/20'
          : 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
      )}
    >
      {status}
    </span>
  );
}

function StateCoverageCard({ coverage }: { coverage: StateCoverage }) {
  const stateConfig = STATES.find((s) => s.code === coverage.state_code);
  return (
    <div className="rounded-xl border border-black/[0.08] bg-qo-nested p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text-primary">{coverage.state_code}</span>
        {coverage.snc_count > 0 && (
          <span className="rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-qo-risk">
            {coverage.snc_count} SNC
          </span>
        )}
      </div>
      <p className="text-xs text-text-muted mb-1">{stateConfig?.name ?? coverage.state_code}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{coverage.facility_count} facilities</span>
        <span className="text-text-muted font-mono">{coverage.dmr_total.toLocaleString()} DMRs</span>
      </div>
    </div>
  );
}

export function EchoCoveragePanel() {
  const { facilities, stateCoverage, lastSync, syncing, loading, error } = useEchoCoverage();
  const syncHealth = useSyncHealth(facilities);
  const { syncing: syncState, triggerEchoSync } = useSyncTrigger();
  const triggerSyncing = syncState['echo'] ?? false;
  const { can } = usePermissions();
  const { log } = useAuditLog();
  const {
    overrides,
    unmatchedPermits,
    registryMappingGaps,
    saving: overrideSaving,
    saveOverride,
    deleteOverride,
  } = useNpdesOverrides();

  const [sortKey, setSortKey] = useState<SortKey>('state_code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [gapStateFilter, setGapStateFilter] = useState<string>('VA');

  const isSyncing = syncing || triggerSyncing;

  function handleSync() {
    triggerEchoSync();
    log('echo_sync_manual_trigger', {}, { module: 'external_data', tableName: 'external_sync_log' });
    toast.info('ECHO full sync started…');
  }

  function handleSyncStale() {
    triggerEchoSync({
      stale_days: ECHO_STALE_DAYS,
      stale_only: true,
      limit: 5,
      run_tag: 'manual-stale-batch',
    });
    log(
      'echo_sync_stale_trigger',
      { stale_days: ECHO_STALE_DAYS, limit: 5 },
      { module: 'external_data', tableName: 'external_sync_log' },
    );
    toast.info(`ECHO stale sync started (up to 5 permits, ${ECHO_STALE_DAYS}+ days old)…`);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filteredRegistryGaps = useMemo(() => {
    if (gapStateFilter === 'all') return registryMappingGaps;
    return registryMappingGaps.filter((g) => g.state_code === gapStateFilter);
  }, [registryMappingGaps, gapStateFilter]);

  const sortedFacilities = useMemo(() => {
    const filtered = stateFilter === 'all'
      ? facilities
      : facilities.filter((f) => f.state_code === stateFilter);

    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [facilities, sortKey, sortDir, stateFilter]);

  const totalDmrs = stateCoverage.reduce((sum, s) => sum + s.dmr_total, 0);
  const totalSNC = stateCoverage.reduce((sum, s) => sum + s.snc_count, 0);

  const registryByFederalNpdes = useMemo(() => {
    const map = new Map<string, string>();
    for (const ov of overrides) {
      map.set(ov.npdes_id.toUpperCase(), ov.source_permit_id);
    }
    return map;
  }, [overrides]);

  const showRegistryColumn = registryByFederalNpdes.size > 0;

  function exportMappingSnapshot() {
    const lines = [
      'type,permit_number,npdes_id,state_code,issuing_agency',
      ...overrides.map(
        (ov) =>
          `mapped,${ov.source_permit_id},${ov.npdes_id},${ov.state_code},`,
      ),
      ...registryMappingGaps.map(
        (gap) =>
          `gap,${gap.permit_number},,${gap.state_code},${(gap.issuing_agency ?? '').replace(/,/g, ' ')}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `npdes_mapping_snapshot_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log('coverage_export_csv', { rows: lines.length - 1 }, { module: 'external_data', tableName: 'npdes_id_overrides' });
    toast.success('Mapping snapshot exported');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertTriangle className="h-8 w-8 text-qo-risk" />
        <p className="text-sm text-qo-risk">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">ECHO Sync Coverage</h1>
        <p className="text-sm text-text-muted mt-1">
          EPA ECHO data across {facilities.length} facilities in {stateCoverage.length} states
          {lastSync?.completed_at && (
            <span className="text-text-muted/80">
              {' '}
              · last log {new Date(lastSync.completed_at).toLocaleDateString()}
            </span>
          )}
        </p>
      </div>

      <SyncHealthPanel
        recentRuns={syncHealth.recentRuns}
        staleFacilities={syncHealth.staleFacilities}
        staleCount={syncHealth.staleCount}
        lastCompleted={syncHealth.lastCompleted}
        runningRun={syncHealth.runningRun}
        failedRuns30d={syncHealth.failedRuns30d}
        loading={syncHealth.loading || loading}
        isSyncing={isSyncing}
        canSync={can('bulk_process')}
        onSyncNow={handleSync}
        onSyncStale={handleSyncStale}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-qo-accent" />
            <span className="text-xs text-text-muted">Facilities</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{facilities.length}</p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-qo-accent" />
            <span className="text-xs text-text-muted">DMR Records</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{totalDmrs.toLocaleString()}</p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(239, 68, 68, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-qo-risk" />
            <span className="text-xs text-text-muted">SNC Facilities</span>
          </div>
          <p className={cn('text-2xl font-bold', totalSNC > 0 ? 'text-qo-risk' : 'text-qo-sage-text')}>{totalSNC}</p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-qo-accent" />
            <span className="text-xs text-text-muted">States</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{stateCoverage.length}</p>
        </SpotlightCard>
      </div>

      {/* Federal NPDES mapping posture (bulk import + manual overrides) */}
      {(overrides.length > 0 || registryMappingGaps.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.06)" className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">Registry mapped</p>
            <p className="text-2xl font-bold text-qo-sage-text mt-1">{overrides.length}</p>
            <p className="text-xs text-text-muted mt-1">ECHO overrides + permit metadata</p>
          </SpotlightCard>
          <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.06)" className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">Mapping gaps</p>
            <p className="text-2xl font-bold text-qo-ochre-text mt-1">{registryMappingGaps.length}</p>
            <p className="text-xs text-text-muted mt-1">See cleanup backlog below</p>
          </SpotlightCard>
          <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">ECHO facilities</p>
            <p className="text-2xl font-bold text-qo-accent mt-1">{facilities.length}</p>
            <p className="text-xs text-text-muted mt-1">EPA sync in external_echo_facilities</p>
          </SpotlightCard>
        </div>
      )}
      {(overrides.length > 0 || registryMappingGaps.length > 0) && can('bulk_process') && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={exportMappingSnapshot}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <Download size={12} />
            Export mapping snapshot (CSV)
          </button>
        </div>
      )}

      {/* State Breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Coverage by State</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stateCoverage.map((sc) => (
            <StateCoverageCard key={sc.state_code} coverage={sc} />
          ))}
        </div>
      </div>

      {/* Facility Table */}
      <div className="rounded-2xl border border-black/[0.08] bg-qo-nested  overflow-hidden">
        {/* Table header with filter */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
          <h3 className="text-sm font-semibold text-text-primary">All Facilities</h3>
          <div className="flex items-center gap-2">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-lg border border-black/[0.08] bg-qo-nested px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-qo-accent/50"
            >
              <option value="all">All States</option>
              {STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </select>
            <span className="text-xs text-text-muted">{sortedFacilities.length} facilities</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted border-b border-black/[0.06]">
                <th
                  onClick={() => handleSort('npdes_id')}
                  className="text-left py-2 px-3 font-medium cursor-pointer hover:text-text-secondary transition-colors"
                >
                  NPDES ID
                  {sortKey === 'npdes_id' && (
                    <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                  )}
                </th>
                {showRegistryColumn ? (
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Registry Permit</th>
                ) : null}
                {([
                  ['facility_name', 'Facility'],
                  ['state_code', 'State'],
                  ['compliance_status', 'Compliance'],
                  ['dmr_count', 'DMRs'],
                  ['synced_at', 'Last Synced'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="text-left py-2 px-3 font-medium cursor-pointer hover:text-text-secondary transition-colors"
                  >
                    {label}
                    {sortKey === key && (
                      <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFacilities.map((f) => (
                <FacilityRow
                  key={f.id}
                  facility={f}
                  registryPermit={registryByFederalNpdes.get(f.npdes_id.toUpperCase())}
                  showRegistryColumn={showRegistryColumn}
                />
              ))}
              {sortedFacilities.length === 0 && (
                <tr>
                  <td colSpan={showRegistryColumn ? 7 : 6} className="py-8 text-center text-text-muted">
                    No facilities found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Registry permits still missing federal mapping (bulk import cleanup queue) */}
      {registryMappingGaps.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04]  overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/15">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-qo-ochre-text" />
              <h3 className="text-sm font-semibold text-text-primary">Registry Mapping Gaps</h3>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={gapStateFilter}
                onChange={(e) => setGapStateFilter(e.target.value)}
                className="rounded-lg border border-black/[0.08] bg-qo-nested px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-qo-accent/50"
              >
                <option value="all">All states</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.code}</option>
                ))}
              </select>
              <span className="text-xs text-amber-300/90 font-medium">
                {filteredRegistryGaps.length} of {registryMappingGaps.length} permit
                {registryMappingGaps.length === 1 ? '' : 's'} — cleanup backlog
              </span>
            </div>
          </div>
          <p className="px-4 pt-3 text-xs text-text-muted">
            These active registry rows have no federal NPDES ID in metadata yet (mostly VA DMLR / data-quality
            edge cases). Map DMLR mining IDs to verified federal VPDES IDs to unblock ECHO sync. Tracked in{' '}
            <span className="font-mono text-text-secondary">docs/NPDES_MAPPING_CLEANUP_BACKLOG.md</span>.
          </p>
          <div className="max-h-96 overflow-y-auto px-4 py-3">
            <div className="space-y-2">
              {filteredRegistryGaps.map((gap) => (
                <RegistryGapRow
                  key={gap.permit_number}
                  gap={gap}
                  saving={overrideSaving}
                  canMap={can('bulk_process')}
                  onSave={saveOverride}
                />
              ))}
              {filteredRegistryGaps.length === 0 && (
                <p className="text-xs text-text-muted py-2">No gaps for this state filter.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NPDES ID Overrides — for permits that can't be matched by ECHO (e.g., VA DMLR IDs) */}
      {can('bulk_process') && (unmatchedPermits.length > 0 || overrides.length > 0) && (
        <div className="rounded-2xl border border-black/[0.08] bg-qo-nested  overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-qo-ochre-text" />
              <h3 className="text-sm font-semibold text-text-primary">NPDES ID Overrides</h3>
            </div>
            <span className="text-xs text-text-muted">
              {unmatchedPermits.length} queue unmatched &middot; {overrides.length} override
              {registryMappingGaps.length > 0 ? ` · ${registryMappingGaps.length} registry gaps` : ''}
            </span>
          </div>

          {/* Existing overrides */}
          {overrides.length > 0 && (
            <div className="px-4 py-3 border-b border-black/[0.06]">
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">Active Mappings</p>
              <div className="space-y-1.5">
                {overrides.map((ov) => (
                  <OverrideRow key={ov.id} override={ov} onDelete={deleteOverride} canDelete={can('bulk_process')} />
                ))}
              </div>
            </div>
          )}

          {/* Unmatched permits */}
          {unmatchedPermits.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">Unmatched Permits</p>
              <p className="text-xs text-text-muted mb-3">
                These permits use state-level IDs that ECHO can&apos;t match. Enter the federal NPDES ID to enable sync.
              </p>
              <div className="space-y-2">
                {unmatchedPermits.map((up) => (
                  <UnmatchedPermitRow
                    key={up.source_permit_id}
                    permit={up}
                    saving={overrideSaving}
                    onSave={saveOverride}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RegistryGapRow({
  gap,
  saving,
  canMap,
  onSave,
}: {
  gap: RegistryFederalMappingGap;
  saving: boolean;
  canMap: boolean;
  onSave: (sourceId: string, npdesId: string, stateCode: string, notes?: string) => Promise<{ error: string | null }>;
}) {
  const [npdesId, setNpdesId] = useState('');
  const kind = classifyRegistryPermitId(gap.permit_number, gap.state_code);
  const hint = registryGapHint(gap.permit_number, gap.state_code);

  async function handleSave() {
    const validation = validateFederalNpdesId(npdesId);
    if (!validation.valid) {
      toast.error(validation.message ?? 'Invalid NPDES ID');
      return;
    }
    const federalId = npdesId.trim().toUpperCase();
    const { error } = await onSave(
      gap.permit_number,
      federalId,
      gap.state_code === '—' ? 'VA' : gap.state_code,
      kind === 'dmlr_mining' ? 'DMLR → federal crosswalk' : undefined,
    );
    if (error) {
      toast.error(`Save failed: ${error}`);
    } else {
      toast.success(`Mapped ${gap.permit_number} → ${federalId} (registry + ECHO override)`);
      setNpdesId('');
    }
  }

  const kindBadge =
    kind === 'dmlr_mining'
      ? 'DMLR'
      : kind === 'pseudo_va_npdes'
        ? 'Pseudo-NPDES'
        : null;

  return (
    <div className="rounded-lg border border-black/[0.06] bg-qo-nested/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-text-secondary w-8">{gap.state_code}</span>
        <span className="font-mono text-text-primary">{gap.permit_number}</span>
        {kindBadge && (
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-qo-ochre-text">
            {kindBadge}
          </span>
        )}
        <span className="text-text-muted truncate">{gap.issuing_agency ?? '—'}</span>
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-text-muted leading-snug">{hint}</p>}
      {canMap && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-text-muted">&rarr;</span>
          <input
            type="text"
            value={npdesId}
            onChange={(e) => setNpdesId(e.target.value)}
            placeholder="Federal NPDES ID (e.g. VA0081742)"
            className="rounded-lg border border-black/[0.08] bg-qo-nested px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-qo-accent/50 w-44"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !npdesId.trim()}
            className="flex items-center gap-1 rounded-lg border border-qo-accent/30 bg-qo-accent/10 px-2 py-1 text-[10px] font-medium text-qo-accent transition-colors hover:bg-qo-accent/20 disabled:opacity-40"
          >
            <Save size={10} />
            Map
          </button>
        </div>
      )}
    </div>
  );
}

function OverrideRow({
  override: ov,
  onDelete,
  canDelete,
}: {
  override: NpdesOverride;
  onDelete: (id: string) => Promise<{ error: string | null }>;
  canDelete: boolean;
}) {
  async function handleDelete() {
    const { error } = await onDelete(ov.id);
    if (error) toast.error(`Delete failed: ${error}`);
    else toast.success(`Override removed for ${ov.source_permit_id}`);
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="font-mono text-text-secondary w-24">{ov.state_code}</span>
      <span className="font-mono text-text-primary w-32">{ov.source_permit_id}</span>
      <span className="text-text-muted">&rarr;</span>
      <span className="font-mono text-qo-accent w-32">{ov.npdes_id}</span>
      {ov.notes && <span className="text-text-muted truncate max-w-[200px]">{ov.notes}</span>}
      {canDelete && (
        <button
          onClick={handleDelete}
          className="ml-auto p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-qo-risk transition-colors"
          title="Remove override"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function UnmatchedPermitRow({
  permit,
  saving,
  onSave,
}: {
  permit: UnmatchedPermit;
  saving: boolean;
  onSave: (sourceId: string, npdesId: string, stateCode: string, notes?: string) => Promise<{ error: string | null }>;
}) {
  const [npdesId, setNpdesId] = useState('');

  async function handleSave() {
    const validation = validateFederalNpdesId(npdesId);
    if (!validation.valid) {
      toast.error(validation.message ?? 'Invalid NPDES ID');
      return;
    }
    const federalId = npdesId.trim().toUpperCase();
    const { error } = await onSave(permit.source_permit_id, federalId, permit.state_code);
    if (error) {
      toast.error(`Save failed: ${error}`);
    } else {
      toast.success(`Mapped ${permit.source_permit_id} → ${federalId} (registry + ECHO override)`);
      setNpdesId('');
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-text-secondary w-12">{permit.state_code}</span>
      <span className="text-xs font-mono text-text-primary w-32">{permit.source_permit_id}</span>
      <span className="text-xs text-text-muted">&rarr;</span>
      <input
        type="text"
        value={npdesId}
        onChange={(e) => setNpdesId(e.target.value)}
        placeholder="Federal NPDES ID"
        className="rounded-lg border border-black/[0.08] bg-qo-nested px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-qo-accent/50 w-36"
      />
      <button
        onClick={handleSave}
        disabled={saving || !npdesId.trim()}
        className="flex items-center gap-1 rounded-lg border border-qo-accent/30 bg-qo-accent/10 px-2 py-1 text-[10px] font-medium text-qo-accent transition-colors hover:bg-qo-accent/20 disabled:opacity-40"
      >
        <Save size={10} />
        Save
      </button>
    </div>
  );
}

function FacilityRow({
  facility: f,
  registryPermit,
  showRegistryColumn,
}: {
  facility: CoverageFacility;
  registryPermit?: string;
  showRegistryColumn: boolean;
}) {
  return (
    <tr className="border-t border-white/[0.03] hover:bg-qo-nested transition-colors">
      <td className="py-2.5 px-3 font-mono font-medium text-text-primary">{f.npdes_id}</td>
      {showRegistryColumn ? (
        <td className="py-2.5 px-3 font-mono text-qo-accent/90">
          {registryPermit ?? '—'}
        </td>
      ) : null}
      <td className="py-2.5 px-3 text-text-secondary max-w-[200px] truncate">{f.facility_name || '-'}</td>
      <td className="py-2.5 px-3 text-text-secondary">{f.state_code}</td>
      <td className="py-2.5 px-3"><ComplianceBadge status={f.compliance_status} /></td>
      <td className="py-2.5 px-3 font-mono text-text-secondary">{f.dmr_count.toLocaleString()}</td>
      <td className="py-2.5 px-3 text-text-muted">{new Date(f.synced_at).toLocaleDateString()}</td>
    </tr>
  );
}

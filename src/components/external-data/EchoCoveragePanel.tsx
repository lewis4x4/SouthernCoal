import { useState, useMemo } from 'react';
import { RefreshCw, Loader2, AlertTriangle, Clock, Database, Shield, Link2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useEchoCoverage } from '@/hooks/useEchoCoverage';
import { useNpdesOverrides } from '@/hooks/useNpdesOverrides';
import { useSyncTrigger } from '@/hooks/useSyncTrigger';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { STATES } from '@/lib/constants';
import type { CoverageFacility, StateCoverage } from '@/hooks/useEchoCoverage';
import type { NpdesOverride, UnmatchedPermit } from '@/hooks/useNpdesOverrides';

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
          ? 'bg-red-500/10 text-red-400 border-red-500/20'
          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      )}
    >
      {status}
    </span>
  );
}

function StateCoverageCard({ coverage }: { coverage: StateCoverage }) {
  const stateConfig = STATES.find((s) => s.code === coverage.state_code);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text-primary">{coverage.state_code}</span>
        {coverage.snc_count > 0 && (
          <span className="rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
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
  const { syncing: syncState, triggerEchoSync } = useSyncTrigger();
  const triggerSyncing = syncState['echo'] ?? false;
  const { can } = usePermissions();
  const { log } = useAuditLog();
  const { overrides, unmatchedPermits, saving: overrideSaving, saveOverride, deleteOverride } = useNpdesOverrides();

  const [sortKey, setSortKey] = useState<SortKey>('state_code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [stateFilter, setStateFilter] = useState<string>('all');

  const isSyncing = syncing || triggerSyncing;

  function handleSync() {
    triggerEchoSync();
    log('echo_sync_manual_trigger', {}, { module: 'external_data', tableName: 'external_sync_log' });
    toast.info('ECHO sync started...');
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sortedFacilities = useMemo(() => {
    let filtered = stateFilter === 'all'
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
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">ECHO Sync Coverage</h1>
          <p className="text-sm text-text-muted mt-1">
            EPA ECHO data across {facilities.length} facilities in {stateCoverage.length} states
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Clock size={12} />
              Last sync: {lastSync.completed_at ? new Date(lastSync.completed_at).toLocaleDateString() : 'In progress'}
            </div>
          )}
          {can('bulk_process') && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
              title={!can('bulk_process') ? 'Requires bulk_process permission' : 'Sync all permits from EPA ECHO'}
            >
              {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-cyan-400" />
            <span className="text-xs text-text-muted">Facilities</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{facilities.length}</p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-cyan-400" />
            <span className="text-xs text-text-muted">DMR Records</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{totalDmrs.toLocaleString()}</p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(239, 68, 68, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-red-400" />
            <span className="text-xs text-text-muted">SNC Facilities</span>
          </div>
          <p className={cn('text-2xl font-bold', totalSNC > 0 ? 'text-red-400' : 'text-emerald-400')}>{totalSNC}</p>
        </SpotlightCard>
        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-cyan-400" />
            <span className="text-xs text-text-muted">States</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{stateCoverage.length}</p>
        </SpotlightCard>
      </div>

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
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
        {/* Table header with filter */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-text-primary">All Facilities</h3>
          <div className="flex items-center gap-2">
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-text-secondary focus:outline-none focus:border-cyan-500/50"
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
              <tr className="text-text-muted border-b border-white/[0.06]">
                {([
                  ['npdes_id', 'NPDES ID'],
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
                <FacilityRow key={f.id} facility={f} />
              ))}
              {sortedFacilities.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-muted">
                    No facilities found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NPDES ID Overrides — for permits that can't be matched by ECHO (e.g., VA DMLR IDs) */}
      {can('bulk_process') && (unmatchedPermits.length > 0 || overrides.length > 0) && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-text-primary">NPDES ID Overrides</h3>
            </div>
            <span className="text-xs text-text-muted">
              {unmatchedPermits.length} unmatched &middot; {overrides.length} mapped
            </span>
          </div>

          {/* Existing overrides */}
          {overrides.length > 0 && (
            <div className="px-4 py-3 border-b border-white/[0.06]">
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
      <span className="font-mono text-cyan-400 w-32">{ov.npdes_id}</span>
      {ov.notes && <span className="text-text-muted truncate max-w-[200px]">{ov.notes}</span>}
      {canDelete && (
        <button
          onClick={handleDelete}
          className="ml-auto p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
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
    if (!npdesId.trim()) {
      toast.error('Enter a valid NPDES ID');
      return;
    }
    const { error } = await onSave(permit.source_permit_id, npdesId.trim(), permit.state_code);
    if (error) {
      toast.error(`Save failed: ${error}`);
    } else {
      toast.success(`Mapped ${permit.source_permit_id} → ${npdesId.trim().toUpperCase()}`);
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
        className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-cyan-500/50 w-36"
      />
      <button
        onClick={handleSave}
        disabled={saving || !npdesId.trim()}
        className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
      >
        <Save size={10} />
        Save
      </button>
    </div>
  );
}

function FacilityRow({ facility: f }: { facility: CoverageFacility }) {
  return (
    <tr className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
      <td className="py-2.5 px-3 font-mono font-medium text-text-primary">{f.npdes_id}</td>
      <td className="py-2.5 px-3 text-text-secondary max-w-[200px] truncate">{f.facility_name || '-'}</td>
      <td className="py-2.5 px-3 text-text-secondary">{f.state_code}</td>
      <td className="py-2.5 px-3"><ComplianceBadge status={f.compliance_status} /></td>
      <td className="py-2.5 px-3 font-mono text-text-secondary">{f.dmr_count.toLocaleString()}</td>
      <td className="py-2.5 px-3 text-text-muted">{new Date(f.synced_at).toLocaleDateString()}</td>
    </tr>
  );
}

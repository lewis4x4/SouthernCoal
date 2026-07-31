import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ScrollText, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { DISCLAIMER_EXPORT } from '@/lib/disclaimer';
import { usePermissions } from '@/hooks/usePermissions';
import { AUDIT_LOG_ROUTE_ROLES } from '@/lib/rbac';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAuditLogQuery, type AuditLogFilters, type AuditLogEntry } from '@/hooks/useAuditLogQuery';

const ACTION_COLORS: Record<string, string> = {
  matrix_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  matrix_export_markdown: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  audit_log_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  coverage_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  echo_sync_manual_trigger: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  echo_sync_stale_trigger: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  msha_sync_manual_trigger: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  msha_map_refreshed: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  msha_map_reconciled: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  msha_map_override_assigned: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  npdes_federal_mapping_saved: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  npdes_federal_mapping_removed: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  bulk_npdes_mapping_import: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  bulk_process: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  bulk_process_permits: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  bulk_process_lab_data: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  bulk_retry: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  role_change: 'bg-qo-accent/10 text-qo-accent border-qo-accent/20',
  user_deactivated: 'bg-red-500/10 text-qo-risk border-red-500/20',
  user_reactivated: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  correction_requested: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  correction_approved: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  correction_rejected: 'bg-red-500/10 text-qo-risk border-red-500/20',
  roadmap_status_change: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  obligation_generation: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  obligation_ledger_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  obligation_ledger_clocks_refreshed: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  penalty_ledger_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  penalty_ledger_verified: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  penalty_ledger_coverage_review: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  process_queued: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  retry_queued: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  compliance_archive_processed: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  lab_data_imported: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  permit_limits_imported: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  netdmr_dmr_imported: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  sampling_matrix_imported: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  matrix_expected_count_changed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  sampling_gap_detection_manual: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  sampling_gap_review_updated: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  equipment_maintenance_detection_run: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  msha_abatement_detection_run: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  edd_paragraph49_review_updated: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  defensible_miss_packet_generated: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  defensible_miss_packet_exported: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  defensible_miss_packet_pdf_generated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  // Field / WV route (client audit)
  field_sync_manual_refresh: 'bg-qo-accent/10 text-qo-accent border-qo-accent/20',
  field_visit_completed: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  field_visit_completion_queued: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  field_outbound_queue_flushed: 'bg-emerald-500/10 text-qo-sage-text border-emerald-500/20',
  field_outbound_queue_blocked: 'bg-red-500/10 text-qo-risk border-red-500/20',
  field_outbound_conflict_hold: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
};

/** Short labels for dense table cells and filter dropdowns (raw action still the filter value). */
const ACTION_LABELS: Record<string, string> = {
  sampling_gap_detection_manual: 'Gap detection (manual)',
  sampling_gap_review_updated: 'Gap triage updated',
  equipment_maintenance_detection_run: 'PM detection run',
  msha_abatement_detection_run: 'MSHA abatement detection',
  edd_paragraph49_review_updated: '¶49 EDD triage',
  defensible_miss_packet_generated: 'Defensible-miss packet',
  defensible_miss_packet_exported: 'Defensible-miss export',
  defensible_miss_packet_pdf_generated: 'Defensible-miss PDF',
  obligation_ledger_export_csv: 'Obligation ledger CSV',
  obligation_ledger_clocks_refreshed: 'Obligation clocks refresh',
  penalty_ledger_export_csv: 'Penalty ledger CSV',
  penalty_ledger_verified: 'Penalty ledger verified (RPC)',
  penalty_ledger_coverage_review: 'Penalty ledger coverage review',
  process_queued: 'Queue: process',
  retry_queued: 'Queue: retry',
  compliance_archive_processed: 'Archive doc indexed',
  lab_data_imported: 'Lab data imported',
  permit_limits_imported: 'Permit limits imported',
  netdmr_dmr_imported: 'NetDMR imported',
  sampling_matrix_imported: 'Sampling matrix imported',
  echo_sync_manual_trigger: 'ECHO full sync',
  echo_sync_stale_trigger: 'ECHO stale sync',
  msha_sync_manual_trigger: 'MSHA sync',
  msha_map_refreshed: 'MSHA map refresh',
  msha_map_reconciled: 'MSHA map reconcile',
  msha_map_override_assigned: 'MSHA map override',
  npdes_federal_mapping_saved: 'NPDES mapping saved',
  npdes_federal_mapping_removed: 'NPDES mapping removed',
  bulk_npdes_mapping_import: 'NPDES bulk import',
  matrix_expected_count_changed: 'Matrix expected count',
  field_sync_manual_refresh: 'Field: manual refresh',
  field_visit_completed: 'Field: visit completed',
  field_visit_completion_queued: 'Field: completion queued',
  field_outbound_queue_flushed: 'Field: queue flushed',
  field_outbound_queue_blocked: 'Field: queue blocked',
  field_outbound_conflict_hold: 'Field: conflict hold',
};

const DEFAULT_ACTION_COLOR = 'bg-qo-nested text-text-secondary border-black/[0.08]';

function formatActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

/** Always offer these in the module filter so reviewers can scope without waiting for a lucky first page. */
const PRESET_AUDIT_MODULES = [
  'access_control',
  'corrective_actions',
  'corrections',
  'external_data',
  'field_operations',
  /** Legacy client audits before module name unified with queue/refresh */
  'field_ops',
  'environmental_compliance',
  'equipment',
  'frontend',
  'handoff',
  'roadmap',
  'upload_dashboard',
] as const;

/** Field / route client-audit actions — always in the action filter (same rationale as preset modules). */
const PRESET_FIELD_AUDIT_ACTIONS = [
  'field_sync_manual_refresh',
  'field_visit_completed',
  'field_visit_completion_queued',
  'field_outbound_queue_flushed',
  'field_outbound_queue_blocked',
  'field_outbound_conflict_hold',
] as const;

/** Upload Dashboard actions — always in the action filter for compliance reviewers. */
const PRESET_UPLOAD_AUDIT_ACTIONS = [
  'process_queued',
  'retry_queued',
  'compliance_archive_processed',
  'lab_data_imported',
  'permit_limits_imported',
  'netdmr_dmr_imported',
  'sampling_matrix_imported',
  'bulk_retry',
  'matrix_export_csv',
  'matrix_export_markdown',
  'staging_clear_all',
  'command_palette_action',
] as const;

/** External data / ECHO / NPDES mapping actions — preset for compliance reviewers. */
const PRESET_EXTERNAL_DATA_AUDIT_ACTIONS = [
  'echo_sync_manual_trigger',
  'echo_sync_stale_trigger',
  'msha_sync_manual_trigger',
  'msha_map_refreshed',
  'msha_map_reconciled',
  'msha_map_override_assigned',
  'npdes_federal_mapping_saved',
  'npdes_federal_mapping_removed',
  'bulk_npdes_mapping_import',
  'coverage_export_csv',
  'discrepancy_reviewed',
  'discrepancy_dismissed',
  'discrepancy_escalated',
  'discrepancy_resolved',
] as const;

export function AuditLogPage() {
  const { hasAllowedRole, loading: permissionsLoading } = usePermissions();
  const { log } = useAuditLog();
  /** Same role set and `global` scope as `RoleGuard` on `/admin/audit-log` in App.tsx — gate before any fetch. */
  const canViewAuditLog = hasAllowedRole(AUDIT_LOG_ROUTE_ROLES, 'global');

  const [filters, setFilters] = useState<AuditLogFilters>({
    dateFrom: null,
    dateTo: null,
    userId: null,
    module: null,
    action: null,
  });

  const { entries, loading, hasMore, totalCount, loadMore, fetchError } = useAuditLogQuery(
    filters,
    !permissionsLoading && canViewAuditLog,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());

  // Load user names for display
  useEffect(() => {
    if (permissionsLoading || !canViewAuditLog) return;
    async function loadUsers() {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name');
      if (!data) return;
      const map = new Map<string, string>();
      for (const u of data) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
        map.set(u.id, name);
      }
      setUserMap(map);
    }
    void loadUsers().catch((err) => {
      if (import.meta.env.DEV) console.warn('[audit-log] loadUsers failed:', err);
    });
  }, [canViewAuditLog, permissionsLoading]);

  // Unique modules and actions for filter dropdowns
  const modules = useMemo(() => {
    const set = new Set<string>(PRESET_AUDIT_MODULES);
    for (const e of entries) set.add(e.module);
    return Array.from(set).sort();
  }, [entries]);

  const actions = useMemo(() => {
    const set = new Set<string>([
      ...PRESET_FIELD_AUDIT_ACTIONS,
      ...PRESET_UPLOAD_AUDIT_ACTIONS,
      ...PRESET_EXTERNAL_DATA_AUDIT_ACTIONS,
    ]);
    for (const e of entries) set.add(e.action);
    return Array.from(set).sort();
  }, [entries]);

  // Virtual scroll
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 5,
  });

  // Load more on scroll near bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el || !hasMore || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  // CSV export
  const exportCSV = useCallback(() => {
    const rows = ['Timestamp,User,Action,Module,Table,Record ID,Description'];
    for (const entry of entries) {
      rows.push([
        entry.created_at,
        `"${userMap.get(entry.user_id ?? '') ?? entry.user_id ?? ''}"`,
        entry.action,
        entry.module,
        entry.table_name,
        entry.record_id ?? '',
        `"${(entry.description ?? '').replace(/"/g, '""')}"`,
      ].join(','));
    }
    rows.push('');
    rows.push(`"${DISCLAIMER_EXPORT}"`);

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    log('audit_log_export_csv', { row_count: entries.length, filters });
    toast.success('Audit log exported');
  }, [entries, userMap, filters, log]);

  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-purple-500/10 p-2.5">
            <ScrollText className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Change Log
            </h1>
            <p className="mt-0.5 text-sm text-text-muted">
              Immutable audit trail — {totalCount.toLocaleString()} entries
            </p>
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-black/[0.05]"
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/[0.06] bg-qo-nested px-5 py-3">
        <input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value || null }))}
          className="rounded-lg border border-black/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
          placeholder="From"
        />
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value || null }))}
          className="rounded-lg border border-black/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
          placeholder="To"
        />
        <select
          value={filters.userId ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, userId: e.target.value || null }))}
          className="rounded-lg border border-black/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
        >
          <option value="">All Users</option>
          {Array.from(userMap.entries()).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          value={filters.module ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, module: e.target.value || null }))}
          className="rounded-lg border border-black/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
        >
          <option value="">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filters.action ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, action: e.target.value || null }))}
          className="rounded-lg border border-black/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
        >
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{formatActionLabel(a)}</option>)}
        </select>
        <span className="text-xs text-text-muted">
          Showing {entries.length} of {totalCount}
        </span>
      </div>

      {fetchError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm text-red-100/95"
        >
          <p className="font-medium text-red-50">Could not load audit log</p>
          <p className="mt-1 text-xs text-red-200/90">{fetchError}</p>
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-black/[0.06]">
        {/* Header Row */}
        <div className="grid grid-cols-[180px_150px_160px_120px_120px_1fr] gap-3 border-b border-black/[0.06] bg-qo-nested px-4 py-3 text-xs font-medium uppercase text-text-muted">
          <div>Timestamp</div>
          <div>User</div>
          <div>Action</div>
          <div>Module</div>
          <div>Table</div>
          <div>Description</div>
        </div>

        {/* Virtual Scrolled Body */}
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="max-h-[600px] overflow-y-auto"
        >
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/[0.12] border-t-white/60" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">
              No audit log entries match the current filters.
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index]!;
                const isExpanded = expandedId === entry.id;

                return (
                  <div
                    key={entry.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="grid w-full grid-cols-[180px_150px_160px_120px_120px_1fr] items-center gap-3 border-b border-black/[0.05] px-4 py-3 text-left text-sm transition-colors hover:bg-qo-nested"
                    >
                      <div className="font-mono text-xs text-text-muted">
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                      <div className="truncate text-xs text-text-secondary">
                        {userMap.get(entry.user_id ?? '') ?? entry.user_id?.slice(0, 8) ?? '—'}
                      </div>
                      <div>
                        <span
                          title={entry.action}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            ACTION_COLORS[entry.action] ?? DEFAULT_ACTION_COLOR,
                          )}
                        >
                          {formatActionLabel(entry.action)}
                        </span>
                      </div>
                      <div className="text-xs text-text-muted">{entry.module}</div>
                      <div className="text-xs text-text-muted">{entry.table_name}</div>
                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs text-text-secondary">
                          {entry.description ?? '—'}
                        </span>
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        }
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Expanded detail — rendered outside virtual list to avoid scroll jump */}
          {expandedId && (
            <ExpandedDetail
              entry={entries.find(e => e.id === expandedId)!}
              userMap={userMap}
            />
          )}

          {loading && entries.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/[0.12] border-t-white/60" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpandedDetail({
  entry,
  userMap,
}: {
  entry: AuditLogEntry;
  userMap: Map<string, string>;
}) {
  if (!entry) return null;

  const hasOldValues = entry.old_values && Object.keys(entry.old_values).length > 0;
  const hasNewValues = entry.new_values && Object.keys(entry.new_values).length > 0;
  const hasDiff = hasOldValues || hasNewValues;

  // Parse description as JSON if possible
  let descriptionData: Record<string, unknown> | null = null;
  if (entry.description) {
    try {
      descriptionData = JSON.parse(entry.description);
    } catch {
      // Not JSON — display as text
    }
  }

  return (
    <div className="border-b border-black/[0.06] bg-qo-nested px-6 py-4">
      <div className="grid gap-6 text-sm lg:grid-cols-2">
        {/* Metadata */}
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-text-muted">User</div>
            <div className="text-text-secondary">
              {userMap.get(entry.user_id ?? '') ?? entry.user_id ?? '—'}
            </div>
          </div>
          {entry.record_id && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-text-muted">Record ID</div>
              <div className="font-mono text-xs text-text-secondary">{entry.record_id}</div>
            </div>
          )}
          {entry.ip_address && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-text-muted">IP Address</div>
              <div className="font-mono text-xs text-text-secondary">{entry.ip_address}</div>
            </div>
          )}
          {entry.user_agent && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-text-muted">User Agent</div>
              <div className="truncate text-xs text-text-muted">{entry.user_agent}</div>
            </div>
          )}
        </div>

        {/* Details / Diff */}
        <div className="space-y-3">
          {descriptionData && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-text-muted">Details</div>
              <div className="space-y-1">
                {Object.entries(descriptionData).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-text-muted">{key}:</span>
                    <span className="text-text-secondary">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!descriptionData && entry.description && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-text-muted">Description</div>
              <div className="text-xs text-text-secondary">{entry.description}</div>
            </div>
          )}

          {hasDiff && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase text-text-muted">Changes</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-[10px] font-medium text-qo-risk/60">Before</div>
                  <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-2 font-mono text-[11px] text-text-secondary">
                    {hasOldValues
                      ? Object.entries(entry.old_values!).map(([k, v]) => (
                          <div key={k}>{k}: {JSON.stringify(v)}</div>
                        ))
                      : <span className="text-text-muted">—</span>
                    }
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-medium text-qo-sage-text/60">After</div>
                  <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-2 font-mono text-[11px] text-text-secondary">
                    {hasNewValues
                      ? Object.entries(entry.new_values!).map(([k, v]) => (
                          <div key={k}>{k}: {JSON.stringify(v)}</div>
                        ))
                      : <span className="text-text-muted">—</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

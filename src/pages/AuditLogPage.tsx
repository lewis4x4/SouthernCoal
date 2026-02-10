import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollText, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { DISCLAIMER_EXPORT } from '@/lib/disclaimer';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAuditLogQuery, type AuditLogFilters, type AuditLogEntry } from '@/hooks/useAuditLogQuery';

const ACTION_COLORS: Record<string, string> = {
  matrix_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  matrix_export_markdown: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  audit_log_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  coverage_export_csv: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  bulk_process: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  bulk_retry: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  role_change: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  user_deactivated: 'bg-red-500/10 text-red-400 border-red-500/20',
  user_reactivated: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  correction_requested: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  correction_approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  correction_rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  roadmap_status_change: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  obligation_generation: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const DEFAULT_ACTION_COLOR = 'bg-white/5 text-text-secondary border-white/10';

export function AuditLogPage() {
  const navigate = useNavigate();
  const { getEffectiveRole } = usePermissions();
  const { log } = useAuditLog();
  const role = getEffectiveRole();

  // RBAC gate — only executive, environmental_manager, admin
  useEffect(() => {
    if (!['executive', 'environmental_manager', 'admin'].includes(role)) {
      navigate('/dashboard', { replace: true });
    }
  }, [role, navigate]);

  const [filters, setFilters] = useState<AuditLogFilters>({
    dateFrom: null,
    dateTo: null,
    userId: null,
    module: null,
    action: null,
  });

  const { entries, loading, hasMore, totalCount, loadMore } = useAuditLogQuery(filters);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());

  // Load user names for display
  useEffect(() => {
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
    loadUsers();
  }, []);

  // Unique modules and actions for filter dropdowns
  const modules = useMemo(() => {
    const set = new Set(entries.map(e => e.module));
    return Array.from(set).sort();
  }, [entries]);

  const actions = useMemo(() => {
    const set = new Set(entries.map(e => e.action));
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
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value || null }))}
          className="rounded-lg border border-white/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
          placeholder="From"
        />
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value || null }))}
          className="rounded-lg border border-white/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
          placeholder="To"
        />
        <select
          value={filters.userId ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, userId: e.target.value || null }))}
          className="rounded-lg border border-white/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
        >
          <option value="">All Users</option>
          {Array.from(userMap.entries()).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          value={filters.module ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, module: e.target.value || null }))}
          className="rounded-lg border border-white/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
        >
          <option value="">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filters.action ?? ''}
          onChange={(e) => setFilters(f => ({ ...f, action: e.target.value || null }))}
          className="rounded-lg border border-white/[0.08] bg-crystal-surface px-3 py-1.5 text-sm text-text-secondary outline-none"
        >
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-xs text-text-muted">
          Showing {entries.length} of {totalCount}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        {/* Header Row */}
        <div className="grid grid-cols-[180px_150px_160px_120px_120px_1fr] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs font-medium uppercase text-text-muted">
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
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
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
                      className="grid w-full grid-cols-[180px_150px_160px_120px_120px_1fr] items-center gap-3 border-b border-white/[0.04] px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.03]"
                    >
                      <div className="font-mono text-xs text-text-muted">
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                      <div className="truncate text-xs text-text-secondary">
                        {userMap.get(entry.user_id ?? '') ?? entry.user_id?.slice(0, 8) ?? '—'}
                      </div>
                      <div>
                        <span className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          ACTION_COLORS[entry.action] ?? DEFAULT_ACTION_COLOR,
                        )}>
                          {entry.action}
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
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
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
    <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
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
                  <div className="mb-1 text-[10px] font-medium text-red-400/60">Before</div>
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
                  <div className="mb-1 text-[10px] font-medium text-emerald-400/60">After</div>
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

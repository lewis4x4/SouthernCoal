import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { SearchMetadata } from './SearchMetadata';
import { SearchDisclaimer, SEARCH_DISCLAIMER_TEXT } from './SearchDisclaimer';
import { SearchSQLPreview } from './SearchSQLPreview';
import { useAuditLog } from '@/hooks/useAuditLog';
import { DISCLAIMER_EXPORT } from '@/lib/disclaimer';
import type { ComplianceSearchResponse } from '@/types/search';

const ROW_HEIGHT = 40;

/** Route mapping for drill-down links by table name (future use) */
const RECORD_ROUTES: Record<string, string> = {
  npdes_permits: '/permits',
  outfalls: '/permits',
  exceedances: '/exceedances',
  corrective_actions: '/corrective-actions',
  stipulated_penalties: '/penalties',
  sampling_schedules: '/sampling',
  sampling_calendar: '/sampling',
  organizations: '/organizations',
  sites: '/sites',
  lab_results: '/lab-results',
  sampling_events: '/sampling',
  data_imports: '/imports',
  dmr_submissions: '/dmr',
  dmr_line_items: '/dmr',
  consent_decree_obligations: '/consent-decree',
  enforcement_actions: '/enforcement',
  compliance_audits: '/audits',
};

// Suppress unused warning — RECORD_ROUTES is referenced here for future drill-down implementation
void RECORD_ROUTES;

interface SearchResultsProps {
  response: ComplianceSearchResponse;
  onRetry?: () => void;
}

export function SearchResults({ response, onRetry }: SearchResultsProps) {
  const { log } = useAuditLog();

  if (!response.success && response.error) {
    return (
      <ErrorState
        error={response.error}
        suggestion={response.suggestion}
        onRetry={onRetry}
      />
    );
  }

  const { results, query, metadata } = response;

  if (metadata.reviewMode) {
    return null; // Review modal handles this
  }

  return (
    <div className="space-y-3">
      {/* Metadata bar */}
      <SearchMetadata
        tablesQueried={query.tablesQueried}
        filtersApplied={query.filtersApplied}
        resultCount={results.count}
        dataFreshness={metadata.dataFreshness}
      />

      {/* Result display by type */}
      {results.count === 0 ? (
        <EmptyState />
      ) : results.resultType === 'table' ? (
        <TableResults data={results.data} columns={results.columns} />
      ) : results.resultType === 'count' ? (
        <CountResult data={results.data} columns={results.columns} description={query.description} />
      ) : results.resultType === 'single_value' ? (
        <SingleValueResult data={results.data} columns={results.columns} description={query.description} />
      ) : (
        <SummaryResults data={results.data} columns={results.columns} />
      )}

      {/* SQL preview */}
      <SearchSQLPreview sql={query.sql} description={query.description} />

      {/* Export CSV */}
      {results.count > 0 && (
        <ExportCSV data={results.data} columns={results.columns} log={log} />
      )}

      {/* Disclaimer */}
      <SearchDisclaimer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TableResults({ data, columns }: { data: Record<string, unknown>[]; columns: string[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const useVirtual = data.length > 50;

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    enabled: useVirtual,
  });

  const displayColumns = useMemo(() => {
    if (columns.length > 0) return columns;
    if (data.length > 0 && data[0]) return Object.keys(data[0]);
    return [];
  }, [columns, data]);

  function handleCellClick(value: unknown) {
    if (value != null) {
      navigator.clipboard.writeText(String(value));
      toast.success('Copied to clipboard');
    }
  }

  const rows = useVirtual ? virtualizer.getVirtualItems() : data.map((_, i) => ({ index: i, start: i * ROW_HEIGHT, size: ROW_HEIGHT }));

  return (
    <div
      ref={parentRef}
      className="max-h-[500px] overflow-auto rounded-xl border border-white/[0.06]"
    >
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 z-10 bg-white/[0.06]">
          <tr>
            {displayColumns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-muted"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {useVirtual ? (
            <tr style={{ height: virtualizer.getTotalSize() }}>
              <td colSpan={displayColumns.length} className="relative p-0">
                {rows.map((vRow) => {
                  const row = data[vRow.index]!;
                  return (
                    <div
                      key={vRow.index}
                      className="absolute left-0 flex w-full items-center border-b border-white/[0.04] hover:bg-blue-500/[0.04]"
                      style={{
                        top: vRow.start,
                        height: vRow.size,
                      }}
                    >
                      {displayColumns.map((col) => (
                        <div
                          key={col}
                          onClick={() => handleCellClick(row[col])}
                          className="cursor-pointer truncate px-3 text-text-secondary transition-colors hover:text-text-primary"
                          style={{ flex: 1 }}
                          title={String(row[col] ?? '')}
                        >
                          {formatCellValue(row[col])}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-white/[0.04] hover:bg-blue-500/[0.04] ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
              >
                {displayColumns.map((col) => (
                  <td
                    key={col}
                    onClick={() => handleCellClick(row[col])}
                    className="cursor-pointer truncate whitespace-nowrap px-3 py-2 text-text-secondary transition-colors hover:text-text-primary"
                    title={String(row[col] ?? '')}
                  >
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CountResult({
  data,
  columns,
  description,
}: {
  data: Record<string, unknown>[];
  columns: string[];
  description: string;
}) {
  const value = data[0] ? Object.values(data[0])[0] : 0;
  const label = columns[0] || description;

  return (
    <SpotlightCard className="p-6 text-center">
      <p className="font-mono text-4xl font-bold text-text-primary">{String(value)}</p>
      <p className="mt-2 text-sm text-text-secondary">{label}</p>
    </SpotlightCard>
  );
}

function SingleValueResult({
  data,
  columns,
  description,
}: {
  data: Record<string, unknown>[];
  columns: string[];
  description: string;
}) {
  const value = data[0] ? Object.values(data[0])[0] : '—';
  const label = columns[0] || description;

  return (
    <SpotlightCard className="p-6 text-center">
      <p className="font-mono text-3xl font-bold text-text-primary">{String(value)}</p>
      <p className="mt-2 text-sm text-text-secondary">{label}</p>
    </SpotlightCard>
  );
}

function SummaryResults({ data }: { data: Record<string, unknown>[]; columns: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {data.map((row, i) => {
        const entries = Object.entries(row);
        const label = entries[0] ? String(entries[0][1]) : `Item ${i + 1}`;
        const value = entries[1] ? String(entries[1][1]) : '—';

        return (
          <SpotlightCard key={i} className="p-4">
            <p className="font-mono text-2xl font-bold text-text-primary">{value}</p>
            <p className="mt-1 truncate text-xs text-text-secondary">{label}</p>
          </SpotlightCard>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
      <p className="text-sm text-text-secondary">No results found. Try rephrasing your question.</p>
    </div>
  );
}

function ErrorState({
  error,
  suggestion,
  onRetry,
}: {
  error: string;
  suggestion?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div className="space-y-2">
          <p className="text-sm text-text-primary">{error}</p>
          {suggestion && (
            <p className="text-xs text-text-secondary">{suggestion}</p>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportCSV({
  data,
  columns,
  log,
}: {
  data: Record<string, unknown>[];
  columns: string[];
  log: (action: 'compliance_search_export', details?: Record<string, unknown>) => void;
}) {
  function handleExport() {
    const displayCols = columns.length > 0 ? columns : Object.keys(data[0] || {});

    const rows = [
      SEARCH_DISCLAIMER_TEXT,
      DISCLAIMER_EXPORT,
      '',
      displayCols.join(','),
      ...data.map((row) =>
        displayCols
          .map((col) => {
            const val = row[col];
            const str = val == null ? '' : String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(','),
      ),
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-search-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    log('compliance_search_export', { rowCount: data.length });
    toast.success('CSV exported');
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
    >
      <Download className="h-3 w-3" />
      Export CSV
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCellValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

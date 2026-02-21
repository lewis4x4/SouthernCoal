import { useEffect, useCallback, useState } from 'react';
import { useComplianceMatrix, type MatrixCellStatus } from '@/hooks/useComplianceMatrix';
import { useQueueStore } from '@/stores/queue';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { GlassProgress } from '@/components/ui/GlassProgress';
import { CATEGORIES, STATES } from '@/lib/constants';
import { DISCLAIMER_EXPORT } from '@/lib/disclaimer';
import { cn } from '@/lib/cn';
import { Download, CheckCircle2 } from 'lucide-react';

type ExportFormat = 'csv' | 'markdown';

/** localStorage key for expected counts per state */
const EXPECTED_KEY = 'scc-matrix-expected';

function getExpectedCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(EXPECTED_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function setExpectedCount(stateCode: string, count: number) {
  const current = getExpectedCounts();
  current[stateCode] = count;
  localStorage.setItem(EXPECTED_KEY, JSON.stringify(current));
}

const CELL_COLORS: Record<MatrixCellStatus, string> = {
  empty: 'bg-white/[0.02] border-white/[0.04]',
  uploaded: 'bg-status-queued/10 border-status-queued/20',
  processing: 'bg-status-processing/10 border-status-processing/20 animate-pulse-glow-amber',
  imported: 'bg-status-imported/10 border-status-imported/20',
  failed: 'bg-status-failed/10 border-status-failed/20',
};

/**
 * 5×8 Compliance Matrix — States (rows) × Categories (columns).
 * Cell color indicates upload/processing status.
 * Click cell → filter queue. Export CSV/Markdown with disclaimer.
 */
export function ComplianceMatrix() {
  const { cells, stateProgress, categoryCounts } = useComplianceMatrix();
  const setFilters = useQueueStore((s) => s.setFilters);
  const { can } = usePermissions();
  const { log } = useAuditLog();
  const [expectedCounts, setExpectedCounts] = useState(getExpectedCounts);

  function handleCellClick(stateCode: string, categoryKey: string) {
    setFilters({ stateCode, category: categoryKey, status: 'all' });
  }

  function handleExpectedChange(stateCode: string, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setExpectedCount(stateCode, num);
      setExpectedCounts((prev) => ({ ...prev, [stateCode]: num }));
    }
  }

  const exportMatrix = useCallback((format: ExportFormat) => {
    const headers = ['State', ...CATEGORIES.map((c) => c.matrixLabel), 'Progress'];
    const rows: string[][] = [];

    for (const state of STATES) {
      const row = [state.code];
      for (const cat of CATEGORIES) {
        const cell = cells[state.code]?.[cat.dbKey];
        row.push(cell ? `${cell.count} (${cell.status})` : '0');
      }
      row.push(`${stateProgress[state.code] ?? 0}%`);
      rows.push(row);
    }

    let content: string;

    if (format === 'csv') {
      const csvRows = [headers.join(','), ...rows.map((r) => r.join(','))];
      csvRows.push('');
      csvRows.push(`"${DISCLAIMER_EXPORT}"`);
      content = csvRows.join('\n');
    } else {
      const mdHeader = `| ${headers.join(' | ')} |`;
      const mdSep = `| ${headers.map(() => '---').join(' | ')} |`;
      const mdRows = rows.map((r) => `| ${r.join(' | ')} |`);
      content = [mdHeader, mdSep, ...mdRows, '', `> ${DISCLAIMER_EXPORT}`].join('\n');
    }

    log(format === 'csv' ? 'matrix_export_csv' : 'matrix_export_markdown');

    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-matrix.${format === 'csv' ? 'csv' : 'md'}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cells, stateProgress, log]);

  // Listen for CommandPalette export trigger
  useEffect(() => {
    const handler = () => exportMatrix('csv');
    document.addEventListener('export-matrix-csv', handler);
    return () => document.removeEventListener('export-matrix-csv', handler);
  }, [exportMatrix]);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-text-primary">Compliance Matrix</h3>
        {can('export') && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => exportMatrix('csv')}
              className="px-2 py-1 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
              title="Export as CSV"
            >
              <Download size={10} className="inline mr-0.5" />
              CSV
            </button>
            <button
              onClick={() => exportMatrix('markdown')}
              className="px-2 py-1 text-[10px] font-medium rounded text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
              title="Export as Markdown"
            >
              <Download size={10} className="inline mr-0.5" />
              MD
            </button>
          </div>
        )}
      </div>

      {/* Matrix grid */}
      <div className="overflow-x-auto p-3">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-text-muted">
              <th className="text-left py-1 px-1.5 font-medium w-10">State</th>
              {CATEGORIES.map((cat) => (
                <th key={cat.dbKey} className="text-center py-1 px-1 font-medium">
                  <span className="block truncate max-w-[60px]" title={cat.label}>
                    {cat.matrixLabel}
                  </span>
                  <span className="text-text-muted font-normal">
                    {categoryCounts[cat.dbKey] ?? 0}
                  </span>
                </th>
              ))}
              <th className="text-center py-1 px-1 font-medium w-14">Progress</th>
              {can('set_expected') && (
                <th className="text-center py-1 px-1 font-medium w-14">Expected</th>
              )}
            </tr>
          </thead>
          <tbody>
            {STATES.map((state) => (
              <tr key={state.code} className="border-t border-white/[0.03]">
                <td className="py-1.5 px-1.5 font-semibold text-text-primary">
                  {state.code}
                </td>
                {CATEGORIES.map((cat) => {
                  const cell = cells[state.code]?.[cat.dbKey];
                  const status: MatrixCellStatus = cell?.status ?? 'empty';

                  return (
                    <td key={cat.dbKey} className="py-1.5 px-1">
                      <button
                        onClick={() => handleCellClick(state.code, cat.dbKey)}
                        className={cn(
                          'w-full h-7 rounded border flex items-center justify-center transition-all hover:scale-105',
                          CELL_COLORS[status],
                        )}
                        title={`${state.code} — ${cat.label}: ${cell?.count ?? 0} files (${status})`}
                      >
                        {cell && cell.count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <span className="font-mono font-semibold text-text-primary">
                              {cell.count}
                            </span>
                            {cell.verified && (
                              <CheckCircle2 size={8} className="text-verification-verified" />
                            )}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
                <td className="py-1.5 px-1">
                  <div className="flex flex-col items-center gap-0.5">
                    <GlassProgress
                      value={stateProgress[state.code] ?? 0}
                      className="w-full"
                    />
                    <span className="text-text-muted font-mono">
                      {stateProgress[state.code] ?? 0}%
                    </span>
                  </div>
                </td>
                {can('set_expected') && (
                  <td className="py-1.5 px-1">
                    <input
                      type="number"
                      min={0}
                      value={expectedCounts[state.code] ?? ''}
                      onChange={(e) => handleExpectedChange(state.code, e.target.value)}
                      className="w-full h-7 rounded bg-white/[0.03] border border-white/[0.08] text-center text-text-secondary text-[10px] font-mono focus:outline-none focus:border-status-queued/50"
                      placeholder="—"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

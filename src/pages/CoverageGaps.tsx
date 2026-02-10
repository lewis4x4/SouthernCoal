import { useState, useCallback } from 'react';
import { Grid3X3, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { STATES } from '@/lib/constants';
import { DISCLAIMER_EXPORT } from '@/lib/disclaimer';
import { useCoverageGapMatrix } from '@/hooks/useCoverageGapMatrix';
import { useAuditLog } from '@/hooks/useAuditLog';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const CATEGORY_TABS = [
  { key: 'lab_data', label: 'Lab Data' },
  { key: 'dmr', label: 'DMRs' },
  { key: 'quarterly_report', label: 'Quarterly' },
] as const;

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);

export function CoverageGaps() {
  const [category, setCategory] = useState('lab_data');
  const [year, setYear] = useState(currentYear);
  const { cells, gapCount, coveredCount, totalCells } = useCoverageGapMatrix(category, year);
  const { log } = useAuditLog();

  const pct = totalCells > 0 ? Math.round((coveredCount / totalCells) * 100) : 0;

  const exportCSV = useCallback(() => {
    const rows = ['State,Month,Year,Status,File Count,Files'];

    for (const state of STATES) {
      const stateCells = cells[state.code];
      if (!stateCells) continue;

      for (const cell of stateCells) {
        rows.push(
          [
            state.code,
            MONTH_LABELS[cell.month],
            cell.year,
            cell.status,
            cell.count,
            `"${cell.fileNames.join('; ')}"`,
          ].join(','),
        );
      }
    }

    rows.push('');
    rows.push(`"${DISCLAIMER_EXPORT}"`);

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coverage-gaps-${category}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    log('coverage_export_csv' as Parameters<typeof log>[0], { category, year });
    toast.success('CSV exported');
  }, [cells, category, year, log]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-xl bg-purple-500/10 p-2.5">
              <Grid3X3 className="h-5 w-5 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Coverage Gap Analysis
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-text-muted">
            Identify missing monthly compliance data across all states
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3">
        {/* Category tabs */}
        <div className="flex items-center gap-1">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategory(tab.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                category === tab.key
                  ? 'bg-white/10 text-white shadow-lg shadow-white/5'
                  : 'text-text-muted hover:bg-white/[0.05] hover:text-text-secondary',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Year selector */}
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-text-secondary focus:border-purple-500/50 focus:outline-none"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Matrix */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-crystal-surface/90 backdrop-blur-sm px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-muted font-medium border-b border-white/[0.06]">
                  State
                </th>
                {MONTH_LABELS.map((m) => (
                  <th
                    key={m}
                    className="px-2 py-3 text-center text-[10px] uppercase tracking-widest text-text-muted font-medium border-b border-white/[0.06]"
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATES.map((state) => (
                <tr key={state.code} className="group">
                  <td className="sticky left-0 z-10 bg-crystal-surface/90 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-text-primary border-b border-white/[0.04]">
                    <span className="mr-1.5">{state.code}</span>
                    <span className="text-[10px] text-text-muted font-normal hidden sm:inline">
                      {state.name}
                    </span>
                  </td>
                  {cells[state.code]?.map((cell) => (
                    <td
                      key={`${state.code}-${cell.month}`}
                      className="px-1 py-2.5 text-center border-b border-white/[0.04]"
                    >
                      <CoverageCell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary footer */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-text-secondary">
            <span className="font-semibold text-text-primary">{coveredCount}</span>/{totalCells} covered
            <span className="ml-1 text-text-muted">({pct}%)</span>
          </span>
          <span className="text-text-muted">·</span>
          <span className={cn('font-medium', gapCount > 0 ? 'text-red-400' : 'text-emerald-400')}>
            {gapCount} gap{gapCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Legend + Export */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/20 border border-red-500/30" />
              Gap
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30" />
              Covered
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/20 border border-amber-500/30 animate-pulse" />
              Processing
            </span>
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}

function CoverageCell({ cell }: { cell: { status: string; count: number; fileNames: string[] } }) {
  const tooltip =
    cell.count > 0
      ? cell.fileNames.slice(0, 5).join('\n') +
        (cell.fileNames.length > 5 ? `\n+${cell.fileNames.length - 5} more` : '')
      : 'No data uploaded';

  return (
    <div
      title={tooltip}
      className={cn(
        'mx-auto h-8 w-8 rounded-md border flex items-center justify-center text-[10px] font-medium cursor-default transition-all',
        cell.status === 'empty' && 'bg-red-500/10 border-red-500/20 text-red-400/60',
        cell.status === 'has_data' && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        cell.status === 'processing' && 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse',
        cell.status === 'failed' && 'bg-red-500/20 border-red-500/30 text-red-400',
      )}
    >
      {cell.count > 0 ? cell.count : ''}
    </div>
  );
}

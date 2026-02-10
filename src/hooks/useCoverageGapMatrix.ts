import { useMemo } from 'react';
import { useQueueStore } from '@/stores/queue';
import { STATES } from '@/lib/constants';

export interface GapCell {
  stateCode: string;
  month: number; // 0-11
  year: number;
  count: number;
  status: 'empty' | 'has_data' | 'processing' | 'failed';
  fileNames: string[];
}

export interface CoverageGapData {
  /** [stateCode] → 12 GapCells (one per month) */
  cells: Record<string, GapCell[]>;
  gapCount: number;
  coveredCount: number;
  totalCells: number;
}

const MONTH_COUNT = 12;

/**
 * Aggregates queue entries into a state × month coverage matrix.
 * Pure client-side — no DB queries. Same pattern as useComplianceMatrix.
 */
export function useCoverageGapMatrix(
  category: string,
  year: number,
): CoverageGapData {
  const entries = useQueueStore((s) => s.entries);

  return useMemo(() => {
    // Initialize empty 5×12 grid
    const cells: Record<string, GapCell[]> = {};
    for (const state of STATES) {
      cells[state.code] = Array.from({ length: MONTH_COUNT }, (_, month) => ({
        stateCode: state.code,
        month,
        year,
        count: 0,
        status: 'empty' as const,
        fileNames: [],
      }));
    }

    // Filter entries to selected category
    const filtered = entries.filter((e) => e.file_category === category);

    for (const entry of filtered) {
      const stateCode = entry.state_code;
      if (!stateCode || !cells[stateCode]) continue;

      // Determine which months this entry covers
      const months = getEntryMonths(entry, category, year);

      for (const month of months) {
        const cell = cells[stateCode]![month]!;
        cell.count++;
        cell.fileNames.push(entry.file_name);

        // Status priority: failed > processing > has_data
        if (entry.status === 'failed') {
          cell.status = 'failed';
        } else if (
          entry.status === 'processing' &&
          cell.status !== 'failed'
        ) {
          cell.status = 'processing';
        } else if (cell.status === 'empty') {
          cell.status = 'has_data';
        }
      }
    }

    // Count gaps and covered cells
    let gapCount = 0;
    let coveredCount = 0;
    for (const state of STATES) {
      for (const cell of cells[state.code]!) {
        if (cell.status === 'empty') {
          gapCount++;
        } else {
          coveredCount++;
        }
      }
    }

    return {
      cells,
      gapCount,
      coveredCount,
      totalCells: STATES.length * MONTH_COUNT,
    };
  }, [entries, category, year]);
}

/**
 * Determines which months (0-11) an entry covers for the given year.
 */
function getEntryMonths(
  entry: { extracted_data: Record<string, unknown> | null; created_at: string },
  category: string,
  year: number,
): number[] {
  if (category === 'lab_data') {
    return getLabDataMonths(entry, year);
  }

  // DMRs, quarterly reports, etc — use created_at as fallback
  const created = new Date(entry.created_at);
  if (created.getFullYear() === year) {
    return [created.getMonth()];
  }
  return [];
}

/**
 * Lab data entries have extracted_data.date_range.earliest/latest.
 * Expands the date range to all months covered within the target year.
 */
function getLabDataMonths(
  entry: { extracted_data: Record<string, unknown> | null; created_at: string },
  year: number,
): number[] {
  const data = entry.extracted_data;
  const dateRange = data?.date_range as
    | { earliest?: string; latest?: string }
    | undefined;

  if (!dateRange?.earliest || !dateRange?.latest) {
    // Fallback to created_at
    const created = new Date(entry.created_at);
    if (created.getFullYear() === year) {
      return [created.getMonth()];
    }
    return [];
  }

  const earliest = new Date(dateRange.earliest);
  const latest = new Date(dateRange.latest);
  const months: number[] = [];

  // Walk month-by-month from earliest to latest, collecting months in target year
  const current = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const end = new Date(latest.getFullYear(), latest.getMonth(), 1);

  while (current <= end) {
    if (current.getFullYear() === year) {
      months.push(current.getMonth());
    }
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

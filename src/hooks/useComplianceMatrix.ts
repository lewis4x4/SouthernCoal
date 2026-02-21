import { useMemo } from 'react';
import { useQueueStore } from '@/stores/queue';
import { useVerificationStore } from '@/stores/verification';
import { CATEGORIES, STATES } from '@/lib/constants';
import type { MatrixCell, SummaryStats } from '@/types/matrix';

export type MatrixCellStatus = 'empty' | 'uploaded' | 'processing' | 'imported' | 'failed';

export interface MatrixData {
  /** [stateCode][categoryDbKey] → cell info */
  cells: Record<string, Record<string, MatrixCell>>;
  /** Per-state progress (0–100) */
  stateProgress: Record<string, number>;
  /** Per-category count */
  categoryCounts: Record<string, number>;
  stats: SummaryStats;
}

/**
 * Aggregates queue entries into a 5×8 compliance matrix.
 * Also provides summary stats for the dashboard cards.
 */
export function useComplianceMatrix(): MatrixData {
  const entries = useQueueStore((s) => s.entries);
  const verificationStatuses = useVerificationStore((s) => s.statuses);

  return useMemo(() => {
    const cells: Record<string, Record<string, MatrixCell>> = {};
    const categoryCounts: Record<string, number> = {};
    const stateProgress: Record<string, number> = {};

    let totalPermits = 0;
    let totalOutfalls = 0;
    let totalLimits = 0;
    let awaitingReview = 0;

    // Init cells
    for (const state of STATES) {
      cells[state.code] = {};
      for (const cat of CATEGORIES) {
        cells[state.code]![cat.dbKey] = {
          stateCode: state.code,
          categoryKey: cat.dbKey,
          status: 'empty',
          count: 0,
          verified: false,
        };
      }
    }

    // Init category counts
    for (const cat of CATEGORIES) {
      categoryCounts[cat.dbKey] = 0;
    }

    // Populate from queue entries
    for (const entry of entries) {
      const stateCode = entry.state_code;
      const catKey = entry.file_category;

      if (stateCode && cells[stateCode]?.[catKey]) {
        const cell = cells[stateCode]![catKey]!;
        cell.count++;

        // Determine cell status (worst status wins for display)
        if (entry.status === 'failed') {
          cell.status = 'failed';
        } else if (entry.status === 'processing' && cell.status !== 'failed') {
          cell.status = 'processing';
        } else if (entry.status === 'embedding_failed' && cell.status !== 'failed') {
          cell.status = 'failed';
        } else if (
          (entry.status === 'imported' || entry.status === 'parsed' || entry.status === 'embedded') &&
          cell.status !== 'failed' &&
          cell.status !== 'processing'
        ) {
          cell.status = 'imported';
          // Check verification status per v6 5c
          const vStatus = verificationStatuses[entry.id];
          if (vStatus === 'verified') {
            cell.verified = true;
          }
        } else if (
          cell.status === 'empty' &&
          (entry.status === 'queued' || entry.status === 'uploaded')
        ) {
          cell.status = 'uploaded';
        }
      }

      // Category counts
      if (categoryCounts[catKey] !== undefined) {
        categoryCounts[catKey]!++;
      }

      // Aggregate permit stats from extracted_data
      if (catKey === 'npdes_permit') {
        totalPermits++;
        const data = entry.extracted_data as Record<string, unknown> | null;
        if (data) {
          // Only count outfalls/limits from document types that define them
          const docType = data.document_type as string | undefined;
          const hasLimits = !docType || ['original_permit', 'renewal', 'draft_permit', 'tsmp_permit', 'modification'].includes(docType);
          if (hasLimits) {
            if (typeof data.outfall_count === 'number') totalOutfalls += data.outfall_count;
            if (typeof data.limit_count === 'number') totalLimits += data.limit_count;
          }
        }

        // Awaiting review: imported/embedded + unreviewed (v6 5d)
        if (entry.status === 'imported' || entry.status === 'embedded') {
          const vStatus = verificationStatuses[entry.id];
          if (!vStatus || vStatus === 'unreviewed') {
            awaitingReview++;
          }
        }
      }
    }

    // Calculate state progress
    const totalCategories = CATEGORIES.length;
    for (const state of STATES) {
      let filledCount = 0;
      for (const cat of CATEGORIES) {
        if (cells[state.code]![cat.dbKey]!.status !== 'empty') {
          filledCount++;
        }
      }
      stateProgress[state.code] = Math.round((filledCount / totalCategories) * 100);
    }

    return {
      cells,
      stateProgress,
      categoryCounts,
      stats: {
        totalPermits,
        totalOutfalls,
        totalLimits,
        awaitingReview,
      },
    };
  }, [entries, verificationStatuses]);
}

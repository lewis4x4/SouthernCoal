import { describe, expect, it } from 'vitest';
import { formatMatrixCellExport } from '../matrix-export';
import type { MatrixCell } from '@/types/matrix';

const baseCell: MatrixCell = {
  stateCode: 'AL',
  categoryKey: 'npdes_permit',
  status: 'imported',
  count: 3,
  verified: true,
  reviewableCount: 2,
  verifiedCount: 1,
};

describe('formatMatrixCellExport', () => {
  it('returns 0 for empty cells', () => {
    expect(formatMatrixCellExport(undefined)).toBe('0');
    expect(formatMatrixCellExport({ ...baseCell, count: 0 })).toBe('0');
  });

  it('includes status without verification when nothing is reviewable', () => {
    expect(
      formatMatrixCellExport({
        ...baseCell,
        count: 2,
        status: 'uploaded',
        reviewableCount: 0,
        verifiedCount: 0,
      }),
    ).toBe('2 (uploaded)');
  });

  it('appends verified/total when reviewable entries exist', () => {
    expect(formatMatrixCellExport(baseCell)).toBe('3 (imported) 1/2 verified');
  });
});

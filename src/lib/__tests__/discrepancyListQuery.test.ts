import { describe, expect, it } from 'vitest';
import {
  MAX_DISCREPANCY_TABLE_ROWS,
  resolveDiscrepancyStatusFilter,
} from '@/lib/discrepancyListQuery';

describe('discrepancyListQuery', () => {
  it('defaults table fetch to pending when no status filter', () => {
    expect(resolveDiscrepancyStatusFilter({})).toBe('pending');
  });

  it('honors explicit status filter', () => {
    expect(resolveDiscrepancyStatusFilter({ status: 'escalated' })).toBe('escalated');
  });

  it('caps table rows below post-rerun volume', () => {
    expect(MAX_DISCREPANCY_TABLE_ROWS).toBeLessThanOrEqual(5000);
  });
});

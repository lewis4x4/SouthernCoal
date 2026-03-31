import { describe, it, expect } from 'vitest';
import { visitNeedsDisposition } from '../fieldVisitDisposition';

describe('visitNeedsDisposition', () => {
  it('is true for assigned and in_progress', () => {
    expect(visitNeedsDisposition({ visit_status: 'assigned' })).toBe(true);
    expect(visitNeedsDisposition({ visit_status: 'in_progress' })).toBe(true);
  });

  it('is false for terminal statuses', () => {
    expect(visitNeedsDisposition({ visit_status: 'completed' })).toBe(false);
    expect(visitNeedsDisposition({ visit_status: 'cancelled' })).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MILESTONE_2_FIELD_SYNC_AUDIT_ACTIONS,
  MILESTONE_2_QA_AUTOMATED_COVERAGE,
  MILESTONE_2_QA_VITEST_FILES,
} from '../milestone2QaMap';
import { isFieldOutboundConflictHoldError, FieldOutboundConflictHoldError } from '../fieldOutboundQueue';

describe('Milestone 2 QA automated coverage (B1–B5)', () => {
  it('documents Vitest files for each acceptance criterion', () => {
    expect(MILESTONE_2_QA_AUTOMATED_COVERAGE.B1.length).toBeGreaterThan(0);
    expect(MILESTONE_2_QA_AUTOMATED_COVERAGE.B2.length).toBeGreaterThan(0);
    expect(MILESTONE_2_QA_AUTOMATED_COVERAGE.B3.length).toBeGreaterThan(0);
    expect(MILESTONE_2_QA_AUTOMATED_COVERAGE.B4.length).toBeGreaterThan(0);
    expect(MILESTONE_2_QA_AUTOMATED_COVERAGE.B5.length).toBeGreaterThan(0);
  });

  it('qa:lane-a-m2 Vitest files exist on disk', () => {
    const repoRoot = resolve(import.meta.dirname, '../../..');
    for (const rel of MILESTONE_2_QA_VITEST_FILES) {
      expect(existsSync(resolve(repoRoot, rel)), rel).toBe(true);
    }
    expect(MILESTONE_2_QA_VITEST_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it('B5 — sync-resolution audit actions include conflict hold', () => {
    expect(MILESTONE_2_FIELD_SYNC_AUDIT_ACTIONS).toContain('field_outbound_conflict_hold');
    expect(MILESTONE_2_FIELD_SYNC_AUDIT_ACTIONS).toContain('field_outbound_queue_flushed');
    expect(MILESTONE_2_FIELD_SYNC_AUDIT_ACTIONS).toContain('field_outbound_queue_blocked');
  });

  it('B4 — conflict hold error is distinguishable from generic failures', () => {
    const err = new FieldOutboundConflictHoldError('hold', {
      reason: 'visit_already_terminal',
      visitId: 'v1',
    });
    expect(isFieldOutboundConflictHoldError(err)).toBe(true);
    expect(isFieldOutboundConflictHoldError(new Error('network'))).toBe(false);
  });
});

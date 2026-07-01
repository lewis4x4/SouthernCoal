import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MILESTONE_1_FIELD_AUDIT_ACTIONS,
  MILESTONE_1_QA_AUTOMATED_COVERAGE,
  MILESTONE_1_QA_VITEST_FILES,
} from '../milestone1QaMap';

describe('Milestone 1 QA automated coverage (A1–A6)', () => {
  it('documents Vitest files for each acceptance criterion', () => {
    expect(MILESTONE_1_QA_AUTOMATED_COVERAGE.A1.length).toBeGreaterThan(0);
    expect(MILESTONE_1_QA_AUTOMATED_COVERAGE.A2.length).toBeGreaterThan(0);
    expect(MILESTONE_1_QA_AUTOMATED_COVERAGE.A3.length).toBeGreaterThan(0);
    expect(MILESTONE_1_QA_AUTOMATED_COVERAGE.A4.length).toBeGreaterThan(0);
    expect(MILESTONE_1_QA_AUTOMATED_COVERAGE.A5.length).toBeGreaterThan(0);
    expect(MILESTONE_1_QA_AUTOMATED_COVERAGE.A6.length).toBeGreaterThan(0);
  });

  it('qa:lane-a-m1 Vitest files exist on disk', () => {
    const repoRoot = resolve(import.meta.dirname, '../../..');
    for (const rel of MILESTONE_1_QA_VITEST_FILES) {
      expect(existsSync(resolve(repoRoot, rel)), rel).toBe(true);
    }
    expect(MILESTONE_1_QA_VITEST_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it('A5 — field visit audit actions cover online complete and offline queue', () => {
    expect(MILESTONE_1_FIELD_AUDIT_ACTIONS).toContain('field_visit_completed');
    expect(MILESTONE_1_FIELD_AUDIT_ACTIONS).toContain('field_visit_completion_queued');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reportSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/generate-report/index.ts'),
  'utf8',
);

describe('generate-report registry (A2)', () => {
  it('registers tier 2–5 keys without prerequisite stub helper', () => {
    expect(reportSource).not.toContain('rptPrerequisiteStub');
    expect(reportSource).toContain('sampling_completeness: rptSamplingCompleteness');
    expect(reportSource).toContain('stipulated_penalty_exposure: rptStipulatedPenaltyExposure');
    expect(reportSource).toContain('lab_results_summary: rptLabResultsSummary');
    expect(reportSource).toContain('exceedance_detection: rptExceedanceDetection');
    expect(reportSource).toContain('corrective_action_status: rptCorrectiveActionStatus');
  });

  it('implements real query bodies for penalty and gap exports', () => {
    expect(reportSource).toContain("from('penalty_exposure_lines')");
    expect(reportSource).toContain("from('sampling_gap_records')");
    expect(reportSource).toContain('async function rptStipulatedPenaltyExposure');
  });
});

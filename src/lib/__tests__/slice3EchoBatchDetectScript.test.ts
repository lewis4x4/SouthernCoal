import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('slice3 echo batch detect script (task 3.35)', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'scripts/slice3-echo-batch-detect.mjs'),
    'utf8',
  );

  it('uses head-only counts for discrepancy snapshots', () => {
    expect(source).toContain('restCount(');
    expect(source).toContain('missing_internal');
    expect(source).not.toContain('select=discrepancy_type');
  });

  it('supports resume and job_runs summary', () => {
    expect(source).toContain('--resume');
    expect(source).toContain('jobRunSummary');
    expect(source).toContain('run_detect_discrepancies_echo_job');
  });
});

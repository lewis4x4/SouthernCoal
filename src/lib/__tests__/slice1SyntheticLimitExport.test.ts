import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('slice1 export synthetic limits script', () => {
  const script = readFileSync(
    resolve(process.cwd(), 'scripts/slice1-export-synthetic-limits.mjs'),
    'utf8',
  );

  it('queries SYNTHETIC_UAT_SLICE1 permit_limits for SCC org', () => {
    expect(script).toContain('SYNTHETIC_UAT_SLICE1');
    expect(script).toContain('npdes_permits!inner');
  });
});

describe('SyntheticLimitReviewPanel', () => {
  const panel = readFileSync(
    resolve(process.cwd(), 'src/components/external-data/SyntheticLimitReviewPanel.tsx'),
    'utf8',
  );

  it('exports CSV and references QA script', () => {
    expect(panel).toContain('useSyntheticPermitLimitsExport');
    expect(panel).toContain('qa:slice1-export-synthetic-limits');
    expect(panel).toContain('SYNTHETIC_UAT_SLICE1');
  });
});

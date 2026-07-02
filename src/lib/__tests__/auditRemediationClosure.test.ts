import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('detect-discrepancies ECHO status normalization', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/functions/detect-discrepancies/index.ts'),
    'utf8',
  );
  const shared = readFileSync(
    resolve(process.cwd(), 'supabase/functions/_shared/echoPermitStatusMap.ts'),
    'utf8',
  );

  it('compares semantic permit status not raw ECHO labels', () => {
    expect(source).toContain('permitStatusesSemanticallyMatch');
    expect(shared).toContain('effective');
    expect(shared).toContain('active');
  });
});

describe('slice1 synthetic limits export ilike filter', () => {
  const script = readFileSync(
    resolve(process.cwd(), 'scripts/slice1-export-synthetic-limits.mjs'),
    'utf8',
  );

  it('uses URL-encoded ilike wildcard', () => {
    expect(script).toContain('ilike.%25SYNTHETIC_UAT_SLICE1%25');
  });
});

describe('DiscrepancyDetailPanel accessibility', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/review-queue/DiscrepancyDetailPanel.tsx'),
    'utf8',
  );

  it('exposes dialog semantics and escape close', () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("event.key === 'Escape'");
  });
});

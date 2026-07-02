import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('bulk discrepancy triage RPC (task 3.36)', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703190000_bulk_discrepancy_triage_rpc.sql',
    ),
    'utf8',
  );

  it('defines filterable bulk review with cap', () => {
    expect(sql).toContain('bulk_mark_discrepancies_reviewed');
    expect(sql).toContain('p_discrepancy_type');
    expect(sql).toContain('10000');
    expect(sql).toContain("status = 'reviewed'");
    expect(sql).toContain('reviewed_by = v_user');
  });
});

describe('Review Queue server bulk wiring', () => {
  const hookSource = readFileSync(
    resolve(process.cwd(), 'src/hooks/useDiscrepancies.ts'),
    'utf8',
  );
  const pageSource = readFileSync(
    resolve(process.cwd(), 'src/pages/ReviewQueuePage.tsx'),
    'utf8',
  );

  it('calls bulk_mark_discrepancies_reviewed from hook', () => {
    expect(hookSource).toContain('bulk_mark_discrepancies_reviewed');
    expect(hookSource).toContain('bulkMarkReviewedFiltered');
  });

  it('exposes server bulk action on Review Queue page', () => {
    expect(pageSource).toContain('bulkMarkReviewedFiltered');
    expect(pageSource).toContain('Review batch');
  });
});

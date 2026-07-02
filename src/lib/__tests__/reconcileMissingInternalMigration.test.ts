import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('reconcile missing_internal discrepancies migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703210000_reconcile_missing_internal_discrepancies.sql',
    ),
    'utf8',
  );

  it('defines reconcile RPC with exceedance key match', () => {
    expect(sql).toContain('reconcile_missing_internal_discrepancies');
    expect(sql).toContain("dr.discrepancy_type = 'missing_internal'");
    expect(sql).toContain('o.outfall_number = ed.outfall');
    expect(sql).toContain('pr.storet_code = ed.parameter_code');
    expect(sql).toContain('discrepancy_reconciled');
  });
});

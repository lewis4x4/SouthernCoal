import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 repair stuck mirror keys migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703260000_slice1_repair_stuck_mirror_keys.sql',
    ),
    'utf8',
  );

  it('defines repair_slice1_stuck_mirror_keys and hardens reconcile joins', () => {
    expect(sql).toContain('repair_slice1_stuck_mirror_keys');
    expect(sql).toContain('repaired_lab_results');
    expect(sql).toContain("ltrim(pr.storet_code, '0') = ltrim(ed.parameter_code, '0')");
    expect(sql).toContain("ltrim(o.outfall_number, '0') = ltrim(ed.outfall, '0')");
  });
});

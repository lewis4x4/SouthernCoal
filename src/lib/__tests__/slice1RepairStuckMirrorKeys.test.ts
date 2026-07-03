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
  const timeoutFix = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703360000_slice1_repair_stuck_keys_timeout_fix.sql',
    ),
    'utf8',
  );

  it('defines repair_slice1_stuck_mirror_keys and hardens reconcile joins', () => {
    expect(sql).toContain('repair_slice1_stuck_mirror_keys');
    expect(sql).toContain('repaired_lab_results');
    expect(sql).toContain("ltrim(pr.storet_code, '0') = ltrim(ed.parameter_code, '0')");
    expect(sql).toContain("ltrim(o.outfall_number, '0') = ltrim(ed.outfall, '0')");
  });

  it('timeout fix adds scoped permit filter and smaller batch cap', () => {
    expect(timeoutFix).toContain('p_permit_number text DEFAULT NULL');
    expect(timeoutFix).toContain('LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)');
    expect(timeoutFix).toContain("SET statement_timeout = '180s'");
    expect(timeoutFix).toContain('_slice1_repair_candidates');
  });

  it('ships repair script with permit scope and retry', () => {
    const script = readFileSync(
      resolve(import.meta.dirname, '../../../scripts/slice1-repair-stuck-keys.mjs'),
      'utf8',
    );
    expect(script).toContain('repair_slice1_stuck_mirror_keys');
    expect(script).toContain('p_permit_number');
    expect(script).toContain('rpcWithRetry');
  });
});

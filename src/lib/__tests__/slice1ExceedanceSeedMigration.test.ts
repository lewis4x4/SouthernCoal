import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 exceedance seed migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703200000_slice1_batch_exceedances_from_echo.sql',
    ),
    'utf8',
  );
  const timeoutFix = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703350000_slice1_exceedance_seed_timeout_fix.sql',
    ),
    'utf8',
  );

  it('defines seed_slice1_exceedances_from_echo with SYNTHETIC_UAT_SLICE1 label', () => {
    expect(sql).toContain('seed_slice1_exceedances_from_echo');
    expect(sql).toContain('SYNTHETIC_UAT_SLICE1');
    expect(sql).toContain('external_echo_dmrs');
    expect(sql).toContain('sampling_events');
    expect(sql).toContain('lab_results');
    expect(sql).toContain('slice1_echo_mirror_keys');
    expect(sql).toContain('slice1_echo_exceedance_seed');
  });

  it('timeout fix adds scoped permit filter and smaller batch cap', () => {
    expect(timeoutFix).toContain('p_permit_number text DEFAULT NULL');
    expect(timeoutFix).toContain('LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)');
    expect(timeoutFix).toContain("SET statement_timeout = '180s'");
    expect(timeoutFix).toContain('idx_eed_org_violation_npdes');
    expect(timeoutFix).toContain('_slice1_seed_candidates');
  });

  it('caps batch limit at 100', () => {
    expect(timeoutFix).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 50\), 1\), 100\)/);
  });

  it('ships batch seed script with permit scope and retry', () => {
    const script = readFileSync(
      resolve(import.meta.dirname, '../../../scripts/slice1-seed-exceedances.mjs'),
      'utf8',
    );
    expect(script).toContain('seed_slice1_exceedances_from_echo');
    expect(script).toContain('p_permit_number');
    expect(script).toContain('rpcWithRetry');
    expect(script).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});

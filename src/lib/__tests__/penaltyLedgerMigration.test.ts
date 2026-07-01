import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260701190000_penalty_ledger.sql',
);

describe('penalty ledger migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('defines draft miss penalty tiers', () => {
    expect(sql).toContain('calculate_draft_miss_sampling_penalty');
    expect(sql).toContain('2000.00');
    expect(sql).toContain('3000.00');
  });

  it('aggregates sources in get_penalty_ledger_summary', () => {
    expect(sql).toContain('get_penalty_ledger_summary');
    expect(sql).toContain('fts_violations');
    expect(sql).toContain('consent_decree_obligations');
    expect(sql).toContain('compliance_violations');
    expect(sql).toContain('DRAFT — internal estimate');
  });

  it('records sign-off with audit trail', () => {
    expect(sql).toContain('record_penalty_ledger_verification');
    expect(sql).toContain('penalty_ledger_verified');
    expect(sql).toContain('penalty_ledger_verifications');
  });

  it('schedules daily obligation penalty refresh', () => {
    expect(sql).toContain('refresh-obligation-penalties-daily');
  });
});

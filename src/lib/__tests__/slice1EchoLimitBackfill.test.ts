import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 ECHO limit backfill migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703250000_slice1_echo_limit_backfill.sql',
    ),
    'utf8',
  );

  it('defines seed_slice1_permit_limits_from_echo with SYNTHETIC label', () => {
    expect(sql).toContain('seed_slice1_permit_limits_from_echo');
    expect(sql).toContain('SYNTHETIC_UAT_SLICE1');
    expect(sql).toContain('pending_review');
    expect(sql).toContain('map_echo_statistical_base_to_limit_type');
  });

  it('only inserts when ECHO limit_value is present', () => {
    expect(sql).toContain('ed.limit_value IS NOT NULL');
  });
});

describe('map_echo_statistical_base_to_limit_type', () => {
  it('maps DAILY MX to daily_max in migration SQL', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260703250000_slice1_echo_limit_backfill.sql',
      ),
      'utf8',
    );
    expect(sql).toContain("LIKE '%DAILY%MX%'");
    expect(sql).toContain("'daily_max'");
  });
});

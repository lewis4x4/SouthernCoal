import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260702210000_complete_keystone_72_and_domain_stats.sql',
);

describe('complete keystone 72 and domain stats migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('replaces detect_sampling_calendar_gaps with coupled work order helper', () => {
    expect(sql).toContain('open_sampling_gap_with_work_order');
    expect(sql).toContain('valid_to = now()');
  });

  it('defines get_upload_dashboard_domain_stats RPC', () => {
    expect(sql).toContain('get_upload_dashboard_domain_stats');
    expect(sql).toContain('FROM npdes_permits');
    expect(sql).toContain('FROM outfalls o JOIN npdes_permits');
    expect(sql).toContain('FROM permit_limits pl JOIN npdes_permits');
  });

  it('refreshes penalty ledger summary with exposure lines', () => {
    expect(sql).toContain('refresh_penalty_exposure_lines');
    expect(sql).toContain("'citation', citation");
  });
});

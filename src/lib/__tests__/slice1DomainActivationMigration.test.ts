import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 synthetic domain activation migration', () => {
  it('seeds labeled synthetic DMR for KYGE40869', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260703020000_slice1_synthetic_uat_domain_activation.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('SYNTHETIC_UAT_SLICE1');
    expect(sql).toContain('reporting_period_start');
    expect(sql).toContain('dmr_submission_id');
    expect(sql).toContain('dmr_data');
    expect(sql).toContain('KYGE40869');
  });

  it('ships NetDMR CSV fixture for import-path QA', () => {
    const csv = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/seeds/uat/slice1-synthetic-netdmr-kyge40869.csv',
      ),
      'utf8',
    );

    expect(csv).toContain('KYGE40869');
    expect(csv).toContain('00530');
    expect(csv).toContain('SYNTHETIC UAT SLICE1');
  });
});

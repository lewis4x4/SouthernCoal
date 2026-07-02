import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('slice5 compliance snapshot migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703050400_slice5_compliance_snapshot_cms_final.sql',
    ),
    'utf8',
  );
  const cronSql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703050000_slice5_compliance_snapshot_cron.sql',
    ),
    'utf8',
  );

  it('uses CMS reporting_period_start for DMR counts', () => {
    expect(sql).toContain('reporting_period_start');
  });

  it('adapts sampling to CMS sample_date', () => {
    expect(sql).toContain('sample_date');
    expect(sql).toContain('results_received');
  });

  it('registers daily snapshot job in job_runs', () => {
    expect(cronSql).toContain('run_compliance_snapshot_daily_job');
    expect(cronSql).toContain('generate-compliance-snapshot-daily');
  });

  it('scopes auth to authenticated org only', () => {
    expect(sql).toContain('get_user_org_id() IS NOT NULL');
  });
});

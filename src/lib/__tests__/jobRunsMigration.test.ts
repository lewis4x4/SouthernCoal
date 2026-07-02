import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../supabase/migrations/20260703010000_job_runs_and_alert_acknowledgments.sql',
);

function extractFunctionBody(sql: string, functionName: string): string | undefined {
  return sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION ${functionName}\\([\\s\\S]*?END;\\n\\$\\$;`,
    ),
  )?.[0];
}

describe('job runs and alert acknowledgments migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('defines job_runs with bitemporal columns and RLS', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS job_runs');
    expect(sql).toMatch(/job_runs[\s\S]*valid_from timestamptz/);
    expect(sql).toMatch(/job_runs[\s\S]*valid_to timestamptz/);
    expect(sql).toContain("CHECK (status IN ('running', 'succeeded', 'failed'))");
    expect(sql).toContain('ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY');
  });

  it('defines alert_acknowledgments with statutory alert types', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS alert_acknowledgments');
    expect(sql).toContain("'msha_abatement'");
    expect(sql).toContain("'edd_paragraph49'");
    expect(sql).toContain("'sampling_gap'");
    expect(sql).toContain("'exceedance_digest'");
  });

  it('logs failed scheduled jobs to audit_log', () => {
    const body = extractFunctionBody(sql, 'complete_job_run');
    expect(body).toBeTruthy();
    expect(body).toContain("'scheduled_job_failed'");
    expect(body).toContain('job_runs');
  });

  it('wraps sampling gap cron with job run ledger', () => {
    const body = extractFunctionBody(sql, 'run_sampling_gap_detection_for_all_orgs');
    expect(body).toBeTruthy();
    expect(body).toContain('begin_job_run');
    expect(body).toContain('complete_job_run');
    expect(body).toContain('EXCEPTION WHEN OTHERS');
    expect(body).toContain("'detect-sampling-calendar-gaps-nightly'");
  });

  it('includes forced failure path for QA', () => {
    expect(sql).toContain('simulate_scheduled_job_failure');
    const body = extractFunctionBody(sql, 'simulate_scheduled_job_failure');
    expect(body).toContain("'failed'");
    expect(body).toContain('Simulated failure for QA');
  });

  it('acknowledges alerts with audit trail (ack ≠ dismiss)', () => {
    const body = extractFunctionBody(sql, 'acknowledge_alert');
    expect(body).toContain("'statutory_alert_acknowledged'");
    expect(body).not.toContain('review_status');
  });

  it('reschedules wrapped cron entrypoints', () => {
    expect(sql).toContain('run_echo_weekly_sync_job');
    expect(sql).toContain('run_msha_weekly_sync_job');
    expect(sql).toContain('run_exceedance_digest_weekly_job');
    expect(sql).toContain('run_precipitation_sync_daily_job');
    expect(sql).toContain('run_penalty_exposure_refresh_for_all_orgs');
  });
});

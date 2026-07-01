import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const gapMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260701120000_sampling_calendar_gap_detection.sql',
);

function extractFunctionBody(sql: string, functionName: string): string | undefined {
  return sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION ${functionName}\\([\\s\\S]*?END;\\n\\$\\$;`,
    ),
  )?.[0];
}

describe('sampling calendar gap detection migration', () => {
  const sql = readFileSync(gapMigrationPath, 'utf8');

  it('defines gap tables with open-record uniqueness', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sampling_gap_records');
    expect(sql).toContain('uq_sampling_gap_records_open_calendar');
    expect(sql).toContain("WHERE review_status <> 'resolved'");
  });

  it('detects gaps without asserting penalty dollars', () => {
    const body = extractFunctionBody(sql, 'detect_sampling_calendar_gaps');
    expect(body).toBeTruthy();
    expect(body).toContain('refresh_sampling_calendar_statuses');
    expect(body).toContain('sampling_calendar_has_lab_result');
    expect(body).toContain('sampling_calendar_is_documented_excuse');
    expect(body).toContain("'sampling_gap_detection_completed'");
    expect(body).not.toContain('calculate_stipulated_penalty');
  });

  it('schedules nightly pg_cron job', () => {
    expect(sql).toContain("'detect-sampling-calendar-gaps-nightly'");
    expect(sql).toContain('run_sampling_gap_detection_for_all_orgs');
    expect(sql).toContain("'0 6 * * *'");
  });

  it('logs triage updates to audit_log', () => {
    const body = extractFunctionBody(sql, 'update_sampling_gap_review_status');
    expect(body).toBeTruthy();
    expect(body).toContain("'sampling_gap_review_updated'");
  });
});

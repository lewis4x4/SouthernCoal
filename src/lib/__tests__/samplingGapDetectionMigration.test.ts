import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const gapMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260701120000_sampling_calendar_gap_detection.sql',
);
const keystoneMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260702200000_keystone_schema_discipline_72.sql',
);
const jobRunsMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260703010000_job_runs_and_alert_acknowledgments.sql',
);
const orgGuardMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260703080000_review_rpc_org_guards.sql',
);
const readinessMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260705170000_qw1_sampling_gap_readiness.sql',
);
const qw1SeedPath = resolve(process.cwd(), 'scripts/seed-qw1-uat-calendar.sql');

function extractFunctionBody(sql: string, functionName: string): string | undefined {
  return sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION (?:public\\.)?${functionName}\\([\\s\\S]*?\\n(?:\\$\\$|\\$function\\$);`,
    ),
  )?.[0];
}

describe('sampling calendar gap detection migration', () => {
  const sql = readFileSync(gapMigrationPath, 'utf8');
  const keystoneSql = readFileSync(keystoneMigrationPath, 'utf8');
  const jobRunsSql = readFileSync(jobRunsMigrationPath, 'utf8');
  const orgGuardSql = readFileSync(orgGuardMigrationPath, 'utf8');
  const readinessSql = readFileSync(readinessMigrationPath, 'utf8');
  const seedSql = readFileSync(qw1SeedPath, 'utf8');

  it('defines gap tables with RLS and open-record uniqueness', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sampling_gap_detection_runs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sampling_gap_records');
    expect(sql).toContain('ALTER TABLE sampling_gap_detection_runs ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE sampling_gap_records ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('uq_sampling_gap_records_open_calendar');
    expect(sql).toContain("WHERE review_status <> 'resolved'");
  });

  it('detects gaps against lab arrivals and documented field excuses without asserting penalty dollars', () => {
    const body = extractFunctionBody(sql, 'detect_sampling_calendar_gaps');
    expect(body).toBeTruthy();
    expect(body).toContain('refresh_sampling_calendar_statuses');
    expect(body).toContain('sampling_calendar_has_lab_result');
    expect(body).toContain('sampling_calendar_is_documented_excuse');
    expect(body).toContain("'sampling_gap_detection_started'");
    expect(body).toContain("'sampling_gap_detection_completed'");
    expect(body).toContain("'sampling_gap_detection_failed'");
    expect(body).not.toContain('calculate_stipulated_penalty');

    const hasLabResult = extractFunctionBody(sql, 'sampling_calendar_has_lab_result');
    expect(hasLabResult).toContain('lab_results lr');
    expect(hasLabResult).toContain('lr.parameter_id = sc.parameter_id');

    const isDocumentedExcuse = extractFunctionBody(sql, 'sampling_calendar_is_documented_excuse');
    expect(isDocumentedExcuse).toContain("sc.status IN ('skipped', 'no_discharge', 'cancelled')");
    expect(isDocumentedExcuse).toContain("fv.outcome IN ('no_discharge', 'access_issue')");
  });

  it('schedules nightly pg_cron job', () => {
    expect(sql).toContain("'detect-sampling-calendar-gaps-nightly'");
    expect(sql).toContain('run_sampling_gap_detection_for_all_orgs');
    expect(sql).toContain("'0 6 * * *'");
  });

  it('couples newly opened gaps to work orders and avoids duplicate open gaps', () => {
    const openBody = extractFunctionBody(keystoneSql, 'open_sampling_gap_with_work_order');
    expect(openBody).toBeTruthy();
    expect(openBody).toContain("source_type,\n    outfall_id");
    expect(openBody).toContain("'sampling_gap'");
    expect(openBody!.indexOf('INSERT INTO work_orders')).toBeLessThan(
      openBody!.indexOf('INSERT INTO sampling_gap_records'),
    );
    expect(openBody).toContain('UPDATE work_orders');
    expect(openBody).toContain('SET source_id = v_gap_id');

    const body = extractFunctionBody(keystoneSql, 'detect_sampling_calendar_gaps');
    expect(body).toBeTruthy();
    expect(body).toMatch(
      /SELECT id INTO v_existing_id[\s\S]*WHERE calendar_id = rec\.calendar_id[\s\S]*review_status <> 'resolved'/,
    );
    expect(body).toContain('PERFORM open_sampling_gap_with_work_order');
    expect(body).toContain('valid_to = now()');
    expect(body).toContain("wo.status IN ('open', 'assigned', 'in_progress')");
  });

  it('wraps the nightly detector with job_runs success and failure logging', () => {
    const runBody = extractFunctionBody(jobRunsSql, 'run_sampling_gap_detection_for_all_orgs');
    expect(runBody).toBeTruthy();
    expect(runBody).toContain("begin_job_run('detect-sampling-calendar-gaps-nightly'");
    expect(runBody).toContain("complete_job_run(v_run_id, 'succeeded'");
    expect(runBody).toContain("complete_job_run(v_run_id, 'failed'");
    expect(runBody).toContain('EXCEPTION WHEN OTHERS');

    const completeBody = extractFunctionBody(jobRunsSql, 'complete_job_run');
    expect(completeBody).toContain("'scheduled_job_failed'");
    expect(completeBody).toContain('job_runs');

    const simulateBody = extractFunctionBody(jobRunsSql, 'simulate_scheduled_job_failure');
    expect(simulateBody).toContain("'failed'");
    expect(simulateBody).toContain('Simulated failure for QA');
  });

  it('guards QW1 SECURITY DEFINER RPCs with scoped organization resolution', () => {
    const resolverBody = extractFunctionBody(orgGuardSql, 'resolve_scoped_org_id');
    expect(resolverBody).toBeTruthy();
    expect(resolverBody).toContain('p_requested <> v_caller');
    expect(resolverBody).toContain('Access denied: organization mismatch');

    const detectBody = extractFunctionBody(orgGuardSql, 'detect_sampling_calendar_gaps');
    expect(detectBody).toContain('v_org_id uuid := resolve_scoped_org_id(p_organization_id)');

    const openBody = extractFunctionBody(orgGuardSql, 'open_sampling_gap_with_work_order');
    expect(openBody).toContain('PERFORM resolve_scoped_org_id(p_organization_id)');
  });

  it('generates the active calendar window before nightly gap scans', () => {
    const ensureBody = extractFunctionBody(readinessSql, 'ensure_sampling_gap_calendar_window');
    expect(ensureBody).toBeTruthy();
    expect(ensureBody).toContain('generate_sampling_calendar');
    expect(ensureBody).toContain("'not_configured'");
    expect(ensureBody).toContain("'calendar_rows_generated'");

    const detectBody = extractFunctionBody(readinessSql, 'detect_sampling_calendar_gaps');
    expect(detectBody).toBeTruthy();
    expect(detectBody).toContain('ensure_sampling_gap_calendar_window');
    expect(detectBody).toContain("'calendar_generation', v_calendar_generation");
    expect(detectBody).toContain("'readiness_state', v_readiness ->> 'state'");
  });

  it('exposes configured, draft, empty, and not-configured readiness states', () => {
    const readinessBody = extractFunctionBody(
      readinessSql,
      'get_sampling_gap_detection_readiness',
    );

    expect(readinessBody).toBeTruthy();
    expect(readinessBody).toContain("source = 'matrix_upload'");
    expect(readinessBody).toContain("'not_configured'");
    expect(readinessBody).toContain("'empty'");
    expect(readinessBody).toContain("'draft'");
    expect(readinessBody).toContain("'configured'");
    expect(readinessBody).toContain("'latest_run'");
    expect(readinessSql).toContain('GRANT EXECUTE ON FUNCTION public.get_sampling_gap_detection_readiness');
  });

  it('keeps sampling gap helpers internal and manager-gates triage writes', () => {
    const triageBody = extractFunctionBody(readinessSql, 'update_sampling_gap_review_status');
    expect(triageBody).toBeTruthy();
    expect(triageBody).toContain('IF auth.uid() IS NULL THEN');
    expect(triageBody).toContain('IF NOT public.can_manage_sampling_records() THEN');
    expect(triageBody).toContain('work_order_events');
    expect(triageBody).toContain("'sampling_gap_review_updated'");

    expect(readinessSql).toContain('REVOKE ALL ON FUNCTION public.open_sampling_gap_with_work_order');
    expect(readinessSql).toContain('FROM authenticated;');
    expect(readinessSql).toContain('TO service_role;');
  });

  it('logs triage updates to audit_log', () => {
    const body = extractFunctionBody(sql, 'update_sampling_gap_review_status');
    expect(body).toBeTruthy();
    expect(body).toContain("'sampling_gap_review_updated'");
  });

  it('keeps the staging UAT seed path aligned with one missed, one at-risk, one excused, and one future row', () => {
    expect(seedSql).toContain('v_today - 21');
    expect(seedSql).toContain('v_today + 1');
    expect(seedSql).toContain("'skipped', 'skipped'");
    expect(seedSql).toContain('v_today + 30');
    expect(seedSql).toContain(
      "SELECT detect_sampling_calendar_gaps('f0000001-0001-4001-8001-000000000001'::uuid, CURRENT_DATE, 2, 'manual');",
    );
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const phase2MigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260331183000_sampling_calendar_phase2.sql',
);

const retrySafetyMigrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260518220000_sampling_calendar_retry_safety.sql',
);

function extractFunctionBody(sql: string, functionName: string): string | undefined {
  return sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION ${functionName}\\([\\s\\S]*?END;\\n\\$\\$;`,
    ),
  )?.[0];
}

describe('sampling calendar migration guardrails', () => {
  it('validates outfall ownership before manual calendar writes', () => {
    const sql = readFileSync(phase2MigrationPath, 'utf8');
    const functionBody = extractFunctionBody(sql, 'create_manual_sampling_calendar_entry');

    expect(functionBody).toBeTruthy();
    expect(functionBody).toContain('SELECT permit_id');
    expect(functionBody).toContain('FROM outfalls');
    expect(functionBody).toContain("RAISE EXCEPTION 'Outfall % was not found', p_outfall_id;");
    expect(functionBody).toContain(
      "RAISE EXCEPTION 'Outfall % does not belong to permit %', p_outfall_id, p_permit_id;",
    );

    const validationIndex = functionBody!.indexOf('SELECT permit_id');
    const writeIndex = functionBody!.indexOf('INSERT INTO sampling_schedules');
    expect(validationIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(validationIndex);
  });

  it('limits refresh_sampling_calendar_statuses to idle ready rows only', () => {
    const sql = readFileSync(retrySafetyMigrationPath, 'utf8');
    const functionBody = extractFunctionBody(sql, 'refresh_sampling_calendar_statuses');

    expect(functionBody).toBeTruthy();
    expect(functionBody).toContain("dispatch_status = 'ready'");
    expect(functionBody).toContain('current_field_visit_id IS NULL');
    expect(functionBody).toContain('current_route_batch_id IS NULL');
    expect(functionBody).not.toContain("dispatch_status <> 'completed'");
  });

  it('makes apply_sampling_calendar_adjustment makeup idempotent under retry', () => {
    const sql = readFileSync(retrySafetyMigrationPath, 'utf8');
    const functionBody = extractFunctionBody(sql, 'apply_sampling_calendar_adjustment');

    expect(functionBody).toBeTruthy();
    expect(functionBody).toContain('source_calendar_id = p_calendar_id');
    expect(functionBody).toContain("'idempotent', lower(p_adjustment_type) = 'makeup' AND NOT v_created_makeup");
    expect(functionBody).toContain('WHEN unique_violation THEN');
    expect(functionBody).toContain("IF lower(p_adjustment_type) <> 'makeup' OR v_created_makeup THEN");
  });
});

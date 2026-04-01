import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260331183000_sampling_calendar_phase2.sql',
);

describe('sampling calendar migration guardrails', () => {
  it('validates outfall ownership before manual calendar writes', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const functionBody = sql.match(
      /CREATE OR REPLACE FUNCTION create_manual_sampling_calendar_entry\([\s\S]*?END;\n\$\$;/,
    )?.[0];

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
});

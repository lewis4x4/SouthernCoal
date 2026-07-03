import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260704010000_compliance_search_invoker_executor.sql',
);

describe('compliance search invoker executor migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('defines execute_readonly_query as SECURITY INVOKER with auth gate', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.execute_readonly_query');
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain("RAISE EXCEPTION 'Authentication required'");
    expect(sql).toContain("RAISE EXCEPTION 'Only SELECT queries are permitted'");
  });

  it('restricts grants to authenticated only', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.execute_readonly_query');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text, jsonb) TO authenticated');
    expect(sql).not.toContain('TO service_role');
    expect(sql).not.toContain('TO anon');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260701200000_post_audit_security_hardening.sql',
);

describe('post-audit security hardening migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('locks down tom_memory to service_role', () => {
    expect(sql).toContain('ALTER TABLE public.tom_memory ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE public.tom_memory FROM anon, authenticated');
    expect(sql).toContain('GRANT ALL ON TABLE public.tom_memory TO service_role');
    expect(sql).toContain('search_tom_memory');
  });

  it('sets roadmap views to security_invoker and revokes anon', () => {
    expect(sql).toContain('v_roadmap_sync_health SET (security_invoker = true)');
    expect(sql).toContain('v_roadmap_tasks_pending_linear_sync SET (security_invoker = true)');
    expect(sql).toContain('REVOKE ALL ON TABLE public.v_roadmap_sync_health FROM anon');
  });

  it('pins search_path on public functions missing proconfig', () => {
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("cfg LIKE 'search_path=%'");
  });

  it('revokes anon execute on SECURITY DEFINER RPCs', () => {
    expect(sql).toContain('p.prosecdef = true');
    expect(sql).toContain('REVOKE ALL ON FUNCTION %s FROM PUBLIC');
    expect(sql).toContain('REVOKE ALL ON FUNCTION %s FROM anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION %s TO authenticated');
  });
});

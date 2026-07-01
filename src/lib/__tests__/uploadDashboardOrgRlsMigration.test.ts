import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260701182156_upload_dashboard_org_rls_hardening.sql',
);

describe('upload dashboard org RLS migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('requires organization_id on queue rows when backfill complete', () => {
    expect(sql).toContain('ALTER COLUMN organization_id SET NOT NULL');
  });

  it('scopes SELECT/INSERT/UPDATE to organization_id', () => {
    expect(sql).toContain('Users can view own org queue entries');
    expect(sql).toContain('Users can insert queue entries');
    expect(sql).toContain('Users can update own org queue entries');
    expect(sql).toMatch(/organization_id = \(\s*\n?\s*SELECT organization_id FROM public\.user_profiles/s);
  });

  it('validates INSERT organization_id matches caller org', () => {
    expect(sql).toContain('uploaded_by = auth.uid()');
    expect(sql).toContain('WITH CHECK');
  });
});

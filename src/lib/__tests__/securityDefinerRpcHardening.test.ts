import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('security definer RPC auth hardening migration', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260703310000_security_definer_rpc_auth_hardening.sql'),
    'utf8',
  );

  it('requires authentication and org context on mutating RPCs', () => {
    expect(sql).toContain('Authentication required');
    expect(sql).toContain('Organization context required');
    expect(sql).not.toMatch(/AND\s*\(\s*auth\.uid\(\)\s+IS\s+NULL\s+OR/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.update_permit_limit_review_status');
    expect(sql).toContain('update_npdes_permit_administrative_disposition');
  });
});

describe('DataQualityPanel administrative disposition RPC', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/admin/DataQualityPanel.tsx'),
    'utf8',
  );

  it('uses RPC instead of direct npdes_permits update', () => {
    expect(source).toContain('update_npdes_permit_administrative_disposition');
    expect(source).not.toMatch(/from\('npdes_permits'\)\s*\n\s*\.update/);
  });
});

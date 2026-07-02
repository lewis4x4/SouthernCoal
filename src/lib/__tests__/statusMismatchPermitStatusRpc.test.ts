import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('status mismatch permit status RPC', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260703300000_status_mismatch_permit_status_rpc.sql'),
    'utf8',
  );

  it('defines align_npdes_permit_status_from_echo with org scope', () => {
    expect(sql).toContain('align_npdes_permit_status_from_echo');
    expect(sql).toContain('map_echo_permit_status_to_internal');
    expect(sql).toContain('can_manage_sampling_records()');
    expect(sql).toContain('permit_status_aligned_from_echo');
  });
});

describe('align permit status RPC hardening (canonical)', () => {
  const hardened = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260703310000_security_definer_rpc_auth_hardening.sql'),
    'utf8',
  );

  it('requires auth on align_npdes_permit_status_from_echo', () => {
    expect(hardened).toContain('Authentication required');
    expect(hardened).not.toMatch(/AND\s*\(\s*auth\.uid\(\)\s+IS\s+NULL\s+OR/);
  });
});

describe('DiscrepancyDetailPanel align status', () => {
  const detail = readFileSync(
    resolve(process.cwd(), 'src/components/review-queue/DiscrepancyDetailPanel.tsx'),
    'utf8',
  );

  it('wires align button for status_mismatch rows with permit id', () => {
    expect(detail).toContain('useAlignPermitStatusFromEcho');
    expect(detail).toContain('handleAlignStatus');
    expect(detail).toContain('Set internal status to');
  });
});

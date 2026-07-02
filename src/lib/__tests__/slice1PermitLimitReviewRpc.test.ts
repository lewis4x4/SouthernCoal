import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readMigration(name: string): string {
  return readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
}

describe('permit limit review status RPC', () => {
  const sql = readMigration('20260703290000_permit_limit_review_status_rpc.sql');

  it('defines update_permit_limit_review_status with org scope and can_manage_sampling_records', () => {
    expect(sql).toContain('update_permit_limit_review_status');
    expect(sql).toContain('can_manage_sampling_records()');
    expect(sql).toContain('get_user_org_id()');
    expect(sql).toContain('pending_review');
    expect(sql).toContain('verified');
    expect(sql).toContain('disputed');
  });
});

describe('SyntheticLimitReviewPanel', () => {
  const panel = readFileSync(
    resolve(process.cwd(), 'src/components/external-data/SyntheticLimitReviewPanel.tsx'),
    'utf8',
  );
  const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useSyntheticPermitLimits.ts'), 'utf8');

  it('wires review queue with verify/dispute actions', () => {
    expect(panel).toContain('useSyntheticPermitLimits');
    expect(panel).toContain('VerificationBadge');
    expect(panel).toContain("handleReview(row.id, 'verified')");
    expect(hook).toContain('update_permit_limit_review_status');
  });
});

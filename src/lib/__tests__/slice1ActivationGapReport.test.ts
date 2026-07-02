import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 activation gap report migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703240000_slice1_activation_gap_report.sql',
    ),
    'utf8',
  );

  it('defines report_slice1_activation_gaps RPC with funnel stages', () => {
    expect(sql).toContain('report_slice1_activation_gaps');
    expect(sql).toContain('distinct_violation_keys');
    expect(sql).toContain('has_permit_limit');
    expect(sql).toContain('top_permits_missing_limits');
    expect(sql).toContain('pending_missing_internal');
  });

  it('scopes by organization and org guard for authenticated callers', () => {
    expect(sql).toContain('get_user_org_id()');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.report_slice1_activation_gaps(uuid) TO service_role');
  });
});

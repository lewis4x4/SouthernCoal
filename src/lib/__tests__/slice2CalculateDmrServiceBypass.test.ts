import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice2 calculate_dmr service role bypass', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703220000_slice2_calculate_dmr_service_bypass.sql',
    ),
    'utf8',
  );

  it('allows null caller org (service role QA)', () => {
    expect(sql).toContain('v_caller_org IS NOT NULL AND v_submission_org IS DISTINCT FROM v_caller_org');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice1 propagate permit limits migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703340000_slice1_propagate_permit_limits.sql',
    ),
    'utf8',
  );

  it('defines seed_slice1_permit_limits_propagate with SYNTHETIC label', () => {
    expect(sql).toContain('seed_slice1_permit_limits_propagate');
    expect(sql).toContain('SYNTHETIC_UAT_SLICE1');
    expect(sql).toContain('pending_review');
    expect(sql).toContain('propagated from outfall');
  });

  it('uses activation gap keyed join grain', () => {
    expect(sql).toContain('resolve_npdes_permit_id_for_echo');
    expect(sql).toContain('violation_code IS NOT NULL');
    expect(sql).toContain('permit_limit_id IS NULL');
  });

  it('falls back to org-wide templates when same-permit template is absent', () => {
    expect(sql).toContain('templates_org AS');
    expect(sql).toContain('templates_permit AS');
    expect(sql).toContain('org-wide template from permit');
  });

  it('filters by optional permit number', () => {
    expect(sql).toContain('p_permit_number');
    expect(sql).toContain('upper(k.permit_number) = upper(trim(p_permit_number))');
  });

  it('skips outfalls that already have active numeric limits', () => {
    expect(sql).toContain('skipped_existing');
    expect(sql).toContain("pl.limit_type <> 'report_only'");
  });
});

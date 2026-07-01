import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('edd paragraph49 migration', () => {
  it('defines evaluation table, RPCs, and RLS', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260701130000_edd_paragraph49_evaluation.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS edd_paragraph49_evaluations');
    expect(sql).toContain('evaluate_edd_import_paragraph49');
    expect(sql).toContain('update_edd_paragraph49_review_status');
    expect(sql).toContain('is_late_48h');
    expect(sql).toContain('is_exceedance_only');
    expect(sql).toContain('edd_paragraph49_evaluated');
  });

  it('resolves org from lab import graph in follow-up fix migration', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260702140000_qw2_fix_paragraph49_org_resolution.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('COALESCE(p.organization_id, si.organization_id)');
    expect(sql).not.toContain('di.organization_id');
  });
});

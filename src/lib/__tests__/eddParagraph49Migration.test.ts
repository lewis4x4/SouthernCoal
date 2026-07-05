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

  it('couples flagged evaluations to work orders in the latest evaluator rewrite', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260703120000_keystone_k1_coupled_work_orders.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('CREATE OR REPLACE FUNCTION open_edd_paragraph49_with_work_order');
    expect(sql).toContain("source_type,\n    source_id");
    expect(sql).toContain("'edd_paragraph49'");
    expect(sql).toContain('COALESCE(p.organization_id, si.organization_id)');
    expect(sql).toContain('PERFORM open_edd_paragraph49_with_work_order');
    expect(sql).toContain("'work_order_id', v_row.work_order_id");
  });

  it('hardens paragraph49 SECURITY DEFINER RPC access', () => {
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260705150000_qw2_paragraph49_rpc_hardening.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.evaluate_edd_import_paragraph49');
    expect(sql).toContain(') FROM authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.evaluate_edd_import_paragraph49');
    expect(sql).toContain('TO service_role');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.open_edd_paragraph49_with_work_order');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.log_edd_paragraph49_evaluation_failure');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_edd_paragraph49_review_status');
    expect(sql).toContain('IF auth.uid() IS NULL THEN');
    expect(sql).toContain('IF NOT can_manage_sampling_records() THEN');
    expect(sql).toContain('organization_id = v_org_id');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.update_edd_paragraph49_review_status');
    expect(sql).toContain('TO authenticated');
  });
});

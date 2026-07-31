import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('msha pipeline migration', () => {
  it('adds abatement columns, unique key, RPC, and weekly cron', () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, '../../../supabase/migrations/20260701170000_msha_pipeline_abatement.sql'),
      'utf8',
    );

    expect(sql).toContain('abatement_due_date');
    expect(sql).toContain('get_msha_abatement_at_risk');
    expect(sql).toContain('sync-msha-weekly');
    expect(sql).toContain('external_msha_inspections_org_mine_violation_key');
  });

  it('defines self-healing mine org map tables', () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, '../../../supabase/migrations/20260701180000_msha_mine_org_map.sql'),
      'utf8',
    );

    expect(sql).toContain('msha_mine_org_map');
    expect(sql).toContain('msha_mine_org_override');
    expect(sql).toContain('refresh-msha-mine-map');
  });

  it('adds audited inline MSHA review-queue override assignment', () => {
    const sql = readFileSync(
      resolve(import.meta.dirname, '../../../supabase/migrations/20260731120000_msha_map_override_assignment.sql'),
      'utf8',
    );

    expect(sql).toContain('assign_msha_mine_org_override');
    expect(sql).toContain("current_user_has_any_role(ARRAY['admin', 'executive', 'environmental_manager', 'safety_manager', 'coo'])");
    expect(sql).toContain('msha_mine_org_override');
    expect(sql).toContain('msha_mine_org_map');
    expect(sql).toContain('msha_mine_review');
    expect(sql).toContain('msha_map_drift_log');
    expect(sql).toContain('msha_map_override_assigned');
    expect(sql).toContain('DROP POLICY IF EXISTS msha_subsidiary_org_select');
    expect(sql).toContain('target_organization_id');
    expect(sql).toContain('v_actor_org_id');
    expect(sql).toMatch(
      /INSERT INTO public\.msha_mine_org_override[\s\S]*?VALUES\s*\(\s*v_mine_id,\s*p_organization_id,/,
    );
    expect(sql).toMatch(
      /INSERT INTO public\.audit_log[\s\S]*?VALUES\s*\(\s*v_user_id,\s*v_actor_org_id,/,
    );
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('old_values');
    expect(sql).toContain('last_seen = EXCLUDED.last_seen');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.assign_msha_mine_org_override(text, uuid, text) TO authenticated');
  });
});

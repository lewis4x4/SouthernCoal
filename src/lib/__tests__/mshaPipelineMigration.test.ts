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
});

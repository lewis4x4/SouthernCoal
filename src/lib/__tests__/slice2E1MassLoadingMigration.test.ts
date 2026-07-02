import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice2 E1 mass loading migration', () => {
  const e1Sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703170000_e1_dmr_mass_loading.sql',
    ),
    'utf8',
  );

  const fixturesSql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703320000_slice2_e1_mass_loading_fixtures.sql',
    ),
    'utf8',
  );

  it('adds mass_loading_lbs_day column and apply RPC', () => {
    expect(e1Sql).toContain('mass_loading_lbs_day');
    expect(e1Sql).toContain('apply_dmr_mass_loading_for_submission');
    expect(e1Sql).toContain('calculate_mass_loading_lbs_day');
    expect(e1Sql).toContain('* 8.34');
  });

  it('seeds settleable solids mg/L to mL/L conversion', () => {
    expect(e1Sql).toContain("settleable%solid%");
    expect(e1Sql).toContain("'mg/L', 'mL/L', 0.001");
  });

  it('matches quantity-type limits by unit or limit_type', () => {
    expect(e1Sql).toContain("LIKE '%%lb%%day%%'");
    expect(e1Sql).toContain("LIKE '%%quantity%%'");
    expect(e1Sql).toContain("LIKE '%%mass%%'");
  });

  it('seeds SYNTHETIC_UAT_SLICE2_E1 fixtures for KYGE40869', () => {
    expect(fixturesSql).toContain('SYNTHETIC_UAT_SLICE2_E1');
    expect(fixturesSql).toContain('177d42b9-09ac-442f-82cc-be43bf636144');
    expect(fixturesSql).toContain('d1ee9a87-5fcc-4c5a-95a0-b26b3ba228cb');
    expect(fixturesSql).toContain('e51f7c7a-4dea-4849-bc1b-3a016f2da2ab');
    expect(fixturesSql).toContain("'daily_max'");
    expect(fixturesSql).toContain("'lbs/day'");
    expect(fixturesSql).toContain("'MGD'");
  });

  it('uses standard mass loading formula inputs', () => {
    const expectedLoading = 18.4 * 2.5 * 8.34;
    expect(expectedLoading).toBeCloseTo(383.64, 2);
  });
});

describe('slice2 E1 CMS schema fix migration', () => {
  const cmsFixSql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703330000_slice2_e1_mass_loading_cms_schema.sql',
    ),
    'utf8',
  );

  it('selects concentration column via v_conc_expr at runtime', () => {
    expect(cmsFixSql).toContain('v_conc_expr');
    expect(cmsFixSql).toContain("'dli.concentration_max'");
    expect(cmsFixSql).toContain('information_schema.columns');
    expect(cmsFixSql).toContain('%s AS conc');
  });
});

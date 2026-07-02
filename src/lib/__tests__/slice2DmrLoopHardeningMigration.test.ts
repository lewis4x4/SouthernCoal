import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('slice2 DMR loop hardening migration', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20260703030000_slice2_dmr_loop_hardening.sql',
    ),
    'utf8',
  );

  it('adds calculation_warnings column and resolve_unit_conversion helper', () => {
    expect(sql).toContain('calculation_warnings jsonb');
    expect(sql).toContain('resolve_unit_conversion');
  });

  it('does not silently fall back to conversion_factor 1.0 in calculate_dmr_values', () => {
    expect(sql).not.toMatch(/COALESCE\s*\(\s*\(\s*SELECT conversion_factor[\s\S]*?\),\s*1\.0\s*\)/);
    expect(sql).toContain('missing_unit_conversion');
    expect(sql).toContain('conversion_warnings');
  });

  it('allows service role when caller org is null', () => {
    expect(sql).toContain('v_caller_org IS NOT NULL AND v_submission_org IS DISTINCT FROM v_caller_org');
  });

  it('guards no_discharge with nested IF (PL/pgSQL does not short-circuit AND)', () => {
    expect(sql).not.toMatch(/IF v_modern_schema AND COALESCE\(v_submission\.no_discharge/);
    expect(sql).toMatch(/IF v_modern_schema THEN[\s\S]*IF COALESCE\(v_submission\.no_discharge/);
  });

  it('does not deploy half-MDL body', () => {
    expect(sql).not.toContain('v_nd_factor');
    expect(sql).not.toContain('non_detect_substituted');
    expect(sql).not.toMatch(/ONE HALF of the best-available detection/i);
  });

  it('seeds SYNTHETIC_UAT_SLICE2 lab fixture for auto-populate', () => {
    expect(sql).toContain('SYNTHETIC_UAT_SLICE2');
    expect(sql).toContain('177d42b9-09ac-442f-82cc-be43bf636144');
    expect(sql).toContain('18.4');
    expect(sql).toContain('mg/L');
  });

  it('seeds unit conversions for active lab/limit label mismatches', () => {
    expect(sql).toContain("'su', 's.u.'");
    expect(sql).toContain("'us/cm', 'umho/cm'");
    expect(sql).toContain("'mgd', 'gpm'");
  });

  it('supports production CMS schema columns', () => {
    expect(sql).toContain('reporting_period_start');
    expect(sql).toContain('dmr_submission_id');
    expect(sql).toContain('concentration_max');
  });
});

describe('dmrSchema CMS adapter', () => {
  it('maps CMS submission and line item rows to UI shape', async () => {
    const { mapDmrSubmissionRow, mapDmrLineItemRow } = await import('@/lib/dmrSchema');

    const submission = mapDmrSubmissionRow({
      id: 'sub-1',
      permit_id: 'permit-1',
      reporting_period_start: '2026-01-01',
      reporting_period_end: '2026-01-31',
      status: 'draft',
      reporting_frequency: 'monthly',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      permit: {
        organization_id: 'org-1',
        permit_number: 'KYGE40869',
      },
    });

    expect(submission.monitoring_period_start).toBe('2026-01-01');
    expect(submission.organization_id).toBe('org-1');
    expect(submission.submission_type).toBe('monthly');

    const line = mapDmrLineItemRow({
      id: 'line-1',
      dmr_submission_id: 'sub-1',
      outfall_id: 'out-1',
      parameter_id: 'param-1',
      concentration_max: 18.4,
      concentration_units: 'mg/L',
      permit_limit_max: 70,
      number_of_samples: 1,
      is_exceedance: false,
      calculation_warnings: [],
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(line.measured_value).toBe(18.4);
    expect(line.limit_value).toBe(70);
    expect(line.sample_count).toBe(1);
  });
});

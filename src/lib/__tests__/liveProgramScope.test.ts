import { describe, expect, it } from 'vitest';
import {
  buildLiveProgramScope,
  complianceViolationInScope,
  ftsMonthlyTotalInScope,
  ftsViolationInScope,
  type LiveProgramScopeRow,
} from '@/lib/liveProgramScope';
import type { ComplianceViolationWithRelations } from '@/types/database';
import type { FtsMonthlyTotal, FtsViolation } from '@/types/fts';

const scopeRows: LiveProgramScopeRow[] = [
  {
    site_id: 'site-1',
    permit_id: 'permit-1',
    outfall_id: 'outfall-1',
    state_code: 'WV',
    source_row: {
      permit_number: 'WV010001',
      outfall_number: '001',
      state_code: 'WV',
    },
  },
];

describe('liveProgramScope', () => {
  it('builds permit and outfall keys from roster rows', () => {
    const scope = buildLiveProgramScope(scopeRows);
    expect(scope.hasRoster).toBe(true);
    expect(scope.siteIds.has('site-1')).toBe(true);
    expect(scope.permitKeys.has('wv|wv010001')).toBe(true);
    expect(scope.outfallKeys.has('wv|wv010001|001')).toBe(true);
  });

  it('filters compliance violations by site/permit/outfall ids', () => {
    const scope = buildLiveProgramScope(scopeRows);
    const inScope: ComplianceViolationWithRelations = {
      id: 'v1',
      organization_id: 'org-1',
      exceedance_id: null,
      incident_id: null,
      corrective_action_id: null,
      site_id: 'site-1',
      permit_id: null,
      outfall_id: null,
      violation_type: 'permit_exceedance',
      violation_date: '2026-04-01',
      discovery_date: null,
      parameter_id: null,
      measured_value: null,
      limit_value: null,
      unit: null,
      exceedance_pct: null,
      severity: 'minor',
      status: 'open',
      root_cause: null,
      root_cause_category: null,
      estimated_penalty: null,
      actual_penalty: null,
      penalty_paid_date: null,
      decree_paragraphs: null,
      regulatory_agency: null,
      state_code: null,
      resolution_notes: null,
      resolved_by: null,
      resolved_at: null,
      description: null,
      created_by: null,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    };

    const outOfScope = { ...inScope, id: 'v2', site_id: 'site-2', permit_id: 'permit-2', outfall_id: 'outfall-2' };
    expect(complianceViolationInScope(inScope, scope)).toBe(true);
    expect(complianceViolationInScope(outOfScope, scope)).toBe(false);
  });

  it('filters FTS violations by exact outfall/permit and falls back to state', () => {
    const scope = buildLiveProgramScope(scopeRows);
    const exact: FtsViolation = {
      id: 'f1',
      upload_id: 'u1',
      organization_id: 'org-1',
      monitoring_year: 2026,
      monitoring_month: 4,
      monitoring_quarter: 2,
      state: 'WV',
      dnr_number: 'WV010001',
      outfall_number: '001',
      penalty_category: 1,
      penalty_amount: 1000,
      notes: null,
      created_at: '2026-04-01T00:00:00Z',
    };
    const sameState: FtsViolation = { ...exact, id: 'f2', dnr_number: 'OTHER', outfall_number: '999' };
    const wrongState: FtsViolation = { ...exact, id: 'f3', state: 'KY' };

    expect(ftsViolationInScope(exact, scope)).toBe(true);
    expect(ftsViolationInScope(sameState, scope)).toBe(true);
    expect(ftsViolationInScope(wrongState, scope)).toBe(false);
  });

  it('filters FTS monthly totals by roster states', () => {
    const scope = buildLiveProgramScope(scopeRows);
    const total: FtsMonthlyTotal = {
      id: 'm1',
      upload_id: 'u1',
      organization_id: 'org-1',
      monitoring_year: 2026,
      monitoring_month: 4,
      monitoring_quarter: 2,
      state: 'WV',
      total_penalties: 1234,
      quarter_to_date: null,
      created_at: '2026-04-01T00:00:00Z',
    };

    expect(ftsMonthlyTotalInScope(total, scope)).toBe(true);
    expect(ftsMonthlyTotalInScope({ ...total, id: 'm2', state: 'KY' }, scope)).toBe(false);
  });
});

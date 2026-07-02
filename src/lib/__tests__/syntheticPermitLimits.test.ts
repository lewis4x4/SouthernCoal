import { describe, expect, it } from 'vitest';
import {
  buildSyntheticLimitsCsv,
  mapSyntheticLimitRows,
  toVerificationStatus,
} from '@/lib/syntheticPermitLimits';

describe('syntheticPermitLimits', () => {
  it('builds CSV for synthetic limit rows', () => {
    const csv = buildSyntheticLimitsCsv([
      {
        id: 'a',
        permit_number: 'KYGE40869',
        outfall_number: '001',
        parameter_code: 'TSS',
        parameter_name: 'Total Suspended Solids',
        limit_type: 'daily_max',
        limit_value: 30,
        unit: 'mg/L',
        review_status: 'pending_review',
      },
    ]);
    expect(csv).toContain('KYGE40869,001,TSS');
    expect(csv).toContain('pending_review');
  });

  it('maps storet_code from parameters join to parameter_code column', () => {
    const [row] = mapSyntheticLimitRows([
      {
        id: 'a',
        limit_type: 'daily_max',
        limit_value: 30,
        unit: 'mg/L',
        review_status: 'pending_review',
        npdes_permits: { permit_number: 'KYGE40869' },
        outfalls: { outfall_number: '001' },
        parameters: { name: 'Total Suspended Solids', storet_code: '00530' },
      },
    ]);
    expect(row).toBeDefined();
    expect(row!.parameter_code).toBe('00530');
    expect(row!.parameter_name).toBe('Total Suspended Solids');
  });

  it('maps review_status to verification badge status', () => {
    expect(toVerificationStatus('pending_review')).toBe('unreviewed');
    expect(toVerificationStatus('verified')).toBe('verified');
  });
});

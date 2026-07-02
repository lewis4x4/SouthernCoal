import { describe, expect, it } from 'vitest';
import { buildSyntheticLimitsCsv, toVerificationStatus } from '@/lib/syntheticPermitLimits';

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

  it('maps review_status to verification badge status', () => {
    expect(toVerificationStatus('pending_review')).toBe('unreviewed');
    expect(toVerificationStatus('verified')).toBe('verified');
  });
});

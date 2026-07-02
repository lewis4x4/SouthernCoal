import { describe, expect, it } from 'vitest';
import { buildRegistryGapsCsv } from '@/lib/npdesRegistryGaps';

describe('npdesRegistryGaps', () => {
  it('builds CSV with header and rows', () => {
    const csv = buildRegistryGapsCsv([
      { permit_number: 'VA123', state_code: 'VA', issuing_agency: 'DMLR' },
      { permit_number: 'KY456', state_code: 'KY', issuing_agency: null },
    ]);
    expect(csv).toBe(
      'permit_number,state_code,issuing_agency\nVA123,VA,DMLR\nKY456,KY,',
    );
  });

  it('escapes commas and quotes in agency names', () => {
    const csv = buildRegistryGapsCsv([
      { permit_number: 'VA1', state_code: 'VA', issuing_agency: 'Agency, "Special"' },
    ]);
    expect(csv).toContain('"Agency, ""Special"""');
  });
});

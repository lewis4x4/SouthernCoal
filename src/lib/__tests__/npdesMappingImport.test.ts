import { describe, expect, it } from 'vitest';
import {
  buildNpdesMappingImportPreview,
  parseNpdesMappingCsv,
} from '@/lib/npdesMappingImport';

const SAMPLE_CSV = `permit_number,npdes_id,state_code,confidence
1101916,VA0081916,VA,CONFIRMED
1602072,VA0082072,VA,IDENTITY
9999999,VA0099999,VA,PROXIMITY
1100877,INVALID,VA,CONFIRMED
,bad,,CONFIRMED
`;

describe('npdesMappingImport', () => {
  it('parses mapping CSV with confidence filtering', () => {
    const rows = parseNpdesMappingCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(5);

    const preview = buildNpdesMappingImportPreview(
      rows,
      new Set(['1101916', '1602072']),
    );

    expect(preview.importable).toHaveLength(2);
    expect(preview.importable[0]?.npdes_id).toBe('VA0081916');
    expect(preview.skippedConfidence).toHaveLength(1);
    expect(preview.skippedInvalid).toHaveLength(1);
    expect(preview.skippedMissing).toHaveLength(1);
    expect(preview.unmatchedPermits).toHaveLength(0);
  });

  it('flags permits not in registry', () => {
    const rows = parseNpdesMappingCsv(SAMPLE_CSV);
    const preview = buildNpdesMappingImportPreview(rows, new Set(['1602072']));
    expect(preview.importable).toHaveLength(1);
    expect(preview.unmatchedPermits).toHaveLength(1);
    expect(preview.unmatchedPermits[0]?.permit_number).toBe('1101916');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildNpdesMappingImportPreview,
  parseNpdesMappingCsv,
} from '@/lib/npdesMappingImport';

const SAMPLE_CSV = `permit_number,npdes_id,state_code,confidence,confirmation_basis,confirmation_reference,notes
1101916,VA0081916,VA,CONFIRMED,va_deq_ceds,CEDS record 1101916,confirmed row
1602072,VA0082072,VA,IDENTITY,cd_attachment_f,CD Attachment F Q1-Q3 2025,identity row
9999999,VA0099999,VA,PROXIMITY,va_deq_ceds,CEDS record 9999999,held row
1100877,INVALID,VA,CONFIRMED,va_deq_ceds,CEDS record 1100877,bad format
,bad,,CONFIRMED,,,
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
    expect(preview.importable[0]?.confirmation_basis).toBe('va_deq_ceds');
    expect(preview.importable[0]?.confirmation_reference).toBe('CEDS record 1101916');
    expect(preview.importable[0]?.notes).toBe('confirmed row');
    expect(preview.skippedConfidence).toHaveLength(1);
    expect(preview.skippedInvalid).toHaveLength(1);
    expect(preview.skippedMissing).toHaveLength(1);
    expect(preview.skippedConfirmation).toHaveLength(0);
    expect(preview.unmatchedPermits).toHaveLength(0);
  });

  it('flags permits not in registry', () => {
    const rows = parseNpdesMappingCsv(SAMPLE_CSV);
    const preview = buildNpdesMappingImportPreview(rows, new Set(['1602072']));
    expect(preview.importable).toHaveLength(1);
    expect(preview.unmatchedPermits).toHaveLength(1);
    expect(preview.unmatchedPermits[0]?.permit_number).toBe('1101916');
  });

  it('requires confirmation basis for importable VA mappings', () => {
    const rows = parseNpdesMappingCsv(`permit_number,npdes_id,state_code,confidence,confirmation_basis,confirmation_reference
VA0081916,VA0081916,VA,CONFIRMED,,
WV1025929,WV1025929,WV,CONFIRMED,,
`);
    const preview = buildNpdesMappingImportPreview(rows, new Set(['VA0081916', 'WV1025929']));

    expect(preview.importable).toHaveLength(1);
    expect(preview.importable[0]?.permit_number).toBe('WV1025929');
    expect(preview.skippedConfirmation).toHaveLength(1);
    expect(preview.skippedConfirmation[0]?.permit_number).toBe('VA0081916');
  });
});

import { describe, expect, it } from 'vitest';
import {
  getLabExtractionMeta,
  isLabExtractionDocumentType,
  LAB_DOC_TYPE_LABELS,
  normalizeLabExtractionDisplay,
} from '@/lib/labExtractionDisplay';

describe('labExtractionDisplay', () => {
  it('recognizes all state lab parser document types', () => {
    expect(isLabExtractionDocumentType('lab_data_edd')).toBe(true);
    expect(isLabExtractionDocumentType('va_lab_csv')).toBe(true);
    expect(isLabExtractionDocumentType('osmre_monitoring')).toBe(true);
    expect(isLabExtractionDocumentType('al_lab_data')).toBe(true);
    expect(isLabExtractionDocumentType('netdmr_bundle')).toBe(false);
  });

  it('returns DRAFT meta for state parser output', () => {
    const meta = getLabExtractionMeta({
      document_type: 'al_lab_data',
      draft_mode: true,
      spec_version: '1.0.0',
      parser_version: '1.0.0',
    });
    expect(meta.parserLabel).toBe(LAB_DOC_TYPE_LABELS.al_lab_data);
    expect(meta.draftMode).toBe(true);
    expect(meta.specVersion).toBe('1.0.0');
  });

  it('normalizes sparse parser payloads for dashboard display', () => {
    const normalized = normalizeLabExtractionDisplay({
      document_type: 'va_lab_csv',
      file_format: 'csv',
      parsed_rows: 3,
      total_rows: 3,
      draft_mode: true,
      warnings: ['DRAFT — spec v1'],
      date_range: { earliest: '2025-01-01', latest: '2025-01-15' },
    });

    expect(normalized?.document_type).toBe('va_lab_csv');
    expect(normalized?.warnings).toEqual(['DRAFT — spec v1']);
    expect(normalized?.hold_time_violations).toEqual([]);
    expect(normalized?.parameter_summary).toEqual([]);
  });
});

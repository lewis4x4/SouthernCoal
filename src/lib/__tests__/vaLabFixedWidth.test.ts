import { describe, expect, it } from 'vitest';
import {
  buildVaFixedWidthLine,
  isLikelyVaFixedWidthContent,
  parseVaLabFileContent,
} from '../../../supabase/functions/_shared/va-lab-fixed-width.ts';

describe('va-lab-fixed-width parser', () => {
  it('detects fixed-width VA lab content', () => {
    const line = buildVaFixedWidthLine({
      permit_number: 'VA0081742',
      outfall_id: '001',
      sample_date: '2025-01-15',
      parameter_code: 'Iron, Total',
      result_value: '0.45',
      unit: 'mg/L',
      qualifier: 'U',
      lab_name: 'Aquatic Env Lab',
      site_name: 'Big Stone Mine',
    });
    const content = `${line}\n`;
    expect(isLikelyVaFixedWidthContent(content)).toBe(true);

    const result = parseVaLabFileContent(content);
    expect(result.formatDetected).toBe('fixed_width');
    expect(result.extracted.parsed_rows).toBe(1);
    expect(result.extracted.records[0]?.permit_number).toBe('VA0081742');
    expect(result.extracted.records[0]?.parameter_canonical).toBe('Iron');
    expect(result.extracted.records[0]?.site_state).toBe('VA');
    expect(result.extracted.draft_mode).toBe(true);
  });

  it('rejects malformed fixed-width lines rather than misparsing', () => {
    const content = 'short,line,with,commas\n';
    const result = parseVaLabFileContent(content);
    expect(result.formatDetected).toBe('rejected');
    expect(result.extracted.parsed_rows).toBe(0);
    expect(result.extracted.validation_errors.length).toBeGreaterThan(0);
  });

  it('parses delimited VA CSV fallback when headers match', () => {
    const content = [
      'Permit Number,Discharge #,Parameter,Result,Unit,Sample Date',
      'VA0081742,001,Iron Total,0.45,mg/L,01/15/2025',
    ].join('\n');

    const result = parseVaLabFileContent(content);
    expect(result.formatDetected).toBe('delimited_csv');
    expect(result.extracted.parsed_rows).toBe(1);
    expect(result.extracted.records[0]?.value).toBe(0.45);
  });
});

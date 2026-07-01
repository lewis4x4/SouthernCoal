import { describe, expect, it } from 'vitest';
import { parseAlLabCsvContent, parseAlLabSheets } from '../../../supabase/functions/_shared/al-lab-parse.ts';

describe('al-lab-parse', () => {
  it('parses long-format LRS/Waypoint tabular export', () => {
    const csv = [
      'Permit Number,Site Name,Outfall,Analyte,Result,Units,Sample Date,Lab Name',
      'AL0062693,Mine No 2,001,Iron Total,0.42,mg/L,01/15/2025,Waypoint Analytical',
      'AL0062693,Mine No 2,001,Sulfate,12.5,mg/L,01/15/2025,LRS',
    ].join('\n');

    const result = parseAlLabCsvContent(csv, 'waypoint_jan2025.csv');
    expect(result.formatDetected).toBe('long_tabular');
    expect(result.extracted.parsed_rows).toBe(2);
    expect(result.extracted.states).toEqual(['AL']);
    expect(result.extracted.records[0]?.parameter_canonical).toBe('Iron');
    expect(result.extracted.records[1]?.lab_name).toBe('LRS (Asheville)');
    expect(result.extracted.draft_mode).toBe(true);
  });

  it('parses wide-format HMR spreadsheet rows', () => {
    const result = parseAlLabSheets({
      sheets: [{
        name: 'Q1 HMR',
        rows: [
          ['Site Name', 'Outfall', 'Sample Date', 'pH', 'Iron', 'Manganese', 'TSS'],
          ['Mine No 2', '001', '01/15/2025', '7.1', '0.42', '0.08', '15'],
        ],
      }],
      fileHint: 'Q1_HMR.xlsx',
    });

    expect(result.formatDetected).toBe('wide_hmr');
    expect(result.extracted.parsed_rows).toBe(4);
    expect(result.extracted.records.some((r) => r.parameter_canonical === 'pH')).toBe(true);
    expect(result.extracted.records.every((r) => r.site_state === 'AL')).toBe(true);
  });

  it('rejects unrecognized file shapes', () => {
    const result = parseAlLabCsvContent('not,a,valid,lab,file\n1,2,3,4\n');
    expect(result.extracted.parsed_rows).toBe(0);
    expect(result.formatDetected).toBe('rejected');
  });
});

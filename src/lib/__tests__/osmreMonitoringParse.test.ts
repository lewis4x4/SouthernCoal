import { describe, expect, it } from 'vitest';
import { parseOsmreMonitoringSheets } from '../../../supabase/functions/_shared/osmre-monitoring-parse.ts';

describe('osmre-monitoring parser', () => {
  it('parses DMR and outfall sheets from synthetic TN workbook', () => {
    const result = parseOsmreMonitoringSheets([
      {
        name: 'DMR',
        rows: [
          ['Permit Number', 'Discharge #', 'Parameter', 'Limit', 'Unit', 'Result', 'Sample Date'],
          ['TNR0120001', '001', 'Iron, Total', '1.0', 'mg/L', '0.45', '01/15/2025'],
        ],
      },
      {
        name: 'Outfall 001',
        rows: [
          ['Permit', 'Outfall', 'Parameter', 'Value', 'Units', 'Date Collected'],
          ['TNR0120001', '001', 'pH', '7.2', 'SU', '01/15/2025'],
        ],
      },
    ]);

    expect(result.sheetsParsed).toContain('DMR');
    expect(result.sheetsParsed).toContain('Outfall 001');
    expect(result.extracted.parsed_rows).toBe(2);
    expect(result.extracted.states).toEqual(['TN']);
    expect(result.extracted.draft_mode).toBe(true);
    expect(result.extracted.records.some((r) => r.parameter_canonical === 'pH')).toBe(true);
  });

  it('skips sheets without recognizable headers', () => {
    const result = parseOsmreMonitoringSheets([
      {
        name: 'Cover',
        rows: [['Quarterly Monitoring Report']],
      },
      {
        name: 'DMR',
        rows: [
          ['Permit Number', 'Parameter', 'Result', 'Sample Date'],
          ['TNR0120001', 'Iron, Total', '0.45', '01/15/2025'],
        ],
      },
    ]);

    expect(result.sheetsSkipped).toContain('Cover');
    expect(result.extracted.parsed_rows).toBe(1);
  });

  it('dedupes identical rows across sheets', () => {
    const row = ['TNR0120001', '001', 'Iron, Total', '1.0', 'mg/L', '0.45', '01/15/2025'];
    const header = ['Permit Number', 'Discharge #', 'Parameter', 'Limit', 'Unit', 'Result', 'Sample Date'];

    const result = parseOsmreMonitoringSheets([
      { name: 'DMR', rows: [header, row] },
      { name: 'Backup', rows: [header, row] },
    ]);

    expect(result.extracted.parsed_rows).toBe(1);
  });
});

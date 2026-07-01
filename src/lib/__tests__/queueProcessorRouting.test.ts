import { describe, expect, it } from 'vitest';
import {
  canProcessQueueEntry,
  isAlLabDataFile,
  isOsmreMonitoringFile,
  isParameterSheetFile,
  isVaLabCsvFile,
  resolveQueueParser,
} from '@/lib/queueProcessorRouting';
import type { QueueEntry } from '@/types/queue';

function entry(partial: Partial<QueueEntry>): QueueEntry {
  return {
    id: 'test-id',
    file_name: 'file.pdf',
    file_category: 'npdes_permit',
    status: 'queued',
    storage_bucket: 'permits',
    storage_path: 'WV/file.pdf',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  } as QueueEntry;
}

describe('resolveQueueParser', () => {
  it('routes permit PDFs to parse-permit-pdf', () => {
    const route = resolveQueueParser(entry({ file_name: 'KY123.pdf' }));
    expect(route.kind).toBe('permit_pdf');
    expect(route.functionName).toBe('parse-permit-pdf');
  });

  it('routes WV parameter sheets to parse-parameter-sheet', () => {
    const route = resolveQueueParser(entry({ file_name: 'WV_Limits.xlsx' }));
    expect(route.kind).toBe('parameter_sheet');
    expect(route.functionName).toBe('parse-parameter-sheet');
    expect(isParameterSheetFile({ file_name: 'WV_Limits.xlsx' })).toBe(true);
  });

  it('routes standard lab data to parse-lab-data-edd', () => {
    const route = resolveQueueParser(
      entry({ file_category: 'lab_data', file_name: 'results.csv', storage_path: 'WV/results.csv' }),
    );
    expect(route.kind).toBe('lab_data');
    expect(route.functionName).toBe('parse-lab-data-edd');
  });

  it('routes TN OSMRE xlsx to parse-osmre-monitoring', () => {
    const route = resolveQueueParser(
      entry({
        file_category: 'lab_data',
        file_name: 'Q1_monitoring.xlsx',
        storage_path: 'TN/Q1_monitoring.xlsx',
        state_code: 'TN',
      }),
    );
    expect(route.kind).toBe('osmre_monitoring');
    expect(route.functionName).toBe('parse-osmre-monitoring');
    expect(isOsmreMonitoringFile({
      file_name: 'Q1_monitoring.xlsx',
      storage_path: 'TN/Q1_monitoring.xlsx',
      state_code: 'TN',
    })).toBe(true);
  });

  it('routes VA lab csv to parse-va-lab-csv', () => {
    const route = resolveQueueParser(
      entry({
        file_category: 'lab_data',
        file_name: 'lab_results.csv',
        storage_path: 'VA/lab_results.csv',
        state_code: 'VA',
      }),
    );
    expect(route.kind).toBe('va_lab_csv');
    expect(route.functionName).toBe('parse-va-lab-csv');
    expect(isVaLabCsvFile({
      file_name: 'lab_results.csv',
      storage_path: 'VA/lab_results.csv',
      state_code: 'VA',
    })).toBe(true);
  });

  it('routes AL lab data to parse-al-lab-data', () => {
    const route = resolveQueueParser(
      entry({
        file_category: 'lab_data',
        file_name: 'Q1_HMR.xlsx',
        storage_path: 'AL/Q1_HMR.xlsx',
        state_code: 'AL',
      }),
    );
    expect(route.kind).toBe('al_lab_data');
    expect(route.functionName).toBe('parse-al-lab-data');
    expect(isAlLabDataFile({
      file_name: 'waypoint_results.csv',
      storage_path: 'AL/waypoint_results.csv',
      state_code: 'AL',
    })).toBe(true);
  });

  it('routes DMR zip/csv to parse-netdmr-bundle', () => {
    expect(resolveQueueParser(entry({ file_category: 'dmr', file_name: 'export.zip' })).kind).toBe(
      'netdmr_bundle',
    );
    expect(resolveQueueParser(entry({ file_category: 'dmr', file_name: 'report.csv' })).kind).toBe(
      'netdmr_bundle',
    );
  });

  it('marks unsupported DMR formats', () => {
    expect(
      resolveQueueParser(entry({ file_category: 'dmr', file_name: 'scan.pdf' })).kind,
    ).toBe('unsupported');
    expect(canProcessQueueEntry(entry({ file_category: 'dmr', file_name: 'scan.pdf' }))).toBe(
      false,
    );
  });
});

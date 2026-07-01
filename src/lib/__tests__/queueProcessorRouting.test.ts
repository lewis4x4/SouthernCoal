import { describe, expect, it } from 'vitest';
import {
  canProcessQueueEntry,
  isParameterSheetFile,
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

  it('routes lab data to parse-lab-data-edd', () => {
    const route = resolveQueueParser(
      entry({ file_category: 'lab_data', file_name: 'results.csv' }),
    );
    expect(route.kind).toBe('lab_data');
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

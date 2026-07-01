import type { QueueEntry } from '@/types/queue';

/** Edge Function invoked for a queue entry. */
export type QueueParserKind =
  | 'permit_pdf'
  | 'parameter_sheet'
  | 'lab_data'
  | 'netdmr_bundle'
  | 'unsupported';

export interface QueueParserRoute {
  kind: QueueParserKind;
  /** Supabase Edge Function name (when kind is not unsupported). */
  functionName?: string;
  /** Short label for toasts and buttons. */
  label: string;
}

const EXCEL_EXT = /\.xlsx?$/i;
const ZIP_EXT = /\.zip$/i;

export function isParameterSheetFile(entry: Pick<QueueEntry, 'file_name'>): boolean {
  return EXCEL_EXT.test(entry.file_name);
}

export function isNetDmrBundleFile(entry: Pick<QueueEntry, 'file_name'>): boolean {
  return ZIP_EXT.test(entry.file_name) || /\.csv$/i.test(entry.file_name) || /\.txt$/i.test(entry.file_name);
}

/**
 * Resolve which parser pipeline applies to a queue row.
 * Single source of truth for Upload Dashboard Process / Retry routing.
 */
export function resolveQueueParser(entry: QueueEntry): QueueParserRoute {
  switch (entry.file_category) {
    case 'npdes_permit':
      if (isParameterSheetFile(entry)) {
        return {
          kind: 'parameter_sheet',
          functionName: 'parse-parameter-sheet',
          label: 'Parameter sheet',
        };
      }
      return {
        kind: 'permit_pdf',
        functionName: 'parse-permit-pdf',
        label: 'Permit PDF',
      };
    case 'lab_data':
      return {
        kind: 'lab_data',
        functionName: 'parse-lab-data-edd',
        label: 'Lab EDD',
      };
    case 'dmr':
      if (!isNetDmrBundleFile(entry)) {
        return {
          kind: 'unsupported',
          label: 'DMR (unsupported format)',
        };
      }
      return {
        kind: 'netdmr_bundle',
        functionName: 'parse-netdmr-bundle',
        label: 'NetDMR bundle',
      };
    default:
      return {
        kind: 'unsupported',
        label: entry.file_category,
      };
  }
}

export function canProcessQueueEntry(entry: QueueEntry): boolean {
  return resolveQueueParser(entry).kind !== 'unsupported';
}

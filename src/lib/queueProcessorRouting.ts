import type { QueueEntry } from '@/types/queue';

/** Categories indexed for search — no structured domain import. */
export const ARCHIVE_DOCUMENT_CATEGORIES = new Set([
  'field_inspection',
  'water_monitoring',
  'quarterly_report',
  'audit_report',
  'enforcement',
]);

export function isArchiveDocumentCategory(category: string): boolean {
  return ARCHIVE_DOCUMENT_CATEGORIES.has(category);
}

/** Edge Function invoked for a queue entry. */
export type QueueParserKind =
  | 'permit_pdf'
  | 'parameter_sheet'
  | 'lab_data'
  | 'va_lab_csv'
  | 'osmre_monitoring'
  | 'al_lab_data'
  | 'netdmr_bundle'
  | 'compliance_archive'
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
const CSV_EXT = /\.csv$/i;

const OSMRE_FILENAME = /osmre|monitoring.?report|quarterly.?monitor|sme-90|tn.?monitor/i;
const VA_LAB_FILENAME = /va.?lab|vpdes.?lab|dmlr.?lab|fixed.?width/i;
const AL_LAB_FILENAME = /lrs|waypoint|hmr|hydrologic|alabama.?lab|adem/i;

const STATE_FROM_PATH = /(?:^|\/)(AL|KY|TN|VA|WV)(?:\/|$)/i;

export function inferQueueState(entry: Pick<QueueEntry, 'state_code' | 'storage_path' | 'file_name'>): string | null {
  if (entry.state_code) return entry.state_code.toUpperCase();
  const pathMatch = entry.storage_path.match(STATE_FROM_PATH);
  if (pathMatch?.[1]) return pathMatch[1].toUpperCase();
  const nameMatch = entry.file_name.match(/^(AL|KY|TN|VA|WV)[-_]/i);
  if (nameMatch?.[1]) return nameMatch[1].toUpperCase();
  return null;
}

export function isParameterSheetFile(entry: Pick<QueueEntry, 'file_name'>): boolean {
  return EXCEL_EXT.test(entry.file_name);
}

export function isNetDmrBundleFile(entry: Pick<QueueEntry, 'file_name'>): boolean {
  return ZIP_EXT.test(entry.file_name) || CSV_EXT.test(entry.file_name) || /\.txt$/i.test(entry.file_name);
}

export function isOsmreMonitoringFile(entry: Pick<QueueEntry, 'file_name' | 'storage_path' | 'state_code'>): boolean {
  if (!EXCEL_EXT.test(entry.file_name)) return false;
  const state = inferQueueState(entry);
  if (state === 'TN') return true;
  return OSMRE_FILENAME.test(entry.file_name) || OSMRE_FILENAME.test(entry.storage_path);
}

export function isVaLabCsvFile(entry: Pick<QueueEntry, 'file_name' | 'storage_path' | 'state_code'>): boolean {
  if (!CSV_EXT.test(entry.file_name)) return false;
  const state = inferQueueState(entry);
  if (state === 'VA') return true;
  return VA_LAB_FILENAME.test(entry.file_name) || VA_LAB_FILENAME.test(entry.storage_path);
}

export function isAlLabDataFile(entry: Pick<QueueEntry, 'file_name' | 'storage_path' | 'state_code'>): boolean {
  const state = inferQueueState(entry);
  const isTabular = CSV_EXT.test(entry.file_name) || EXCEL_EXT.test(entry.file_name);
  if (!isTabular) return false;
  if (state === 'AL') return true;
  return AL_LAB_FILENAME.test(entry.file_name) || AL_LAB_FILENAME.test(entry.storage_path);
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
      if (isOsmreMonitoringFile(entry)) {
        return {
          kind: 'osmre_monitoring',
          functionName: 'parse-osmre-monitoring',
          label: 'OSMRE monitoring (TN)',
        };
      }
      if (isVaLabCsvFile(entry)) {
        return {
          kind: 'va_lab_csv',
          functionName: 'parse-va-lab-csv',
          label: 'VA lab CSV',
        };
      }
      if (isAlLabDataFile(entry)) {
        return {
          kind: 'al_lab_data',
          functionName: 'parse-al-lab-data',
          label: 'AL lab data',
        };
      }
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
    case 'field_inspection':
    case 'water_monitoring':
    case 'quarterly_report':
    case 'audit_report':
    case 'enforcement':
      return {
        kind: 'compliance_archive',
        functionName: 'process-compliance-archive',
        label: 'Compliance archive',
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

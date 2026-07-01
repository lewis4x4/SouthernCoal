/** Lab extraction document types produced by state-specific Edge Function parsers. */
export const LAB_EXTRACTION_DOCUMENT_TYPES = [
  'lab_data_edd',
  'va_lab_csv',
  'osmre_monitoring',
  'al_lab_data',
] as const;

export type LabExtractionDocumentType = (typeof LAB_EXTRACTION_DOCUMENT_TYPES)[number];

export const LAB_DOC_TYPE_LABELS: Record<string, string> = {
  lab_data_edd: 'Lab Data (EDD)',
  va_lab_csv: 'VA Lab CSV',
  osmre_monitoring: 'OSMRE Monitoring (TN)',
  al_lab_data: 'AL Lab Data',
};

export function isLabExtractionDocumentType(
  docType: unknown,
): docType is LabExtractionDocumentType {
  return (
    typeof docType === 'string' &&
    (LAB_EXTRACTION_DOCUMENT_TYPES as readonly string[]).includes(docType)
  );
}

export interface LabDataExtractionDisplay {
  document_type: LabExtractionDocumentType;
  file_format: string;
  column_count?: number;
  total_rows: number;
  parsed_rows: number;
  skipped_rows?: number;
  permit_numbers: string[];
  states: string[];
  sites: string[];
  date_range: { earliest: string | null; latest: string | null };
  lab_names: string[];
  parameters_found: number;
  parameter_summary: Array<{
    canonical_name: string;
    sample_count: number;
    below_detection_count: number;
  }>;
  outfalls_found: number;
  outfall_summary: Array<{
    raw_name: string;
    matched_id: string | null;
    sample_count: number;
  }>;
  warnings: string[];
  validation_errors: Array<{ row: number; column: string; message: string }>;
  hold_time_violations: Array<{
    row: number;
    parameter: string;
    outfall: string;
    sample_date: string;
    analysis_date: string;
    days_held: number;
    max_hold_days: number;
  }>;
  records_truncated: boolean;
  summary: string;
  draft_mode?: boolean;
  spec_version?: string;
  parser_version?: string;
}

export interface LabExtractionMeta {
  parserLabel: string;
  draftMode: boolean;
  specVersion: string | null;
  parserVersion: string | null;
}

export function getLabExtractionMeta(data: Record<string, unknown>): LabExtractionMeta {
  const docType = String(data.document_type ?? 'lab_data_edd');
  return {
    parserLabel: LAB_DOC_TYPE_LABELS[docType] ?? 'Lab Data',
    draftMode: data.draft_mode === true,
    specVersion: typeof data.spec_version === 'string' ? data.spec_version : null,
    parserVersion: typeof data.parser_version === 'string' ? data.parser_version : null,
  };
}

/** Normalize parser output for Upload Dashboard display (fills optional fields). */
export function normalizeLabExtractionDisplay(
  raw: Record<string, unknown>,
): LabDataExtractionDisplay | null {
  if (!isLabExtractionDocumentType(raw.document_type)) return null;

  const dateRange = raw.date_range as { earliest?: string | null; latest?: string | null } | undefined;

  return {
    document_type: raw.document_type,
    file_format: String(raw.file_format ?? 'unknown'),
    column_count: typeof raw.column_count === 'number' ? raw.column_count : undefined,
    total_rows: Number(raw.total_rows ?? 0),
    parsed_rows: Number(raw.parsed_rows ?? 0),
    skipped_rows: typeof raw.skipped_rows === 'number' ? raw.skipped_rows : undefined,
    permit_numbers: Array.isArray(raw.permit_numbers) ? (raw.permit_numbers as string[]) : [],
    states: Array.isArray(raw.states) ? (raw.states as string[]) : [],
    sites: Array.isArray(raw.sites) ? (raw.sites as string[]) : [],
    date_range: {
      earliest: dateRange?.earliest ?? null,
      latest: dateRange?.latest ?? null,
    },
    lab_names: Array.isArray(raw.lab_names) ? (raw.lab_names as string[]) : [],
    parameters_found: Number(raw.parameters_found ?? 0),
    parameter_summary: Array.isArray(raw.parameter_summary)
      ? (raw.parameter_summary as LabDataExtractionDisplay['parameter_summary'])
      : [],
    outfalls_found: Number(raw.outfalls_found ?? 0),
    outfall_summary: Array.isArray(raw.outfall_summary)
      ? (raw.outfall_summary as LabDataExtractionDisplay['outfall_summary'])
      : [],
    warnings: Array.isArray(raw.warnings) ? (raw.warnings as string[]) : [],
    validation_errors: Array.isArray(raw.validation_errors)
      ? (raw.validation_errors as LabDataExtractionDisplay['validation_errors'])
      : [],
    hold_time_violations: Array.isArray(raw.hold_time_violations)
      ? (raw.hold_time_violations as LabDataExtractionDisplay['hold_time_violations'])
      : [],
    records_truncated: raw.records_truncated === true,
    summary: String(raw.summary ?? ''),
    draft_mode: raw.draft_mode === true,
    spec_version: typeof raw.spec_version === 'string' ? raw.spec_version : undefined,
    parser_version: typeof raw.parser_version === 'string' ? raw.parser_version : undefined,
  };
}

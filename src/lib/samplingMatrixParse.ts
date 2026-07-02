/**
 * Client-side sampling matrix parse helpers (mirrors Edge Function stub).
 * Used for unit tests and ExtractionPanel typing.
 */

export interface SamplingMatrixRowPreview {
  row_number: number;
  permit_number: string | null;
  outfall_number: string | null;
  parameter_raw: string | null;
  frequency_code: string | null;
  resolution_status: 'matched' | 'partial' | 'unmatched';
  parameter_canonical: string | null;
}

export interface SamplingMatrixExtractedPreview {
  document_type: 'sampling_matrix';
  draft_label: string;
  rows: SamplingMatrixRowPreview[];
  summary: {
    total_rows: number;
    matched_rows: number;
    partial_rows: number;
    unmatched_rows: number;
  };
  warnings: string[];
}

export function normalizeMatrixHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeFrequencyCode(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const map: Record<string, string> = {
    monthly: '1/month',
    '1 per month': '1/month',
    'once per month': '1/month',
    '1/month': '1/month',
    'semi-monthly': '2/month',
    'semi monthly': '2/month',
    'twice monthly': '2/month',
    '2 per month': '2/month',
    '2/month': '2/month',
    quarterly: '1/quarter',
    '1 per quarter': '1/quarter',
    '1/quarter': '1/quarter',
    annual: '1/year',
    yearly: '1/year',
    '1 per year': '1/year',
    '1/year': '1/year',
  };
  return map[key] ?? raw.trim();
}

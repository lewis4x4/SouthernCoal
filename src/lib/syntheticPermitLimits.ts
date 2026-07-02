import type { VerificationStatus } from '@/stores/verification';

export interface SyntheticPermitLimitRow {
  id: string;
  permit_number: string;
  outfall_number: string;
  parameter_code: string;
  parameter_name: string;
  limit_type: string;
  limit_value: number | null;
  unit: string;
  review_status: string;
}

export type PermitLimitReviewStatus =
  | 'pending_review'
  | 'in_review'
  | 'verified'
  | 'disputed';

interface LimitQueryRow {
  id: string;
  limit_type: string;
  limit_value: number | null;
  unit: string;
  review_status: string;
  npdes_permits: { permit_number: string } | { permit_number: string }[] | null;
  outfalls: { outfall_number: string } | { outfall_number: string }[] | null;
  parameters:
    | { name: string; parameter_code: string | null }
    | { name: string; parameter_code: string | null }[]
    | null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapSyntheticLimitRows(data: LimitQueryRow[]): SyntheticPermitLimitRow[] {
  return data.map((row) => {
    const permit = first(row.npdes_permits);
    const outfall = first(row.outfalls);
    const parameter = first(row.parameters);
    return {
      id: row.id,
      permit_number: permit?.permit_number ?? '',
      outfall_number: outfall?.outfall_number ?? '',
      parameter_code: parameter?.parameter_code ?? '',
      parameter_name: parameter?.name ?? '',
      limit_type: row.limit_type,
      limit_value: row.limit_value,
      unit: row.unit,
      review_status: row.review_status,
    };
  });
}

export function toVerificationStatus(reviewStatus: string): VerificationStatus {
  switch (reviewStatus) {
    case 'in_review':
      return 'in_review';
    case 'verified':
      return 'verified';
    case 'disputed':
      return 'disputed';
    default:
      return 'unreviewed';
  }
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildSyntheticLimitsCsv(rows: SyntheticPermitLimitRow[]): string {
  const header =
    'permit_number,outfall_number,parameter_code,parameter_name,limit_type,limit_value,unit,review_status';
  const lines = rows.map((r) =>
    [
      r.permit_number,
      r.outfall_number,
      r.parameter_code,
      r.parameter_name,
      r.limit_type,
      r.limit_value ?? '',
      r.unit,
      r.review_status,
    ]
      .map((v) => csvCell(String(v)))
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export function downloadSyntheticLimitsCsv(rows: SyntheticPermitLimitRow[], filename?: string): void {
  const blob = new Blob([buildSyntheticLimitsCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `slice1-synthetic-limits-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const SYNTHETIC_LIMIT_NOTES_FILTER = 'SYNTHETIC_UAT_SLICE1';

export const SYNTHETIC_LIMIT_SELECT =
  'id, limit_type, limit_value, unit, review_status, npdes_permits(permit_number), outfalls(outfall_number), parameters(name, parameter_code)';

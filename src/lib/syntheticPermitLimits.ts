export interface SyntheticPermitLimitRow {
  permit_number: string;
  outfall_number: string;
  parameter_code: string;
  parameter_name: string;
  limit_type: string;
  limit_value: number | null;
  unit: string;
  review_status: string;
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

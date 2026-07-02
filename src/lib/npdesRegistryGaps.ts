export interface RegistryMappingGapRow {
  permit_number: string;
  state_code: string;
  issuing_agency: string | null;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildRegistryGapsCsv(gaps: RegistryMappingGapRow[]): string {
  const header = 'permit_number,state_code,issuing_agency';
  const rows = gaps.map((g) =>
    [g.permit_number, g.state_code, g.issuing_agency ?? ''].map(csvCell).join(','),
  );
  return [header, ...rows].join('\n');
}

export function downloadRegistryGapsCsv(gaps: RegistryMappingGapRow[], filename?: string): void {
  const blob = new Blob([buildRegistryGapsCsv(gaps)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `registry-mapping-gaps-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

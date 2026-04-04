import type { ParsedCutoverMatrixRowInput } from '@/types/cutover';

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeCell(value: unknown): string | null {
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function normalizeDisposition(value: string | null): ParsedCutoverMatrixRowInput['disposition'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'live':
      return 'live';
    case 'exclude':
      return 'exclude';
    default:
      return 'archive';
  }
}

function mapRow(row: Record<string, unknown>, rowNumber: number): ParsedCutoverMatrixRowInput {
  const stateCode = normalizeCell(row.state_code ?? row.state);
  const siteName = normalizeCell(row.site_name ?? row.site);
  const permitNumber = normalizeCell(row.permit_number ?? row.permit ?? row.npdes_permit);
  const outfallNumber = normalizeCell(row.outfall_number ?? row.outfall);
  const externalNpdesId = normalizeCell(row.external_npdes_id ?? row.npdes_id ?? row.external_id);
  const facilityName = normalizeCell(row.facility_name ?? row.facility);
  const mineId = normalizeCell(row.mine_id);
  const notes = normalizeCell(row.notes ?? row.note ?? row.comments);

  return {
    row_number: rowNumber,
    state_code: stateCode?.toUpperCase() ?? null,
    site_name: siteName,
    permit_number: permitNumber,
    outfall_number: outfallNumber,
    external_npdes_id: externalNpdesId,
    facility_name: facilityName,
    mine_id: mineId,
    disposition: normalizeDisposition(normalizeCell(row.disposition ?? row.action)),
    notes,
    raw_json: row,
  };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function rowsToObjects(rows: string[][]): Record<string, unknown>[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];

  const headers = headerRow.map((cell) => normalizeHeader(cell));
  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (!header) return;
        mapped[header] = row[index] ?? '';
      });
      return mapped;
    });
}

export async function parseCutoverMatrixFile(file: File): Promise<ParsedCutoverMatrixRowInput[]> {
  const lowerName = file.name.toLowerCase();

  let records: Record<string, unknown>[] = [];

  if (lowerName.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const workbook = (await readXlsxFile(file)) as unknown;
    const rawRows = Array.isArray(workbook)
      ? (workbook as unknown[][])
      : (((workbook as { data?: unknown[][] }).data ?? []) as unknown[][]);
    const rows = rawRows.map((row: unknown[]) =>
      row.map((cell: unknown) => (cell == null ? '' : String(cell))),
    );
    records = rowsToObjects(rows);
  } else if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    const rows = lines.map(parseCsvLine);
    records = rowsToObjects(rows);
  } else {
    throw new Error('Unsupported matrix file type. Use .xlsx or .csv.');
  }

  return records.map((row, index) => mapRow(row, index + 1));
}

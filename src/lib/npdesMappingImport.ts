import {
  validateConfirmationBasis,
  validateFederalNpdesId,
  normalizePermitId,
  type NpdesConfirmationBasis,
} from '@/lib/npdesMapping';

export const IMPORTABLE_NPDES_CONFIDENCE = new Set(['CONFIRMED', 'IDENTITY']);

export const NPDES_MAPPING_CSV_HEADERS = [
  'permit_number',
  'npdes_id',
  'state_code',
  'confidence',
] as const;

export interface NpdesMappingCsvRow {
  permit_number: string;
  npdes_id: string;
  state_code: string;
  confidence: string;
  confirmation_basis: string;
  confirmation_reference: string;
  notes: string;
  raw: Record<string, string>;
}

export type NpdesMappingImportSkipReason =
  | 'missing_fields'
  | 'confidence_not_importable'
  | 'invalid_npdes_id'
  | 'permit_not_in_registry';

export interface NpdesMappingImportCandidate {
  permit_number: string;
  npdes_id: string;
  state_code: string;
  confidence: string;
  confirmation_basis?: NpdesConfirmationBasis;
  confirmation_reference?: string;
  notes?: string;
}

export interface NpdesMappingImportPreview {
  totalRows: number;
  importable: NpdesMappingImportCandidate[];
  skippedConfidence: NpdesMappingCsvRow[];
  skippedInvalid: NpdesMappingCsvRow[];
  skippedMissing: NpdesMappingCsvRow[];
  skippedConfirmation: NpdesMappingCsvRow[];
  unmatchedPermits: NpdesMappingImportCandidate[];
}

function rawValue(raw: Record<string, string>, ...headers: string[]): string {
  for (const header of headers) {
    const value = raw[header];
    if (value !== undefined) return value;
  }
  return '';
}

/** Parse SCC_Federal_NPDES_Mapping_IMPORT.csv text (quoted fields supported). */
export function parseNpdesMappingCsv(text: string): NpdesMappingCsvRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === '"') {
      if (inQuotes && trimmed[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && trimmed[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow?.length) return [];

  const headers = headerRow.map((h) => h.trim().toLowerCase());
  return dataRows
    .filter((values) => values.some((v) => v.trim()))
    .map((values) => {
      const raw: Record<string, string> = {};
      headers.forEach((header, index) => {
        raw[header] = (values[index] ?? '').trim();
      });
      return {
        permit_number: raw.permit_number ?? '',
        npdes_id: raw.npdes_id ?? '',
        state_code: raw.state_code ?? '',
        confidence: (raw.confidence ?? '').toUpperCase(),
        confirmation_basis: rawValue(raw, 'confirmation_basis', 'confirmation basis', 'basis'),
        confirmation_reference: rawValue(
          raw,
          'confirmation_reference',
          'confirmation reference',
          'reference',
        ),
        notes: raw.notes ?? '',
        raw,
      };
    });
}

export function buildNpdesMappingImportPreview(
  rows: NpdesMappingCsvRow[],
  registryPermitNumbers: Set<string>,
): NpdesMappingImportPreview {
  const preview: NpdesMappingImportPreview = {
    totalRows: rows.length,
    importable: [],
    skippedConfidence: [],
    skippedInvalid: [],
    skippedMissing: [],
    skippedConfirmation: [],
    unmatchedPermits: [],
  };

  for (const row of rows) {
    if (!row.permit_number.trim() || !row.npdes_id.trim() || !row.state_code.trim()) {
      preview.skippedMissing.push(row);
      continue;
    }
    if (!IMPORTABLE_NPDES_CONFIDENCE.has(row.confidence)) {
      preview.skippedConfidence.push(row);
      continue;
    }
    const npdesValidation = validateFederalNpdesId(row.npdes_id);
    if (!npdesValidation.valid) {
      preview.skippedInvalid.push(row);
      continue;
    }

    const candidate: NpdesMappingImportCandidate = {
      permit_number: normalizePermitId(row.permit_number),
      npdes_id: normalizePermitId(row.npdes_id),
      state_code: row.state_code.trim().toUpperCase(),
      confidence: row.confidence,
    };

    const requiresConfirmation =
      candidate.state_code === 'VA' ||
      candidate.permit_number.startsWith('VA') ||
      candidate.npdes_id.startsWith('VA');
    const basis = row.confirmation_basis.trim();
    const reference = row.confirmation_reference.trim();
    const basisValidation = validateConfirmationBasis(basis || null, reference, {
      required: requiresConfirmation,
    });
    if (!basisValidation.valid) {
      preview.skippedConfirmation.push(row);
      continue;
    }

    if (basis) candidate.confirmation_basis = basis as NpdesConfirmationBasis;
    if (reference) candidate.confirmation_reference = reference;
    if (row.notes.trim()) candidate.notes = row.notes.trim();

    if (!registryPermitNumbers.has(candidate.permit_number)) {
      preview.unmatchedPermits.push(candidate);
      continue;
    }

    preview.importable.push(candidate);
  }

  return preview;
}

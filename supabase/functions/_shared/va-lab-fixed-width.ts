/**
 * VA lab data fixed-width parser — Spec v1.
 *
 * VA contractor lab exports often use positional fields despite a .csv extension.
 * Positions are documented here for refinement when client samples arrive
 * (see DATA_REQUEST_TN_VA.md).
 */

import {
  buildExtractedLabData,
  type ExtractedLabDataBase,
  type LabImportRecord,
  normalizeParameter,
  parseDate,
  parseValue,
} from "./lab-import-records.ts";

export const VA_LAB_SPEC_VERSION = "1.0.0";
export const VA_LAB_PARSER_VERSION = "1.0.0";

/** Inclusive start, exclusive end — 0-based byte positions. */
export interface VaFixedWidthField {
  name: string;
  start: number;
  end: number;
}

/** Documented positional layout (refine with Bill Johnson samples). */
export const VA_LAB_FIELD_SPEC_V1: VaFixedWidthField[] = [
  { name: "permit_number", start: 0, end: 11 },
  { name: "outfall_id", start: 11, end: 15 },
  { name: "sample_date", start: 15, end: 25 },
  { name: "parameter_code", start: 25, end: 45 },
  { name: "result_value", start: 45, end: 57 },
  { name: "unit", start: 57, end: 65 },
  { name: "qualifier", start: 65, end: 67 },
  { name: "lab_name", start: 67, end: 87 },
  { name: "site_name", start: 87, end: 117 },
];

export const VA_LAB_MIN_LINE_LENGTH = 80;

const HEADER_MARKERS = ["permit", "outfall", "parameter", "result", "sample"];

function sliceField(line: string, field: VaFixedWidthField): string {
  if (line.length < field.end) {
    return line.slice(field.start).trim();
  }
  return line.slice(field.start, field.end).trim();
}

function parseFixedWidthLine(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of VA_LAB_FIELD_SPEC_V1) {
    out[field.name] = sliceField(line, field);
  }
  return out;
}

export function isLikelyVaFixedWidthLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Comma-rich lines are delimited CSV, not positional (allow 1–2 in-field commas).
  const commaCount = (trimmed.match(/,/g) ?? []).length;
  if (commaCount >= 3) return false;
  if (trimmed.length < VA_LAB_MIN_LINE_LENGTH) return false;

  const lower = trimmed.toLowerCase();
  if (HEADER_MARKERS.some((m) => lower.includes(m) && lower.indexOf(m) < 20)) {
    return false;
  }

  return true;
}

export function isLikelyVaFixedWidthContent(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return false;

  const dataLines = lines.filter((l) => !isHeaderLine(l));
  if (dataLines.length === 0) return false;

  const fixedCount = dataLines.filter(isLikelyVaFixedWidthLine).length;
  return fixedCount / dataLines.length >= 0.5;
}

function isHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  const hits = HEADER_MARKERS.filter((m) => lower.includes(m));
  return hits.length >= 2;
}

/** Delimited fallback when a VA upload is true CSV. */
const VA_CSV_ALIASES: Record<string, string> = {
  permit: "permit_number",
  "permit number": "permit_number",
  "permit#": "permit_number",
  "permit no": "permit_number",
  outfall: "outfall_id",
  "discharge #": "outfall_id",
  "discharge": "outfall_id",
  "sample date": "sample_date",
  "date collected": "sample_date",
  "collection date": "sample_date",
  parameter: "parameter_code",
  analyte: "parameter_code",
  result: "result_value",
  value: "result_value",
  "reported value": "result_value",
  unit: "unit",
  units: "unit",
  qualifier: "qualifier",
  "data qualifier": "qualifier",
  lab: "lab_name",
  "lab name": "lab_name",
  site: "site_name",
  "site name": "site_name",
};

function parseDelimitedVaCsv(text: string): {
  records: LabImportRecord[];
  skippedRows: number;
  validationErrors: ExtractedLabDataBase["validation_errors"];
  warnings: string[];
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return {
      records: [],
      skippedRows: 0,
      validationErrors: [{ row: 1, column: "file", message: "No data rows in delimited CSV" }],
      warnings: [],
    };
  }

  const headerCells = splitCsvLine(lines[0]!);
  const colMap = new Map<number, string>();
  headerCells.forEach((cell, idx) => {
    const key = VA_CSV_ALIASES[cell.toLowerCase().trim()];
    if (key) colMap.set(idx, key);
  });

  if (colMap.size < 3) {
    return {
      records: [],
      skippedRows: lines.length - 1,
      validationErrors: [{
        row: 1,
        column: "header",
        message: "Delimited VA CSV missing required columns (permit, parameter, result)",
      }],
      warnings: ["Could not map delimited CSV headers to VA lab schema"],
    };
  }

  const records: LabImportRecord[] = [];
  const validationErrors: ExtractedLabDataBase["validation_errors"] = [];
  let skippedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const fields: Record<string, string> = {};
    colMap.forEach((name, idx) => {
      fields[name] = (cells[idx] ?? "").trim();
    });

    const rowNum = i + 1;
    if (!fields.permit_number && !fields.parameter_code) {
      skippedRows++;
      continue;
    }

    const rec = rowToRecord(fields, rowNum, validationErrors);
    if (rec) records.push(rec);
    else skippedRows++;
  }

  return {
    records,
    skippedRows,
    validationErrors,
    warnings: ["Parsed as delimited CSV (not fixed-width)"],
  };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    const next = line[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function rowToRecord(
  fields: Record<string, string>,
  rowNum: number,
  validationErrors: ExtractedLabDataBase["validation_errors"],
): LabImportRecord | null {
  const permitNumber = fields.permit_number ?? "";
  const parameterRaw = fields.parameter_code ?? "";
  if (!parameterRaw) {
    validationErrors.push({ row: rowNum, column: "parameter", message: "Missing parameter" });
    return null;
  }

  const { canonical } = normalizeParameter(parameterRaw);
  const sampleDate = parseDate(fields.sample_date);
  if (fields.sample_date && !sampleDate) {
    validationErrors.push({
      row: rowNum,
      column: "sample_date",
      message: `Invalid date: "${fields.sample_date}"`,
    });
  }

  const parsed = parseValue(fields.result_value ?? "", fields.qualifier ?? "");

  return {
    row_number: rowNum,
    permittee_name: "",
    permit_number: permitNumber,
    site_name: fields.site_name ?? "",
    site_state: "VA",
    site_county: "",
    lab_name: fields.lab_name ?? "",
    sampler: "",
    outfall_raw: fields.outfall_id ?? "",
    outfall_matched: null,
    outfall_db_id: null,
    outfall_match_method: null,
    latitude: null,
    longitude: null,
    stream_name: "",
    sample_date: sampleDate,
    sample_time: null,
    analysis_date: null,
    parameter_raw: parameterRaw,
    parameter_canonical: canonical,
    parameter_id: null,
    value: parsed.value,
    value_raw: parsed.raw,
    unit: fields.unit ?? "",
    below_detection: parsed.belowDetection,
    data_qualifier: parsed.qualifier,
    comments: null,
    hold_time_days: null,
    hold_time_compliant: null,
    is_duplicate: false,
  };
}

export interface VaLabParseResult {
  extracted: ExtractedLabDataBase;
  formatDetected: "fixed_width" | "delimited_csv" | "rejected";
}

export function parseVaLabFileContent(text: string): VaLabParseResult {
  const warnings: string[] = [
    "DRAFT — VA lab parser spec v1. Refine column positions when client samples arrive.",
  ];
  const validationErrors: ExtractedLabDataBase["validation_errors"] = [];
  const lines = text.split(/\r?\n/);
  const totalRows = lines.filter((l) => l.trim()).length;

  if (!isLikelyVaFixedWidthContent(text)) {
    const delimited = parseDelimitedVaCsv(text);
    if (delimited.records.length > 0) {
      return {
        formatDetected: "delimited_csv",
        extracted: buildExtractedLabData({
          document_type: "va_lab_csv",
          file_format: "csv",
          parser_version: VA_LAB_PARSER_VERSION,
          spec_version: VA_LAB_SPEC_VERSION,
          draft_mode: true,
          column_count: VA_LAB_FIELD_SPEC_V1.length,
          total_rows: totalRows,
          parsed_rows: delimited.records.length,
          skipped_rows: delimited.skippedRows,
          permit_numbers: [],
          states: ["VA"],
          sites: [],
          lab_names: [],
          warnings: [...warnings, ...delimited.warnings],
          validation_errors: [...validationErrors, ...delimited.validationErrors],
          hold_time_violations: [],
          records: delimited.records,
          records_truncated: false,
          summary: "",
          import_id: null,
        }),
      };
    }

    return {
      formatDetected: "rejected",
      extracted: buildExtractedLabData({
        document_type: "va_lab_csv",
        file_format: "csv",
        parser_version: VA_LAB_PARSER_VERSION,
        spec_version: VA_LAB_SPEC_VERSION,
        draft_mode: true,
        column_count: 0,
        total_rows: totalRows,
        parsed_rows: 0,
        skipped_rows: totalRows,
        permit_numbers: [],
        states: ["VA"],
        sites: [],
        lab_names: [],
        warnings: [
          ...warnings,
          "File does not match VA fixed-width or delimited CSV schema — rejected rather than misparsed.",
        ],
        validation_errors: [{
          row: 0,
          column: "file",
          message: "Unrecognized VA lab file shape (expected fixed-width lines ≥80 chars without commas, or header-mapped CSV)",
        }],
        hold_time_violations: [],
        records: [],
        records_truncated: false,
        summary: "No records parsed — file shape validation failed.",
        import_id: null,
      }),
    };
  }

  const records: LabImportRecord[] = [];
  let skippedRows = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    if (isHeaderLine(line)) {
      skippedRows++;
      continue;
    }
    if (!isLikelyVaFixedWidthLine(line)) {
      validationErrors.push({
        row: i + 1,
        column: "line",
        message: `Line length ${line.length} does not match fixed-width spec (min ${VA_LAB_MIN_LINE_LENGTH}, no commas)`,
      });
      skippedRows++;
      continue;
    }

    const fields = parseFixedWidthLine(line);
    const rec = rowToRecord(fields, i + 1, validationErrors);
    if (rec) records.push(rec);
    else skippedRows++;
  }

  warnings.push(`Parsed as VA fixed-width spec v${VA_LAB_SPEC_VERSION}.`);

  return {
    formatDetected: "fixed_width",
    extracted: buildExtractedLabData({
      document_type: "va_lab_csv",
      file_format: "csv",
      parser_version: VA_LAB_PARSER_VERSION,
      spec_version: VA_LAB_SPEC_VERSION,
      draft_mode: true,
      column_count: VA_LAB_FIELD_SPEC_V1.length,
      total_rows: totalRows,
      parsed_rows: records.length,
      skipped_rows: skippedRows,
      permit_numbers: [],
      states: ["VA"],
      sites: [],
      lab_names: [],
      warnings,
      validation_errors: validationErrors,
      hold_time_violations: [],
      records,
      records_truncated: false,
      summary: "",
      import_id: null,
    }),
  };
}

/** Build a synthetic fixed-width line for tests. */
export function buildVaFixedWidthLine(fields: Partial<Record<string, string>>): string {
  const width = VA_LAB_FIELD_SPEC_V1[VA_LAB_FIELD_SPEC_V1.length - 1]!.end;
  const buf = " ".repeat(width).split("");
  for (const spec of VA_LAB_FIELD_SPEC_V1) {
    const val = (fields[spec.name] ?? "").slice(0, spec.end - spec.start);
    for (let i = 0; i < val.length; i++) {
      buf[spec.start + i] = val[i]!;
    }
  }
  return buf.join("");
}

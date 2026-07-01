/**
 * Alabama lab data parser — Spec v1.
 *
 * Accepts LRS (Asheville), Waypoint Analytical, and HMR spreadsheet exports
 * from Brad Morrison's AL sampling chain. See Alabama_Lab_Contact_Brad_Morrison.md.
 *
 * Supports:
 * - Long-format tabular (Analyte/Parameter + Result columns) — LRS/Waypoint exports
 * - Wide-format HMR rows (parameters as column headers)
 */

import {
  buildExtractedLabData,
  normalizeParameter,
  parseDate,
  parseValue,
  type ExtractedLabDataBase,
  type LabImportRecord,
} from "./lab-import-records.ts";

export const AL_LAB_SPEC_VERSION = "1.0.0";
export const AL_LAB_PARSER_VERSION = "1.0.0";

export interface AlSheetInput {
  name: string;
  rows: string[][];
}

export type AlFormatDetected = "long_tabular" | "wide_hmr" | "rejected";

/** AL-relevant parameters for wide-format column detection. */
const WIDE_PARAM_HEADERS = new Set([
  "ph",
  "tss",
  "iron",
  "fe",
  "manganese",
  "mn",
  "zinc",
  "zn",
  "copper",
  "cu",
  "sulfate",
  "so4",
  "conductivity",
  "specific conductance",
  "sp cond",
  "cond",
]);

const LONG_HEADER_ALIASES: Record<string, string> = {
  permit: "permit_number",
  "permit number": "permit_number",
  "permit no": "permit_number",
  "permit id": "permit_number",
  "npdes id": "permit_number",
  site: "site_name",
  "site name": "site_name",
  mine: "site_name",
  facility: "site_name",
  "client name": "site_name",
  client: "site_name",
  outfall: "outfall_id",
  "outfall #": "outfall_id",
  "outfall id": "outfall_id",
  discharge: "outfall_id",
  "discharge #": "outfall_id",
  "sample id": "outfall_id",
  "sample point": "outfall_id",
  parameter: "parameter_code",
  analyte: "parameter_code",
  constituent: "parameter_code",
  "parameter name": "parameter_code",
  result: "result_value",
  value: "result_value",
  "reported value": "result_value",
  concentration: "result_value",
  unit: "unit",
  units: "unit",
  "sample date": "sample_date",
  "date collected": "sample_date",
  "collection date": "sample_date",
  "date sampled": "sample_date",
  "analysis date": "analysis_date",
  "date analyzed": "analysis_date",
  qualifier: "qualifier",
  "data qualifier": "qualifier",
  lab: "lab_name",
  "lab name": "lab_name",
  laboratory: "lab_name",
  sampler: "sampler",
  "collected by": "sampler",
};

const SKIP_SHEET_NAMES = /^(cover|instructions|notes|readme|legend|definitions)$/i;

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().trim().replace(/[\s_]+/g, " ");
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

function inferLabName(
  fields: Record<string, string>,
  sheetName: string,
  fileHint: string,
): string {
  if (fields.lab_name) {
    const lower = fields.lab_name.toLowerCase();
    if (/waypoint/.test(lower)) return "Waypoint Analytical";
    if (/\blrs\b|asheville/.test(lower)) return "LRS (Asheville)";
    return fields.lab_name;
  }
  const combined = `${sheetName} ${fileHint}`.toLowerCase();
  if (/waypoint/.test(combined)) return "Waypoint Analytical";
  if (/\blrs\b|asheville/.test(combined)) return "LRS (Asheville)";
  if (/hmr|hydrologic/.test(combined)) return "HMR Consolidation";
  if (/field|brad/.test(combined)) return "Field (Brad Morrison)";
  return "";
}

function fieldsToRecord(
  fields: Record<string, string>,
  rowNum: number,
  context: { sheetName: string; fileHint: string },
  validationErrors: ExtractedLabDataBase["validation_errors"],
): LabImportRecord | null {
  const parameterRaw = fields.parameter_code ?? "";
  if (!parameterRaw) return null;

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
  const permitNumber = fields.permit_number ?? "";
  const siteName = fields.site_name ?? context.sheetName;

  return {
    row_number: rowNum,
    permittee_name: "",
    permit_number: permitNumber,
    site_name: siteName,
    site_state: "AL",
    site_county: "",
    lab_name: inferLabName(fields, context.sheetName, context.fileHint),
    sampler: fields.sampler ?? "",
    outfall_raw: fields.outfall_id ?? "",
    outfall_matched: null,
    outfall_db_id: null,
    outfall_match_method: null,
    latitude: null,
    longitude: null,
    stream_name: "",
    sample_date: sampleDate,
    sample_time: null,
    analysis_date: parseDate(fields.analysis_date),
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

function findLongFormatHeader(rows: string[][]): { index: number; colMap: Map<number, string> } | null {
  const maxScan = Math.min(rows.length, 30);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] ?? [];
    const colMap = new Map<number, string>();
    row.forEach((cell, idx) => {
      const alias = LONG_HEADER_ALIASES[normalizeHeader(cell)];
      if (alias) colMap.set(idx, alias);
    });

    const hasParam = [...colMap.values()].includes("parameter_code");
    const hasResult = [...colMap.values()].includes("result_value");
    const hasContext =
      [...colMap.values()].includes("permit_number") ||
      [...colMap.values()].includes("site_name") ||
      [...colMap.values()].includes("outfall_id");

    if (hasParam && hasResult && hasContext) {
      return { index: i, colMap };
    }
  }
  return null;
}

function parseLongFormatSheet(
  sheet: AlSheetInput,
  fileHint: string,
  validationErrors: ExtractedLabDataBase["validation_errors"],
): LabImportRecord[] {
  const header = findLongFormatHeader(sheet.rows);
  if (!header) return [];

  const records: LabImportRecord[] = [];
  const dataRows = sheet.rows.slice(header.index + 1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];
    if (!row.some((c) => c && c.trim())) continue;

    const fields: Record<string, string> = {};
    header.colMap.forEach((name, idx) => {
      fields[name] = (row[idx] ?? "").trim();
    });

    const rec = fieldsToRecord(fields, header.index + i + 2, { sheetName: sheet.name, fileHint }, validationErrors);
    if (rec) records.push(rec);
  }

  return records;
}

function findWideHmrHeader(rows: string[][]): {
  index: number;
  idCols: Map<number, string>;
  paramCols: Map<number, string>;
} | null {
  const maxScan = Math.min(rows.length, 30);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] ?? [];
    const idCols = new Map<number, string>();
    const paramCols = new Map<number, string>();

    row.forEach((cell, idx) => {
      const norm = normalizeHeader(cell);
      const alias = LONG_HEADER_ALIASES[norm];
      if (alias && alias !== "parameter_code" && alias !== "result_value" && alias !== "unit") {
        idCols.set(idx, alias);
        return;
      }
      if (WIDE_PARAM_HEADERS.has(norm)) {
        paramCols.set(idx, cell.trim());
      }
    });

    const hasDate = [...idCols.values()].includes("sample_date");
    const hasSite =
      [...idCols.values()].includes("site_name") ||
      [...idCols.values()].includes("permit_number") ||
      [...idCols.values()].includes("outfall_id");

    if (hasDate && hasSite && paramCols.size >= 2) {
      return { index: i, idCols, paramCols };
    }
  }
  return null;
}

function parseWideHmrSheet(
  sheet: AlSheetInput,
  fileHint: string,
  validationErrors: ExtractedLabDataBase["validation_errors"],
): LabImportRecord[] {
  const header = findWideHmrHeader(sheet.rows);
  if (!header) return [];

  const records: LabImportRecord[] = [];
  const dataRows = sheet.rows.slice(header.index + 1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? [];
    if (!row.some((c) => c && c.trim())) continue;

    const baseFields: Record<string, string> = {};
    header.idCols.forEach((name, idx) => {
      baseFields[name] = (row[idx] ?? "").trim();
    });

    if (!baseFields.sample_date && !baseFields.site_name && !baseFields.permit_number) continue;

    header.paramCols.forEach((paramName, idx) => {
      const valueRaw = (row[idx] ?? "").trim();
      if (!valueRaw || valueRaw === "-") return;

      const fields = {
        ...baseFields,
        parameter_code: paramName,
        result_value: valueRaw,
        unit: "",
        qualifier: "",
      };

      const rec = fieldsToRecord(
        fields,
        header.index + i + 2,
        { sheetName: sheet.name, fileHint },
        validationErrors,
      );
      if (rec) records.push(rec);
    });
  }

  return records;
}

function dedupeRecords(records: LabImportRecord[]): LabImportRecord[] {
  const seen = new Set<string>();
  const out: LabImportRecord[] = [];
  for (const r of records) {
    const key =
      `${r.permit_number}|${r.site_name}|${r.outfall_raw}|${r.sample_date}|${r.parameter_canonical}|${r.value_raw}`
        .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export interface AlLabParseInput {
  sheets: AlSheetInput[];
  fileHint?: string;
  fileFormat?: "csv" | "xlsx" | "xls";
}

export interface AlLabParseResult {
  extracted: ExtractedLabDataBase;
  formatDetected: AlFormatDetected;
  sheetsParsed: string[];
  sheetsSkipped: string[];
}

export function parseAlLabSheets(input: AlLabParseInput): AlLabParseResult {
  const warnings: string[] = [
    "DRAFT — AL lab parser spec v1. Refine column mapping when Brad Morrison / LRS / Waypoint samples arrive.",
  ];
  const validationErrors: ExtractedLabDataBase["validation_errors"] = [];
  const fileHint = input.fileHint ?? "";
  const fileFormat = input.fileFormat ?? "xlsx";
  const sheetsParsed: string[] = [];
  const sheetsSkipped: string[] = [];
  let totalRows = 0;
  let skippedRows = 0;
  let formatDetected: AlFormatDetected = "rejected";

  const allRecords: LabImportRecord[] = [];

  for (const sheet of input.sheets) {
    const name = sheet.name.trim();
    if (!name || SKIP_SHEET_NAMES.test(name)) {
      sheetsSkipped.push(name || "(unnamed)");
      continue;
    }

    const longRecords = parseLongFormatSheet(sheet, fileHint, validationErrors);
    if (longRecords.length > 0) {
      sheetsParsed.push(name);
      totalRows += sheet.rows.length;
      allRecords.push(...longRecords);
      if (formatDetected === "rejected") formatDetected = "long_tabular";
      continue;
    }

    const wideRecords = parseWideHmrSheet(sheet, fileHint, validationErrors);
    if (wideRecords.length > 0) {
      sheetsParsed.push(name);
      totalRows += sheet.rows.length;
      allRecords.push(...wideRecords);
      formatDetected = "wide_hmr";
      continue;
    }

    sheetsSkipped.push(name);
    skippedRows += sheet.rows.length;
    warnings.push(`Sheet "${name}" skipped — no recognizable AL lab or HMR header row.`);
  }

  const records = dedupeRecords(allRecords);
  skippedRows += allRecords.length - records.length;

  if (records.length > 0) {
    warnings.push(`Parsed ${sheetsParsed.length} sheet(s): ${sheetsParsed.join(", ")}.`);
    if (formatDetected === "wide_hmr") {
      warnings.push("Detected wide-format HMR layout (parameters as columns).");
    } else {
      warnings.push("Detected long-format tabular layout (LRS/Waypoint style).");
    }
  } else {
    warnings.push("No valid AL lab rows found — file shape validation failed.");
  }

  return {
    formatDetected,
    sheetsParsed,
    sheetsSkipped,
    extracted: buildExtractedLabData({
      document_type: "al_lab_data",
      file_format: fileFormat,
      parser_version: AL_LAB_PARSER_VERSION,
      spec_version: AL_LAB_SPEC_VERSION,
      draft_mode: true,
      column_count: 0,
      total_rows: totalRows,
      parsed_rows: records.length,
      skipped_rows: skippedRows,
      permit_numbers: [],
      states: ["AL"],
      sites: [],
      lab_names: [],
      warnings,
      validation_errors: validationErrors,
      hold_time_violations: [],
      records,
      records_truncated: false,
      summary: records.length === 0 ? "No records parsed — AL lab file shape validation failed." : "",
      import_id: null,
    }),
  };
}

/** Parse CSV text into a single-sheet input. */
export function parseAlLabCsvContent(text: string, fileHint = ""): AlLabParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map(splitCsvLine);
  return parseAlLabSheets({
    sheets: [{ name: "Data", rows }],
    fileHint,
    fileFormat: "csv",
  });
}

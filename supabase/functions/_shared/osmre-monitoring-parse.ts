/**
 * TN OSMRE quarterly monitoring workbook parser — Spec v1.
 *
 * Expected multi-sheet XLSX layout (see DATA_REQUEST_TN_VA.md):
 * - "DMR" sheet: permit limits + DMR summary rows
 * - Additional sheets: per-outfall sampling results
 */

import {
  buildExtractedLabData,
  type ExtractedLabDataBase,
  type LabImportRecord,
  normalizeParameter,
  parseDate,
  parseValue,
} from "./lab-import-records.ts";

export const OSMRE_SPEC_VERSION = "1.0.0";
export const OSMRE_PARSER_VERSION = "1.0.0";

export interface OsmreSheetInput {
  name: string;
  rows: string[][];
}

const SKIP_SHEET_NAMES = /^(cover|instructions|notes|readme|sheet1)$/i;
const DMR_SHEET_NAMES = /^(dmr|summary|monitoring summary)$/i;

const HEADER_ALIASES: Record<string, string> = {
  permit: "permit_number",
  "permit number": "permit_number",
  "permit no": "permit_number",
  "permit id": "permit_number",
  discharge: "outfall_id",
  "discharge #": "outfall_id",
  "discharge number": "outfall_id",
  outfall: "outfall_id",
  "outfall #": "outfall_id",
  parameter: "parameter_code",
  analyte: "parameter_code",
  "parameter name": "parameter_code",
  limit: "limit_value",
  "limit value": "limit_value",
  result: "result_value",
  value: "result_value",
  "reported value": "result_value",
  concentration: "result_value",
  "quantity or loading": "result_value",
  unit: "unit",
  units: "unit",
  "sample date": "sample_date",
  "date collected": "sample_date",
  "collection date": "sample_date",
  "monitoring period end": "sample_date",
  nodi: "nodi_code",
};

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().trim().replace(/[\s_]+/g, " ");
}

function findHeaderRow(rows: string[][]): { index: number; colMap: Map<number, string> } | null {
  const maxScan = Math.min(rows.length, 30);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] ?? [];
    const colMap = new Map<number, string>();
    row.forEach((cell, idx) => {
      const alias = HEADER_ALIASES[normalizeHeader(cell)];
      if (alias) colMap.set(idx, alias);
    });

    const hasPermit = [...colMap.values()].includes("permit_number");
    const hasParam = [...colMap.values()].includes("parameter_code");
    const hasResult = [...colMap.values()].includes("result_value");
    if (hasPermit && hasParam && (hasResult || [...colMap.values()].includes("limit_value"))) {
      return { index: i, colMap };
    }
  }
  return null;
}

function cellsToFields(row: string[], colMap: Map<number, string>): Record<string, string> {
  const fields: Record<string, string> = {};
  colMap.forEach((name, idx) => {
    fields[name] = (row[idx] ?? "").trim();
  });
  return fields;
}

function isNodiOnly(fields: Record<string, string>): boolean {
  const nodi = (fields.nodi_code ?? "").toUpperCase();
  const result = fields.result_value ?? "";
  return !result && ["C", "9", "N", "R", "U", "W"].includes(nodi);
}

function fieldsToRecord(
  fields: Record<string, string>,
  rowNum: number,
  sheetName: string,
  validationErrors: ExtractedLabDataBase["validation_errors"],
): LabImportRecord | null {
  if (isNodiOnly(fields)) return null;

  const parameterRaw = fields.parameter_code ?? "";
  if (!parameterRaw) return null;

  const permitNumber = fields.permit_number ?? "";
  const { canonical } = normalizeParameter(parameterRaw);
  const sampleDate = parseDate(fields.sample_date);
  if (fields.sample_date && !sampleDate) {
    validationErrors.push({
      row: rowNum,
      column: "sample_date",
      message: `Invalid date on sheet "${sheetName}": "${fields.sample_date}"`,
    });
  }

  const parsed = parseValue(fields.result_value ?? fields.limit_value ?? "", "");
  if (parsed.raw === "" && !fields.limit_value) {
    validationErrors.push({
      row: rowNum,
      column: "result",
      message: `Missing result on sheet "${sheetName}"`,
    });
    return null;
  }

  return {
    row_number: rowNum,
    permittee_name: "",
    permit_number: permitNumber,
    site_name: sheetName,
    site_state: "TN",
    site_county: "",
    lab_name: "",
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
    data_qualifier: fields.nodi_code ?? parsed.qualifier,
    comments: null,
    hold_time_days: null,
    hold_time_compliant: null,
    is_duplicate: false,
  };
}

export interface OsmreParseResult {
  extracted: ExtractedLabDataBase;
  sheetsParsed: string[];
  sheetsSkipped: string[];
}

export function parseOsmreMonitoringSheets(sheets: OsmreSheetInput[]): OsmreParseResult {
  const warnings: string[] = [
    "DRAFT — OSMRE monitoring parser spec v1. Refine sheet/column mapping when client samples arrive.",
  ];
  const validationErrors: ExtractedLabDataBase["validation_errors"] = [];
  const records: LabImportRecord[] = [];
  const sheetsParsed: string[] = [];
  const sheetsSkipped: string[] = [];
  let totalRows = 0;
  let skippedRows = 0;

  if (sheets.length === 0) {
    return {
      sheetsParsed,
      sheetsSkipped,
      extracted: buildExtractedLabData({
        document_type: "osmre_monitoring",
        file_format: "xlsx",
        parser_version: OSMRE_PARSER_VERSION,
        spec_version: OSMRE_SPEC_VERSION,
        draft_mode: true,
        column_count: 0,
        total_rows: 0,
        parsed_rows: 0,
        skipped_rows: 0,
        permit_numbers: [],
        states: ["TN"],
        sites: [],
        lab_names: [],
        warnings: [...warnings, "Workbook has no sheets"],
        validation_errors: [{ row: 0, column: "workbook", message: "Empty workbook" }],
        hold_time_violations: [],
        records: [],
        records_truncated: false,
        summary: "No records parsed — empty workbook.",
        import_id: null,
      }),
    };
  }

  // Parse DMR sheet first, then remaining data sheets
  const ordered = [...sheets].sort((a, b) => {
    const aDmr = DMR_SHEET_NAMES.test(a.name.trim()) ? 0 : 1;
    const bDmr = DMR_SHEET_NAMES.test(b.name.trim()) ? 0 : 1;
    return aDmr - bDmr;
  });

  for (const sheet of ordered) {
    const name = sheet.name.trim();
    if (!name || SKIP_SHEET_NAMES.test(name)) {
      sheetsSkipped.push(name || "(unnamed)");
      continue;
    }

    const header = findHeaderRow(sheet.rows);
    if (!header) {
      sheetsSkipped.push(name);
      warnings.push(`Sheet "${name}" skipped — no recognizable header row (Permit + Parameter + Result).`);
      continue;
    }

    sheetsParsed.push(name);
    const dataRows = sheet.rows.slice(header.index + 1);
    totalRows += dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] ?? [];
      const hasContent = row.some((c) => c && c.trim());
      if (!hasContent) {
        skippedRows++;
        continue;
      }

      const fields = cellsToFields(row, header.colMap);
      const rec = fieldsToRecord(fields, header.index + i + 2, name, validationErrors);
      if (rec) {
        // Dedupe across DMR + outfall sheets
        const dupeKey =
          `${rec.permit_number}|${rec.outfall_raw}|${rec.sample_date}|${rec.parameter_canonical}`.toLowerCase();
        const exists = records.some(
          (r) =>
            `${r.permit_number}|${r.outfall_raw}|${r.sample_date}|${r.parameter_canonical}`.toLowerCase() ===
              dupeKey,
        );
        if (exists) {
          skippedRows++;
          continue;
        }
        records.push(rec);
      } else {
        skippedRows++;
      }
    }
  }

  if (records.length === 0) {
    warnings.push("No valid monitoring rows found — file shape validation failed.");
  } else {
    warnings.push(`Parsed ${sheetsParsed.length} sheet(s): ${sheetsParsed.join(", ")}.`);
  }

  return {
    sheetsParsed,
    sheetsSkipped,
    extracted: buildExtractedLabData({
      document_type: "osmre_monitoring",
      file_format: "xlsx",
      parser_version: OSMRE_PARSER_VERSION,
      spec_version: OSMRE_SPEC_VERSION,
      draft_mode: true,
      column_count: 0,
      total_rows: totalRows,
      parsed_rows: records.length,
      skipped_rows: skippedRows,
      permit_numbers: [],
      states: ["TN"],
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

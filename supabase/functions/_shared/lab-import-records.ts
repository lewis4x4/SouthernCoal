/**
 * Shared lab import record types and normalization helpers.
 * Used by parse-lab-data-edd, parse-va-lab-csv, and parse-osmre-monitoring.
 */

export type LabDocumentType = "lab_data_edd" | "va_lab_csv" | "osmre_monitoring" | "al_lab_data";

export interface LabImportRecord {
  row_number: number;
  permittee_name: string;
  permit_number: string;
  site_name: string;
  site_state: string;
  site_county: string;
  lab_name: string;
  sampler: string;
  outfall_raw: string;
  outfall_matched: string | null;
  outfall_db_id: string | null;
  outfall_match_method: string | null;
  latitude: number | null;
  longitude: number | null;
  stream_name: string;
  sample_date: string | null;
  sample_time: string | null;
  analysis_date: string | null;
  parameter_raw: string;
  parameter_canonical: string;
  parameter_id: string | null;
  value: number | null;
  value_raw: string;
  unit: string;
  below_detection: boolean;
  data_qualifier: string | null;
  comments: string | null;
  hold_time_days: number | null;
  hold_time_compliant: boolean | null;
  is_duplicate: boolean;
}

export interface ExtractedLabDataBase {
  document_type: LabDocumentType;
  file_format: "csv" | "xlsx" | "xls";
  parser_version: string;
  spec_version: string;
  draft_mode: boolean;
  column_count: number;
  total_rows: number;
  parsed_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  permit_numbers: string[];
  states: string[];
  sites: string[];
  date_range: { earliest: string | null; latest: string | null };
  lab_names: string[];
  parameters_found: number;
  parameters_resolved: number;
  parameter_summary: Array<{
    canonical_name: string;
    parameter_id: string | null;
    sample_count: number;
    below_detection_count: number;
  }>;
  outfalls_found: number;
  outfalls_resolved: number;
  outfall_aliases_created: number;
  outfall_summary: Array<{
    raw_name: string;
    matched_id: string | null;
    outfall_db_id: string | null;
    match_method: string | null;
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
  records: LabImportRecord[];
  records_truncated: boolean;
  summary: string;
  import_id: string | null;
}

/** Subset of WV EDD parameter map — extend when client dictionary arrives. */
export const PARAMETER_MAP: Record<string, string> = {
  "fe_tot": "Iron",
  iron: "Iron",
  "iron (total)": "Iron",
  "iron, total": "Iron",
  "iron total": "Iron",
  "01045": "Iron",
  mn_tot: "Manganese",
  manganese: "Manganese",
  "manganese (total)": "Manganese",
  "manganese, total": "Manganese",
  "01055": "Manganese",
  ph: "pH",
  "ph_fld": "pH",
  "00400": "pH",
  tss: "Total Suspended Solids",
  "total suspended solids": "Total Suspended Solids",
  "00530": "Total Suspended Solids",
  se_tot: "Selenium",
  selenium: "Selenium",
  "selenium (total)": "Selenium",
  "01145": "Selenium",
  cond: "Conductivity",
  conductivity: "Conductivity",
  "specific conductance": "Conductivity",
  "00095": "Conductivity",
  "total dissolved solids": "Total Dissolved Solids",
  tds: "Total Dissolved Solids",
  "70300": "Total Dissolved Solids",
  sulfate: "Sulfate",
  "00945": "Sulfate",
  chloride: "Chloride",
  "00940": "Chloride",
  alkalinity: "Alkalinity",
  "00410": "Alkalinity",
  hardness: "Hardness",
  "00900": "Hardness",
  aluminum: "Aluminum",
  "aluminum (total)": "Aluminum",
  "01106": "Aluminum",
  zinc: "Zinc",
  "zinc (total)": "Zinc",
  "01090": "Zinc",
  copper: "Copper",
  "copper (total)": "Copper",
  "01040": "Copper",
  "sp cond": "Conductivity",
  "conductance, specific": "Conductivity",
};

const BELOW_DETECTION_QUALIFIERS = new Set(["u", "j", "<", "b", "nd", "n/d"]);

export function normalizeParameter(raw: string): { canonical: string; parameterId: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { canonical: "", parameterId: null };

  const lower = trimmed.toLowerCase();
  const mapped = PARAMETER_MAP[lower];
  if (mapped) return { canonical: mapped, parameterId: null };

  // STORET-style numeric codes
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 5 && PARAMETER_MAP[digits]) {
    return { canonical: PARAMETER_MAP[digits]!, parameterId: null };
  }

  // Title-case fallback for unknown parameters — flagged in UI
  const title = trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return { canonical: title, parameterId: null };
}

export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0]!;

  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    const [, mm, dd, yyyy] = us;
    return `${yyyy}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }

  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  return null;
}

export function parseValue(
  valueRaw: string,
  qualifierRaw: string,
): { value: number | null; belowDetection: boolean; qualifier: string | null; raw: string } {
  const raw = valueRaw.trim();
  const qualifier = qualifierRaw.trim() || null;
  const qualLower = (qualifier ?? "").toLowerCase();

  if (!raw || raw === "-" || raw.toUpperCase() === "ND") {
    return { value: null, belowDetection: true, qualifier, raw };
  }

  const belowDetection =
    BELOW_DETECTION_QUALIFIERS.has(qualLower) ||
    raw.startsWith("<") ||
    raw.toUpperCase() === "ND";

  const numericStr = raw.replace(/^[<>]/, "").replace(/,/g, "");
  const num = parseFloat(numericStr);
  if (Number.isNaN(num)) {
    return { value: null, belowDetection, qualifier, raw };
  }

  return { value: num, belowDetection, qualifier, raw };
}

export function buildExtractedLabData(
  partial: Omit<
    ExtractedLabDataBase,
    | "parameter_summary"
    | "outfall_summary"
    | "parameters_found"
    | "parameters_resolved"
    | "outfalls_found"
    | "outfalls_resolved"
    | "outfall_aliases_created"
    | "date_range"
    | "duplicate_rows"
  > & { records: LabImportRecord[]; duplicate_rows?: number },
): ExtractedLabDataBase {
  const records = partial.records;
  const parameterCounts = new Map<string, { total: number; belowDet: number }>();
  const outfallCounts = new Map<string, number>();
  const permitNumbers = new Set<string>();
  const states = new Set<string>();
  const sites = new Set<string>();
  const labNames = new Set<string>();
  const allDates: string[] = [];

  for (const r of records) {
    if (r.permit_number) permitNumbers.add(r.permit_number);
    if (r.site_state) states.add(r.site_state.toUpperCase());
    if (r.site_name) sites.add(r.site_name);
    if (r.lab_name) labNames.add(r.lab_name);
    if (r.sample_date) allDates.push(r.sample_date);

    const pc = parameterCounts.get(r.parameter_canonical) ?? { total: 0, belowDet: 0 };
    pc.total++;
    if (r.below_detection) pc.belowDet++;
    parameterCounts.set(r.parameter_canonical, pc);

    const ok = r.outfall_raw || "(empty)";
    outfallCounts.set(ok, (outfallCounts.get(ok) ?? 0) + 1);
  }

  allDates.sort();
  const parametersResolved = records.filter((r) => r.parameter_id).length;
  const outfallsResolved = records.filter((r) => r.outfall_db_id).length;

  const uniqueSamples = new Set(
    records.map((r) => `${r.permit_number}|${r.outfall_raw}|${r.sample_date}|${r.sample_time}`),
  ).size;

  const summary =
    partial.summary ||
    `${records.length} lab results from ${uniqueSamples} sampling events. ${parameterCounts.size} parameters, ${outfallCounts.size} outfalls.`;

  return {
    ...partial,
    duplicate_rows: partial.duplicate_rows ?? 0,
    permit_numbers: partial.permit_numbers.length ? partial.permit_numbers : [...permitNumbers],
    states: partial.states.length ? partial.states : [...states],
    sites: partial.sites.length ? partial.sites : [...sites],
    lab_names: partial.lab_names.length ? partial.lab_names : [...labNames],
    parameters_found: parameterCounts.size,
    parameters_resolved: parametersResolved,
    parameter_summary: [...parameterCounts.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, counts]) => ({
        canonical_name: name,
        parameter_id: null,
        sample_count: counts.total,
        below_detection_count: counts.belowDet,
      })),
    outfalls_found: outfallCounts.size,
    outfalls_resolved: outfallsResolved,
    outfall_aliases_created: 0,
    outfall_summary: [...outfallCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        raw_name: name,
        matched_id: null,
        outfall_db_id: null,
        match_method: null,
        sample_count: count,
      })),
    date_range: {
      earliest: allDates[0] ?? null,
      latest: allDates[allDates.length - 1] ?? null,
    },
    summary,
  };
}

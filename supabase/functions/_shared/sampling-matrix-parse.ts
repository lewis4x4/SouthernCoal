/**
 * Sampling Matrix parser (Q14 stub).
 * Synthetic column schema until client matrix lands — flexible header aliases.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface SamplingMatrixRow {
  row_number: number;
  permit_number: string | null;
  outfall_number: string | null;
  parameter_raw: string | null;
  frequency_code: string | null;
  frequency_description: string | null;
  sample_type: string;
  period_type: string;
  state_code: string | null;
  site_name: string | null;
  instructions: string | null;
  responsible_party: string | null;
  permit_id: string | null;
  outfall_id: string | null;
  parameter_id: string | null;
  parameter_canonical: string | null;
  resolution_status: "matched" | "partial" | "unmatched";
}

export interface SamplingMatrixExtracted {
  document_type: "sampling_matrix";
  file_format: "csv" | "xlsx" | "xls";
  draft_label: string;
  rows: SamplingMatrixRow[];
  summary: {
    total_rows: number;
    matched_rows: number;
    partial_rows: number;
    unmatched_rows: number;
    unique_permits: number;
    unique_outfalls: number;
    unique_parameters: number;
  };
  warnings: string[];
  validation_errors: Array<{ row: number; message: string }>;
  rows_truncated: boolean;
}

const HEADER_ALIASES: Record<string, keyof Omit<SamplingMatrixRow, "row_number" | "permit_id" | "outfall_id" | "parameter_id" | "parameter_canonical" | "resolution_status">> = {
  permit_number: "permit_number",
  permit: "permit_number",
  permit_no: "permit_number",
  permit_hash: "permit_number",
  npdes_permit: "permit_number",
  npdes: "permit_number",
  outfall_number: "outfall_number",
  outfall: "outfall_number",
  outfall_no: "outfall_number",
  outlet: "outfall_number",
  sample_location: "outfall_number",
  sample_location_name: "outfall_number",
  location: "outfall_number",
  parameter: "parameter_raw",
  parameter_name: "parameter_raw",
  analyte: "parameter_raw",
  parameter_raw: "parameter_raw",
  frequency: "frequency_code",
  frequency_code: "frequency_code",
  sampling_frequency: "frequency_code",
  frequency_description: "frequency_description",
  sample_type: "sample_type",
  type: "sample_type",
  period_type: "period_type",
  period: "period_type",
  state: "state_code",
  state_code: "state_code",
  site_state: "state_code",
  site: "site_name",
  site_name: "site_name",
  site_hash_name: "site_name",
  instructions: "instructions",
  notes: "instructions",
  comments: "instructions",
  responsible_party: "responsible_party",
  sampler: "responsible_party",
  collector: "responsible_party",
};

const VALID_SAMPLE_TYPES = new Set([
  "grab",
  "composite_24hr",
  "composite_flow",
  "calculated",
  "continuous",
  "estimation",
]);

const VALID_PERIOD_TYPES = new Set(["day", "week", "month", "quarter", "year", "per_term"]);

const MAX_ROWS_STORED = 5_000;

export function normalizeMatrixHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeCell(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function normalizeFrequencyCode(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const map: Record<string, string> = {
    monthly: "1/month",
    "1 per month": "1/month",
    "once per month": "1/month",
    "1/month": "1/month",
    "semi-monthly": "2/month",
    "semi monthly": "2/month",
    "twice monthly": "2/month",
    "2 per month": "2/month",
    "2/month": "2/month",
    quarterly: "1/quarter",
    "1 per quarter": "1/quarter",
    "1/quarter": "1/quarter",
    annual: "1/year",
    yearly: "1/year",
    "1 per year": "1/year",
    "1/year": "1/year",
    "rain event": "rain_event",
    rain_event: "rain_event",
  };
  return map[key] ?? raw.trim();
}

export function normalizeSampleType(raw: string | null): string {
  if (!raw) return "grab";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (VALID_SAMPLE_TYPES.has(key)) return key;
  if (key.includes("composite") && key.includes("24")) return "composite_24hr";
  if (key.includes("composite")) return "composite_flow";
  if (key.includes("grab")) return "grab";
  return "grab";
}

export function inferPeriodType(frequencyCode: string | null, rawPeriod: string | null): string {
  if (rawPeriod) {
    const key = rawPeriod.trim().toLowerCase();
    if (VALID_PERIOD_TYPES.has(key)) return key;
  }
  if (!frequencyCode) return "month";
  if (frequencyCode.includes("quarter")) return "quarter";
  if (frequencyCode.includes("year")) return "year";
  if (frequencyCode.includes("week")) return "week";
  if (frequencyCode.includes("day")) return "day";
  return "month";
}

function mapHeaderToField(header: string): keyof SamplingMatrixRow | null {
  const normalized = normalizeMatrixHeader(header);
  const field = HEADER_ALIASES[normalized];
  return field ?? null;
}

export function rowsToMatrixObjects(rows: string[][]): Record<string, unknown>[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];

  const fieldByIndex: Array<keyof SamplingMatrixRow | null> = headerRow.map((cell) =>
    mapHeaderToField(cell)
  );

  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0))
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      fieldByIndex.forEach((field, index) => {
        if (!field) return;
        mapped[field] = row[index] ?? "";
      });
      return mapped;
    });
}

export function parseMatrixObjects(
  objects: Record<string, unknown>[],
  fileFormat: SamplingMatrixExtracted["file_format"],
): SamplingMatrixExtracted {
  const warnings: string[] = [];
  const validation_errors: SamplingMatrixExtracted["validation_errors"] = [];
  const parsedRows: SamplingMatrixRow[] = [];

  if (objects.length === 0) {
    validation_errors.push({ row: 0, message: "No data rows found after header row." });
  }

  objects.forEach((obj, index) => {
    const rowNumber = index + 2;
    const permit_number = normalizeCell(obj.permit_number);
    const outfall_number = normalizeCell(obj.outfall_number);
    const parameter_raw = normalizeCell(obj.parameter_raw);
    const frequencyRaw = normalizeCell(obj.frequency_code);
    const frequency_code = normalizeFrequencyCode(frequencyRaw);
    const sample_type = normalizeSampleType(normalizeCell(obj.sample_type));
    const period_type = inferPeriodType(frequency_code, normalizeCell(obj.period_type));
    const stateRaw = normalizeCell(obj.state_code);
    const state_code = stateRaw ? stateRaw.toUpperCase().slice(0, 2) : null;

    if (!permit_number && !outfall_number && !parameter_raw) {
      validation_errors.push({ row: rowNumber, message: "Row missing permit, outfall, and parameter." });
      return;
    }

    if (!permit_number || !outfall_number || !parameter_raw || !frequency_code) {
      validation_errors.push({
        row: rowNumber,
        message: "Row missing required permit, outfall, parameter, or frequency.",
      });
    }

    parsedRows.push({
      row_number: rowNumber,
      permit_number,
      outfall_number,
      parameter_raw,
      frequency_code,
      frequency_description: normalizeCell(obj.frequency_description) ?? frequencyRaw,
      sample_type,
      period_type,
      state_code,
      site_name: normalizeCell(obj.site_name),
      instructions: normalizeCell(obj.instructions),
      responsible_party: normalizeCell(obj.responsible_party),
      permit_id: null,
      outfall_id: null,
      parameter_id: null,
      parameter_canonical: null,
      resolution_status: "unmatched",
    });
  });

  const rows_truncated = parsedRows.length > MAX_ROWS_STORED;
  const storedRows = rows_truncated ? parsedRows.slice(0, MAX_ROWS_STORED) : parsedRows;
  if (rows_truncated) {
    warnings.push(`Rows truncated to ${MAX_ROWS_STORED} in extracted preview.`);
  }

  return {
    document_type: "sampling_matrix",
    file_format: fileFormat,
    draft_label: "DRAFT — parser uses synthetic Q14 column map until client matrix format is confirmed",
    rows: storedRows,
    summary: {
      total_rows: parsedRows.length,
      matched_rows: 0,
      partial_rows: 0,
      unmatched_rows: parsedRows.length,
      unique_permits: new Set(parsedRows.map((r) => r.permit_number).filter(Boolean)).size,
      unique_outfalls: new Set(parsedRows.map((r) => r.outfall_number).filter(Boolean)).size,
      unique_parameters: new Set(parsedRows.map((r) => r.parameter_raw).filter(Boolean)).size,
    },
    warnings,
    validation_errors,
    rows_truncated,
  };
}

export async function resolveSamplingMatrixRows(
  supabase: SupabaseClient,
  organizationId: string,
  extracted: SamplingMatrixExtracted,
): Promise<SamplingMatrixExtracted> {
  const [{ data: permits }, { data: outfalls }, { data: parameters }, { data: aliases }] =
    await Promise.all([
      supabase
        .from("npdes_permits")
        .select("id, permit_number")
        .eq("organization_id", organizationId),
      supabase
        .from("outfalls")
        .select("id, outfall_number, permit_id")
        .eq("organization_id", organizationId),
      supabase.from("parameters").select("id, name, storet_code"),
      supabase
        .from("parameter_aliases")
        .select("alias, parameter_id, parameters(name, storet_code)"),
    ]);

  const permitByNumber = new Map<string, string>();
  for (const permit of permits ?? []) {
    if (permit.permit_number) {
      permitByNumber.set(String(permit.permit_number).trim().toUpperCase(), permit.id);
    }
  }

  const outfallByKey = new Map<string, string>();
  for (const outfall of outfalls ?? []) {
    const key = `${outfall.permit_id}::${String(outfall.outfall_number).trim().toUpperCase()}`;
    outfallByKey.set(key, outfall.id);
  }

  const parameterByKey = new Map<string, { id: string; canonical: string }>();
  for (const param of parameters ?? []) {
    const canonical = String(param.name ?? param.storet_code ?? "Unknown");
    parameterByKey.set(String(param.name).trim().toLowerCase(), { id: param.id, canonical });
    if (param.storet_code) {
      parameterByKey.set(String(param.storet_code).trim().toLowerCase(), { id: param.id, canonical });
    }
  }
  for (const alias of aliases ?? []) {
    const param = alias.parameters;
    if (!alias.alias || !alias.parameter_id) continue;
    parameterByKey.set(String(alias.alias).trim().toLowerCase(), {
      id: alias.parameter_id,
      canonical: String(param?.name ?? param?.storet_code ?? alias.alias),
    });
  }

  let matched = 0;
  let partial = 0;
  let unmatched = 0;

  const rows = extracted.rows.map((row) => {
    const permitId = row.permit_number
      ? permitByNumber.get(row.permit_number.trim().toUpperCase()) ?? null
      : null;
    const outfallId = permitId && row.outfall_number
      ? outfallByKey.get(`${permitId}::${row.outfall_number.trim().toUpperCase()}`) ?? null
      : null;
    const paramLookup = row.parameter_raw
      ? parameterByKey.get(row.parameter_raw.trim().toLowerCase()) ?? null
      : null;

    let resolution_status: SamplingMatrixRow["resolution_status"] = "unmatched";
    if (permitId && outfallId && paramLookup) {
      resolution_status = "matched";
      matched += 1;
    } else if (permitId || outfallId || paramLookup) {
      resolution_status = "partial";
      partial += 1;
    } else {
      unmatched += 1;
    }

    return {
      ...row,
      permit_id: permitId,
      outfall_id: outfallId,
      parameter_id: paramLookup?.id ?? null,
      parameter_canonical: paramLookup?.canonical ?? null,
      resolution_status,
    };
  });

  const warnings = [...extracted.warnings];
  if (matched === 0) {
    warnings.push(
      "No rows fully matched permits, outfalls, and parameters — import will skip until Upload Dashboard populates domain tables.",
    );
  }

  return {
    ...extracted,
    rows,
    summary: {
      ...extracted.summary,
      matched_rows: matched,
      partial_rows: partial,
      unmatched_rows: unmatched,
    },
    warnings,
  };
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_ROWS = 50_000;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_RECORDS_IN_EXTRACTED = 5_000; // Cap records stored in extracted_data JSONB
const VALID_STATES = ["AL", "KY", "TN", "VA", "WV"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ParsedValue {
  value: number | null;
  belowDetection: boolean;
  qualifier: string | null;
  raw: string;
}

interface ParsedRecord {
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
  latitude: number | null;
  longitude: number | null;
  stream_name: string;
  sample_date: string | null;
  sample_time: string | null;
  analysis_date: string | null;
  parameter_raw: string;
  parameter_canonical: string;
  value: number | null;
  value_raw: string;
  unit: string;
  below_detection: boolean;
  data_qualifier: string | null;
  comments: string | null;
  hold_time_days: number | null;
  hold_time_compliant: boolean | null;
}

interface ExtractedLabData {
  document_type: "lab_data_edd";
  file_format: "xlsx" | "xls" | "csv";
  column_count: number;
  total_rows: number;
  parsed_rows: number;
  skipped_rows: number;
  permit_numbers: string[];
  states: string[];
  sites: string[];
  date_range: { earliest: string | null; latest: string | null };
  lab_names: string[];
  parameters_found: number;
  parameter_summary: Array<{
    canonical_name: string;
    sample_count: number;
    below_detection_count: number;
  }>;
  outfalls_found: number;
  outfall_summary: Array<{
    raw_name: string;
    matched_id: string | null;
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
  records: ParsedRecord[];
  records_truncated: boolean;
  summary: string;
}

// ---------------------------------------------------------------------------
// Parameter normalization — 47 lab variants → 21 canonical names
// ---------------------------------------------------------------------------
const PARAMETER_MAP: Record<string, string> = {
  // Iron
  "fe_tot": "Iron",
  "iron": "Iron",
  "iron (total)": "Iron",
  "iron, total": "Iron",
  "iron, total rec": "Iron",
  "iron total": "Iron",
  "iron, total recoverable": "Iron",

  // Manganese
  "mn_tot": "Manganese",
  "manganese": "Manganese",
  "manganese (total)": "Manganese",
  "manganese, total": "Manganese",
  "manganese, tot rec": "Manganese",
  "manganese, total rec": "Manganese",
  "manganese, total recoverable": "Manganese",

  // pH
  "ph": "pH",
  "ph_fld": "pH",
  "ph, field": "pH",
  "ph field": "pH",

  // TSS
  "tss": "Total Suspended Solids",
  "total suspended solids": "Total Suspended Solids",
  "suspended solids, total": "Total Suspended Solids",

  // Selenium
  "se_tot": "Selenium",
  "selenium": "Selenium",
  "selenium (total)": "Selenium",
  "selenium, total": "Selenium",
  "selenium, total recoverable": "Selenium",

  // Conductivity / Specific Conductance
  "cond_lab": "Specific Conductance",
  "conductivity": "Specific Conductance",
  "specific conductance": "Specific Conductance",
  "spec_cond": "Specific Conductance",

  // Sulfate
  "so4_tot": "Sulfate",
  "so4": "Sulfate",
  "sulfate": "Sulfate",
  "sulfate (total)": "Sulfate",
  "sulfate, total": "Sulfate",

  // Settleable Solids
  "setlsoltot": "Settleable Solids",
  "settleable solids": "Settleable Solids",
  "total settlable solids": "Settleable Solids",
  "total settleable solids": "Settleable Solids",

  // Aluminum (Total)
  "al_tot": "Aluminum",
  "aluminum": "Aluminum",
  "aluminum (total)": "Aluminum",
  "aluminum, total": "Aluminum",
  "aluminum, tot rec": "Aluminum",
  "aluminum, total recoverable": "Aluminum",

  // Aluminum (Dissolved)
  "aluminum (dissolved)": "Aluminum (Dissolved)",
  "aluminum, dissolved": "Aluminum (Dissolved)",

  // TDS
  "tds": "Total Dissolved Solids",
  "total dissolved solids": "Total Dissolved Solids",
  "solids, total dissolved": "Total Dissolved Solids",

  // Temperature
  "temp": "Temperature",
  "temperature": "Temperature",
  "temperature, water": "Temperature",

  // Flow
  "flow": "Flow",
  "flow_rate": "Flow",
  "flow rate": "Flow",

  // Mercury
  "mercury": "Mercury",
  "mercury, total (as hg)": "Mercury",
  "mercury (total)": "Mercury",

  // Calcium
  "calcium": "Calcium",
  "calcium (total)": "Calcium",
  "calcium, total": "Calcium",

  // Magnesium
  "magnesium": "Magnesium",
  "magnesium (total)": "Magnesium",
  "magnesium, total": "Magnesium",

  // Sodium
  "sodium": "Sodium",
  "sodium (total)": "Sodium",
  "sodium, total": "Sodium",

  // Potassium
  "potassium": "Potassium",
  "potassium (total)": "Potassium",
  "potassium, total": "Potassium",

  // Chloride
  "cl": "Chloride",
  "chloride": "Chloride",
  "chloride, total": "Chloride",

  // Dissolved Oxygen
  "do": "Dissolved Oxygen",
  "do_fld": "Dissolved Oxygen",
  "dissolved oxygen": "Dissolved Oxygen",

  // Turbidity
  "turb": "Turbidity",
  "turbidity": "Turbidity",

  // Oil & Grease
  "o&g": "Oil & Grease",
  "oil & grease": "Oil & Grease",
  "oil and grease": "Oil & Grease",

  // Alkalinity
  "alkalinity": "Alkalinity",
  "alkalinity, total": "Alkalinity",

  // Hardness
  "hardness": "Hardness",
  "hardness, total": "Hardness",

  // Acidity
  "acidity": "Acidity",
  "acidity, total": "Acidity",

  // BOD
  "bod": "BOD",
  "bod5": "BOD",
  "biochemical oxygen demand": "BOD",

  // Ammonia
  "nh3": "Ammonia",
  "ammonia": "Ammonia",
  "ammonia nitrogen": "Ammonia",

  // Osmotic Pressure
  "osmotic pressure": "Osmotic Pressure",
};

// Values to skip entirely — not real parameters
const IGNORED_PARAMETERS = new Set(["txt", "", "n/a", "na", "none"]);

// ---------------------------------------------------------------------------
// Hold time reference (days) — per 40 CFR Part 136
// ---------------------------------------------------------------------------
const HOLD_TIMES: Record<string, number> = {
  "pH": 0, // field measurement
  "Temperature": 0,
  "Dissolved Oxygen": 0,
  "Flow": 0,
  "Turbidity": 2,
  "BOD": 2,
  "Total Suspended Solids": 7,
  "Total Dissolved Solids": 7,
  "Settleable Solids": 2,
  "Alkalinity": 14,
  "Acidity": 14,
  "Specific Conductance": 28,
  "Sulfate": 28,
  "Chloride": 28,
  "Oil & Grease": 28,
  "Ammonia": 28,
  "Iron": 180,
  "Manganese": 180,
  "Aluminum": 180,
  "Aluminum (Dissolved)": 180,
  "Selenium": 180,
  "Mercury": 28,
  "Calcium": 180,
  "Magnesium": 180,
  "Sodium": 180,
  "Potassium": 180,
  "Hardness": 180,
  "Osmotic Pressure": 28,
};

// ---------------------------------------------------------------------------
// Expected EDD headers (26 columns, lowercase + trimmed)
// ---------------------------------------------------------------------------
const EXPECTED_HEADERS = [
  "permittee name",
  "permittee address", // some files spell "permitee"
  "permittee city",    // some files spell "permitee"
  "permittee state",   // some files spell "permitee"
  "permit#",           // variant: "permit #" (with space)
  "permit type",
  "smcra #",
  "site #/name",
  "site city",
  "site state",
  "site county",
  "company sampling/analyzing",
  "responsible party",
  "sample location name",
  "sample location latitude",
  "sample location longitude",
  "named stream",
  "sample location type",
  "sample date fld",
  "sample time fld",
  "date analyzed",
  "parameter",
  "value",
  "units",
  "data qualifier",
  "comments",
];

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Normalize a header string for comparison. */
function normalizeHeader(h: string): string {
  return (h ?? "").toString().trim().toLowerCase()
    // "permitee" → "permittee" (common typo)
    .replace(/permitee/g, "permittee")
    // "permit #" → "permit#" (variant)
    .replace(/permit\s+#/, "permit#");
}

/** Validate the header row. Returns { columnCount, warnings }. */
function validateHeaders(headerRow: unknown[]): { columnCount: number; warnings: string[] } {
  const warnings: string[] = [];

  if (!headerRow || headerRow.length < 20) {
    throw new Error(
      `Header mismatch: expected ~26 columns, found ${headerRow?.length ?? 0}. ` +
        "This file does not match the expected EDD format.",
    );
  }

  const normalized = headerRow.map((h) => normalizeHeader(String(h ?? "")));

  // Check for key EDD columns that MUST exist (by content, not position)
  const allHeaders = normalized.join(" ");
  const hasPermitCol = allHeaders.includes("permit");
  const hasParameterCol = normalized.includes("parameter");
  const hasValueCol = normalized.includes("value");

  if (!hasPermitCol || !hasParameterCol || !hasValueCol) {
    throw new Error(
      "This file does not appear to be an EDD format. " +
        `Missing key columns: ${[
          !hasPermitCol && '"Permit#"',
          !hasParameterCol && '"Parameter"',
          !hasValueCol && '"Value"',
        ].filter(Boolean).join(", ")}. ` +
        `Found headers: ${normalized.slice(0, 10).join(", ")}...`,
    );
  }

  // Check positional matches (informational — mismatches logged as warnings)
  const checkCount = Math.min(26, normalized.length);
  const mismatches: string[] = [];
  for (let i = 0; i < checkCount; i++) {
    if (i < EXPECTED_HEADERS.length && normalized[i] !== EXPECTED_HEADERS[i]) {
      mismatches.push(
        `Column ${i + 1}: expected "${EXPECTED_HEADERS[i]}", got "${normalized[i]}"`,
      );
    }
  }

  if (mismatches.length > 0) {
    console.log(`[parse-lab-data-edd] ${mismatches.length} header variations:`, mismatches);
    if (mismatches.length > 6) {
      warnings.push(
        `${mismatches.length} column headers differ from standard EDD format. Data may be mapped incorrectly.`,
      );
    }
  }

  // 27-column variant: column 27 is empty or "column1"
  const is27Col = headerRow.length >= 27 &&
    (!normalized[26] || normalized[26] === "column1");

  return { columnCount: is27Col ? 27 : Math.min(headerRow.length, 26), warnings };
}

/** Parse a date string (MM/DD/YYYY or M/D/YYYY) to YYYY-MM-DD. */
function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Handle Excel serial dates (number) — only in date columns, not lab values.
  // SheetJS with raw:false should convert these to strings, but just in case.
  const num = Number(s);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    // Excel epoch: 1899-12-30 (use UTC to avoid timezone off-by-one)
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + num * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // MM/DD/YYYY or M/D/YYYY or MM-DD-YYYY
  const match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, mm, dd, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Already ISO? YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  return null;
}

/** Parse a time string (HH:MM or HHMM or H:MM) to HH:MM. */
function parseTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // HH:MM
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})/);
  if (colonMatch) {
    return `${colonMatch[1].padStart(2, "0")}:${colonMatch[2]}`;
  }

  // HHMM (4 digits, no colon)
  const noColonMatch = s.match(/^(\d{2})(\d{2})$/);
  if (noColonMatch) {
    return `${noColonMatch[1]}:${noColonMatch[2]}`;
  }

  return null;
}

/** Normalize a parameter name using the alias map. */
function normalizeParameter(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (IGNORED_PARAMETERS.has(lower)) return "";

  const canonical = PARAMETER_MAP[lower];
  return canonical ?? trimmed; // Pass through unknown parameters as-is
}

/** Parse a lab value + qualifier into structured form. */
function parseValue(
  valueStr: string | null | undefined,
  qualifierStr: string | null | undefined,
): ParsedValue {
  const rawValue = String(valueStr ?? "").trim();
  const rawQualifier = String(qualifierStr ?? "").trim();

  if (!rawValue || rawValue.toLowerCase() === "ns" || rawValue.toLowerCase() === "nr") {
    return { value: null, belowDetection: false, qualifier: rawQualifier || null, raw: rawValue };
  }

  // Case 1: < prefix in value string (e.g., "<0.5" or "< 0.1")
  const ltMatch = rawValue.match(/^<\s*([0-9.]+)$/);
  if (ltMatch) {
    return {
      value: parseFloat(ltMatch[1]),
      belowDetection: true,
      qualifier: "<",
      raw: rawValue,
    };
  }

  // Case 2: > prefix in value string
  const gtMatch = rawValue.match(/^>\s*([0-9.]+)$/);
  if (gtMatch) {
    return {
      value: parseFloat(gtMatch[1]),
      belowDetection: false,
      qualifier: ">",
      raw: rawValue,
    };
  }

  // Case 3: Qualifier in separate column
  const numValue = parseFloat(rawValue);
  if (isNaN(numValue)) {
    return { value: null, belowDetection: false, qualifier: rawQualifier || null, raw: rawValue };
  }

  const isBelowDetection = rawQualifier === "<";

  return {
    value: numValue,
    belowDetection: isBelowDetection,
    qualifier: rawQualifier || null,
    raw: rawValue,
  };
}

/** Calculate hold time compliance. */
function checkHoldTime(
  sampleDateStr: string | null,
  analysisDateStr: string | null,
  canonicalParameter: string,
): { days: number | null; compliant: boolean | null } {
  if (!sampleDateStr || !analysisDateStr) return { days: null, compliant: null };

  const sampleDate = new Date(sampleDateStr);
  const analysisDate = new Date(analysisDateStr);

  if (isNaN(sampleDate.getTime()) || isNaN(analysisDate.getTime())) {
    return { days: null, compliant: null };
  }

  const daysElapsed = (analysisDate.getTime() - sampleDate.getTime()) / (1000 * 60 * 60 * 24);
  const maxDays = HOLD_TIMES[canonicalParameter];

  if (maxDays === undefined) {
    return { days: Math.round(daysElapsed * 10) / 10, compliant: null };
  }

  return {
    days: Math.round(daysElapsed * 10) / 10,
    compliant: daysElapsed <= maxDays,
  };
}

/** Normalize an outfall ID for fuzzy comparison. */
function normalizeOutfallId(raw: string): string {
  // Strip whitespace, uppercase
  let s = raw.trim().toUpperCase();
  // Remove trailing ".0" (decimal notation: "1.0" → "1")
  s = s.replace(/\.0$/, "");
  return s;
}

/** Fuzzy match an outfall ID against known outfalls. */
function fuzzyMatchOutfall(
  raw: string,
  knownOutfalls: Array<{ id: string; outfall_id: string }>,
): string | null {
  if (!raw || knownOutfalls.length === 0) return null;

  const normalized = normalizeOutfallId(raw);

  // Step 1: Exact match (case-insensitive)
  for (const o of knownOutfalls) {
    if (o.outfall_id.toUpperCase() === normalized) return o.outfall_id;
  }

  // Step 2: Match after stripping leading zeros (e.g., "001" ↔ "1")
  const numericPart = normalized.replace(/^0+/, "") || "0";
  for (const o of knownOutfalls) {
    const oNorm = o.outfall_id.toUpperCase().replace(/^0+/, "") || "0";
    if (oNorm === numericPart) return o.outfall_id;
  }

  // Step 3: Extract digits only (e.g., "DO16" → "16", compare with "016")
  const digitsOnly = normalized.replace(/[^0-9]/g, "");
  if (digitsOnly) {
    for (const o of knownOutfalls) {
      const oDigits = o.outfall_id.replace(/[^0-9]/g, "");
      if (oDigits === digitsOnly) return o.outfall_id;
    }
    // Try without leading zeros
    const digitsNoZeros = digitsOnly.replace(/^0+/, "") || "0";
    for (const o of knownOutfalls) {
      const oDigitsNoZeros = o.outfall_id.replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";
      if (oDigitsNoZeros === digitsNoZeros) return o.outfall_id;
    }
  }

  return null;
}

/** Detect file format from extension or MIME type. */
function detectFormat(
  fileName: string,
  mimeType?: string | null,
): "xlsx" | "xls" | "csv" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) return "csv";

  // Fallback to MIME type
  if (mimeType?.includes("spreadsheetml")) return "xlsx";
  if (mimeType?.includes("ms-excel")) return "xls";
  if (mimeType?.includes("csv") || mimeType?.includes("text")) return "csv";

  return "xlsx"; // default assumption
}

// ---------------------------------------------------------------------------
// Auth verification (same as parse-permit-pdf)
// ---------------------------------------------------------------------------

async function verifyAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

// ---------------------------------------------------------------------------
// Queue status updaters
// ---------------------------------------------------------------------------

async function markProcessing(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("file_processing_queue")
    .update({
      status: "processing",
      processing_started_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (error) {
    console.error("[parse-lab-data-edd] Failed to mark processing:", error.message);
  }
}

async function markParsed(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  extractedData: ExtractedLabData,
  recordCount: number,
  currentStateCode: string | null,
  warnings: string[],
): Promise<void> {
  const now = new Date().toISOString();

  // Auto-fill state_code if all records share one state
  const states = extractedData.states;
  const singleState = states.length === 1 ? states[0].toUpperCase() : null;
  const shouldFillState = !currentStateCode && singleState && VALID_STATES.includes(singleState);

  const updateData: Record<string, unknown> = {
    status: "parsed",
    extracted_data: extractedData,
    records_extracted: recordCount,
    processing_completed_at: now,
    updated_at: now,
  };

  if (warnings.length > 0) {
    updateData.error_log = warnings;
  }

  if (shouldFillState) {
    updateData.state_code = singleState;
    console.log("[parse-lab-data-edd] Auto-filled state_code:", singleState);
  }

  const { error } = await supabase
    .from("file_processing_queue")
    .update(updateData)
    .eq("id", queueId);

  if (error) {
    console.error("[parse-lab-data-edd] Failed to mark parsed:", error.message);
  }
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  errors: string[],
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("file_processing_queue")
    .update({
      status: "failed",
      error_log: errors,
      processing_completed_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (error) {
    console.error("[parse-lab-data-edd] Failed to mark failed:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Error classifier
// ---------------------------------------------------------------------------

function classifyError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const raw = message.length > 800 ? message.slice(0, 800) + "..." : message;

  if (lower.includes("header") && (lower.includes("mismatch") || lower.includes("expected"))) {
    return [
      "File does not match the expected 26-column EDD format. Check that this is a standard lab data Electronic Data Deliverable.",
      raw,
    ];
  }

  if (lower.includes("no data rows") || lower.includes("no rows")) {
    return ["File contains no data rows. Only headers were found.", raw];
  }

  if (lower.includes("no worksheet") || lower.includes("no sheet")) {
    return ["Could not find a valid worksheet in this Excel file.", raw];
  }

  if (lower.includes("row limit") || lower.includes("too many rows") || lower.includes("50,000") || lower.includes("50000")) {
    return ["Lab data file exceeds the 50,000 row limit. Please split into smaller files.", raw];
  }

  if (lower.includes("unsupported format") || lower.includes("not supported")) {
    return ["File format not supported. Expected .xlsx, .xls, or .csv.", raw];
  }

  if (lower.includes("password") || lower.includes("encrypted")) {
    return ["File is password protected. Please upload an unlocked version.", raw];
  }

  if (lower.includes("corrupt") || lower.includes("malformed") || lower.includes("invalid")) {
    return ["File could not be read. It may be corrupted or in an unsupported format.", raw];
  }

  if (lower.includes("worker") || lower.includes("compute") || lower.includes("resource") || lower.includes("memory")) {
    return ["Edge Function ran out of compute resources. The file may be too large.", raw];
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
    return ["Processing timed out. The file may be too large.", raw];
  }

  return [raw];
}

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  console.log("[parse-lab-data-edd] Invoked at", new Date().toISOString());

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Verify JWT
  const userId = await verifyAuth(req, supabase);
  if (!userId) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  // 2. Parse request body
  let queueId: string;
  try {
    const body = await req.json();
    queueId = body.queue_id;
    if (!queueId || typeof queueId !== "string") {
      throw new Error("queue_id is required");
    }
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid request: queue_id (string) required" },
      400,
    );
  }

  console.log("[parse-lab-data-edd] Processing queue_id:", queueId, "by user:", userId);

  // 3. Fetch queue entry
  const { data: queueEntry, error: fetchError } = await supabase
    .from("file_processing_queue")
    .select(
      "id, storage_bucket, storage_path, file_name, file_size_bytes, file_category, state_code, status, uploaded_by",
    )
    .eq("id", queueId)
    .single();

  if (fetchError || !queueEntry) {
    return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
  }

  // 4. Guard: only process queued or failed entries
  if (queueEntry.status !== "queued" && queueEntry.status !== "failed") {
    return jsonResponse(
      {
        success: false,
        error: `Cannot process entry with status '${queueEntry.status}'. Expected 'queued' or 'failed'.`,
      },
      409,
    );
  }

  // 5. Guard: only process lab_data category
  if (queueEntry.file_category !== "lab_data") {
    return jsonResponse(
      {
        success: false,
        error: `parse-lab-data-edd only processes lab_data files, not '${queueEntry.file_category}'`,
      },
      400,
    );
  }

  // 6. Guard: file size
  const fileSize = queueEntry.file_size_bytes ?? 0;
  if (fileSize > MAX_FILE_SIZE) {
    return jsonResponse(
      {
        success: false,
        error: `File is too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      },
      400,
    );
  }

  // 7. Mark as processing (triggers Realtime → frontend shows amber pulse)
  await markProcessing(supabase, queueId);

  try {
    // 8. Download file from Storage
    console.log(
      "[parse-lab-data-edd] Downloading",
      queueEntry.file_name,
      `(${(fileSize / 1024 / 1024).toFixed(1)}MB)`,
    );
    const { data: fileData, error: dlError } = await supabase.storage
      .from(queueEntry.storage_bucket)
      .download(queueEntry.storage_path);

    if (dlError || !fileData) {
      throw new Error(`Failed to download file: ${dlError?.message ?? "no data returned"}`);
    }

    // 9. Parse with SheetJS
    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    const fileFormat = detectFormat(queueEntry.file_name);

    console.log("[parse-lab-data-edd] Parsing as", fileFormat);

    const workbook = XLSX.read(fileBytes, { type: "array" });

    if (!workbook.SheetNames.length) {
      throw new Error("No worksheet found in this file.");
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // Get all rows as string arrays (no auto-typing — we parse manually)
    const allRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    if (allRows.length < 2) {
      throw new Error("No data rows found. File contains only headers or is empty.");
    }

    // 10. Validate headers
    const headerRow = allRows[0];
    const { columnCount, warnings: headerWarnings } = validateHeaders(headerRow);

    // Data rows (skip header)
    let dataRows = allRows.slice(1);

    // Skip type descriptor rows (e.g., row of "txt", "num", "date", "int", etc.)
    const TYPE_DESCRIPTORS = new Set(["txt", "num", "int", "date", "varchar", "float", "double", "text", "number", "string"]);
    while (dataRows.length > 0) {
      const firstRow = dataRows[0];
      const nonEmpty = firstRow.filter((c) => c && c.trim());
      const allDescriptors = nonEmpty.length > 0 && nonEmpty.every((c) => TYPE_DESCRIPTORS.has(c.trim().toLowerCase()));
      if (allDescriptors) {
        console.log("[parse-lab-data-edd] Skipping type descriptor row:", firstRow.slice(0, 5).join(", "));
        dataRows = dataRows.slice(1);
      } else {
        break;
      }
    }

    const totalRows = dataRows.length;

    if (totalRows > MAX_ROWS) {
      throw new Error(
        `File has ${totalRows.toLocaleString()} rows, which exceeds the ${MAX_ROWS.toLocaleString()} row limit. ` +
          "Please split into smaller files.",
      );
    }

    console.log("[parse-lab-data-edd] Found", totalRows, "data rows with", columnCount, "columns");

    // 11. Query outfalls for fuzzy matching (best-effort)
    //     First, find unique permit numbers in the data to scope the outfall query
    const permitNumbersInFile = new Set<string>();
    for (const row of dataRows) {
      const pn = (row[4] ?? "").trim();
      if (pn) permitNumbersInFile.add(pn);
    }

    let knownOutfalls: Array<{ id: string; outfall_id: string; permit_id: string }> = [];
    const permitNumberArr = [...permitNumbersInFile];

    if (permitNumberArr.length > 0) {
      // Look up permits
      const { data: permits } = await supabase
        .from("npdes_permits")
        .select("id, permit_number")
        .in("permit_number", permitNumberArr);

      if (permits && permits.length > 0) {
        const permitIds = permits.map((p: { id: string }) => p.id);
        const { data: outfalls } = await supabase
          .from("outfalls")
          .select("id, outfall_id, permit_id")
          .in("permit_id", permitIds);

        if (outfalls) {
          knownOutfalls = outfalls;
        }
      }
    }

    const hasOutfallData = knownOutfalls.length > 0;
    console.log(
      "[parse-lab-data-edd] Outfall matching:",
      hasOutfallData
        ? `${knownOutfalls.length} outfalls loaded for ${permitNumberArr.length} permits`
        : "No permits found in database — outfall matching skipped",
    );

    // 12. Process each row
    const records: ParsedRecord[] = [];
    const warnings: string[] = [...headerWarnings];
    const validationErrors: Array<{ row: number; column: string; message: string }> = [];
    const holdTimeViolations: ExtractedLabData["hold_time_violations"] = [];

    // Tracking sets for summary
    const permitNumbers = new Set<string>();
    const states = new Set<string>();
    const sites = new Set<string>();
    const labNames = new Set<string>();
    const parameterCounts = new Map<string, { total: number; belowDet: number }>();
    const outfallCounts = new Map<string, { matched: string | null; count: number }>();
    let skippedRows = 0;
    const allDates: string[] = [];
    const unknownParameters = new Set<string>();

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // 1-indexed, +1 for header row

      // Skip blank rows
      const hasContent = row.some((cell) => cell && cell.trim());
      if (!hasContent) {
        skippedRows++;
        continue;
      }

      // Extract columns (0-indexed)
      const permitteName = (row[0] ?? "").trim();
      const permitNumber = (row[4] ?? "").trim();
      const siteName = (row[7] ?? "").trim();
      const siteState = (row[9] ?? "").trim();
      const siteCounty = (row[10] ?? "").trim();
      const labName = (row[11] ?? "").trim();
      const sampler = (row[12] ?? "").trim();
      const outfallRaw = (row[13] ?? "").trim();
      const latStr = (row[14] ?? "").trim();
      const lonStr = (row[15] ?? "").trim();
      const streamName = (row[16] ?? "").trim();
      const sampleDateRaw = (row[18] ?? "").trim();
      const sampleTimeRaw = (row[19] ?? "").trim();
      const analysisDateRaw = (row[20] ?? "").trim();
      const parameterRaw = (row[21] ?? "").trim();
      const valueRaw = (row[22] ?? "").trim();
      const unitRaw = (row[23] ?? "").trim();
      const qualifierRaw = (row[24] ?? "").trim();
      const commentsRaw = (row[25] ?? "").trim();

      // Skip ignored parameters (e.g., "txt")
      const paramCanonical = normalizeParameter(parameterRaw);
      if (paramCanonical === "" || IGNORED_PARAMETERS.has(parameterRaw.toLowerCase())) {
        skippedRows++;
        continue;
      }

      // Track if parameter is unknown (not in our map)
      if (!PARAMETER_MAP[parameterRaw.toLowerCase().trim()]) {
        unknownParameters.add(parameterRaw);
      }

      // Parse dates
      const sampleDate = parseDate(sampleDateRaw);
      const analysisDate = parseDate(analysisDateRaw);
      const sampleTime = parseTime(sampleTimeRaw);

      // Validate required fields
      if (!permitNumber) {
        validationErrors.push({ row: rowNum, column: "Permit#", message: "Missing permit number" });
      }
      if (!sampleDate && sampleDateRaw) {
        validationErrors.push({ row: rowNum, column: "Sample Date FLD", message: `Invalid date: "${sampleDateRaw}"` });
      }
      if (!parameterRaw) {
        validationErrors.push({ row: rowNum, column: "Parameter", message: "Missing parameter" });
        skippedRows++;
        continue;
      }

      // Parse value
      const parsed = parseValue(valueRaw, qualifierRaw);

      // Parse coordinates
      const latitude = latStr ? parseFloat(latStr) : null;
      const longitude = lonStr ? parseFloat(lonStr) : null;

      // Outfall fuzzy matching
      let outfallMatched: string | null = null;
      if (outfallRaw && hasOutfallData) {
        outfallMatched = fuzzyMatchOutfall(outfallRaw, knownOutfalls);
      }

      // Hold time check
      const holdTime = checkHoldTime(sampleDate, analysisDate, paramCanonical);
      if (holdTime.compliant === false) {
        holdTimeViolations.push({
          row: rowNum,
          parameter: paramCanonical,
          outfall: outfallRaw,
          sample_date: sampleDate!,
          analysis_date: analysisDate!,
          days_held: holdTime.days!,
          max_hold_days: HOLD_TIMES[paramCanonical] ?? 28,
        });
      }

      // Track summary data
      if (permitNumber) permitNumbers.add(permitNumber);
      if (siteState) states.add(siteState.toUpperCase());
      if (siteName) sites.add(siteName);
      if (labName) labNames.add(labName);
      if (sampleDate) allDates.push(sampleDate);

      // Parameter counts
      const paramEntry = parameterCounts.get(paramCanonical) ?? { total: 0, belowDet: 0 };
      paramEntry.total++;
      if (parsed.belowDetection) paramEntry.belowDet++;
      parameterCounts.set(paramCanonical, paramEntry);

      // Outfall counts
      const outfallKey = outfallRaw || "(empty)";
      const outfallEntry = outfallCounts.get(outfallKey) ?? { matched: outfallMatched, count: 0 };
      outfallEntry.count++;
      if (outfallMatched) outfallEntry.matched = outfallMatched;
      outfallCounts.set(outfallKey, outfallEntry);

      records.push({
        row_number: rowNum,
        permittee_name: permitteName,
        permit_number: permitNumber,
        site_name: siteName,
        site_state: siteState,
        site_county: siteCounty,
        lab_name: labName,
        sampler,
        outfall_raw: outfallRaw,
        outfall_matched: outfallMatched,
        latitude: latitude && !isNaN(latitude) ? latitude : null,
        longitude: longitude && !isNaN(longitude) ? longitude : null,
        stream_name: streamName,
        sample_date: sampleDate,
        sample_time: sampleTime,
        analysis_date: analysisDate,
        parameter_raw: parameterRaw,
        parameter_canonical: paramCanonical,
        value: parsed.value,
        value_raw: parsed.raw,
        unit: unitRaw,
        below_detection: parsed.belowDetection,
        data_qualifier: parsed.qualifier,
        comments: commentsRaw || null,
        hold_time_days: holdTime.days,
        hold_time_compliant: holdTime.compliant,
      });
    }

    // 13. Build warnings
    if (unknownParameters.size > 0) {
      warnings.push(
        `${unknownParameters.size} unknown parameter name(s) passed through without normalization: ${[...unknownParameters].slice(0, 10).join(", ")}`,
      );
    }

    if (!hasOutfallData) {
      warnings.push(
        "No permits found in database for the permit numbers in this file. Outfall matching was skipped. Import the corresponding permits first for outfall validation.",
      );
    } else {
      const unmatchedOutfalls = [...outfallCounts.entries()]
        .filter(([, v]) => !v.matched)
        .map(([k]) => k);
      if (unmatchedOutfalls.length > 0) {
        warnings.push(
          `${unmatchedOutfalls.length} outfall(s) could not be matched to existing permit outfalls: ${unmatchedOutfalls.slice(0, 10).join(", ")}`,
        );
      }
    }

    if (holdTimeViolations.length > 0) {
      warnings.push(
        `${holdTimeViolations.length} potential hold time violation(s) detected.`,
      );
    }

    if (validationErrors.length > 0) {
      warnings.push(
        `${validationErrors.length} row-level validation issue(s) found.`,
      );
    }

    // 14. Sort dates for range
    allDates.sort();
    const dateRange = {
      earliest: allDates[0] ?? null,
      latest: allDates[allDates.length - 1] ?? null,
    };

    // 15. Build parameter and outfall summaries
    const parameterSummary = [...parameterCounts.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, counts]) => ({
        canonical_name: name,
        sample_count: counts.total,
        below_detection_count: counts.belowDet,
      }));

    const outfallSummary = [...outfallCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, data]) => ({
        raw_name: name,
        matched_id: data.matched,
        sample_count: data.count,
      }));

    // 16. Truncate records if too many
    const recordsTruncated = records.length > MAX_RECORDS_IN_EXTRACTED;
    const storedRecords = recordsTruncated
      ? records.slice(0, MAX_RECORDS_IN_EXTRACTED)
      : records;

    if (recordsTruncated) {
      warnings.push(
        `Records truncated: showing ${MAX_RECORDS_IN_EXTRACTED.toLocaleString()} of ${records.length.toLocaleString()} parsed records in extraction preview. Full data is preserved in the original file.`,
      );
    }

    // 17. Build summary text
    const uniqueSamples = new Set(
      records.map((r) => `${r.permit_number}|${r.outfall_raw}|${r.sample_date}|${r.sample_time}`),
    ).size;
    const summaryText = `${records.length} lab results from ${uniqueSamples} sampling events across ${sites.size} site${sites.size !== 1 ? "s" : ""}. ${parameterCounts.size} parameters, ${[...outfallCounts.keys()].length} outfalls.`;

    // 18. Build extracted_data
    const extractedData: ExtractedLabData = {
      document_type: "lab_data_edd",
      file_format: fileFormat,
      column_count: columnCount,
      total_rows: totalRows,
      parsed_rows: records.length,
      skipped_rows: skippedRows,
      permit_numbers: [...permitNumbers],
      states: [...states],
      sites: [...sites],
      date_range: dateRange,
      lab_names: [...labNames],
      parameters_found: parameterCounts.size,
      parameter_summary: parameterSummary,
      outfalls_found: outfallCounts.size,
      outfall_summary: outfallSummary,
      warnings,
      validation_errors: validationErrors.slice(0, 50), // cap validation errors
      hold_time_violations: holdTimeViolations.slice(0, 50), // cap violations
      records: storedRecords,
      records_truncated: recordsTruncated,
      summary: summaryText,
    };

    // 19. Mark as parsed
    await markParsed(
      supabase,
      queueId,
      extractedData,
      records.length,
      queueEntry.state_code,
      warnings,
    );

    console.log(
      "[parse-lab-data-edd] Success:",
      queueEntry.file_name,
      "| Rows parsed:", records.length,
      "| Parameters:", parameterCounts.size,
      "| Outfalls:", outfallCounts.size,
      "| Warnings:", warnings.length,
    );

    return jsonResponse({ success: true });
  } catch (err) {
    const errorStrings = classifyError(err);
    console.error("[parse-lab-data-edd] Failed:", queueEntry.file_name, errorStrings);

    await markFailed(supabase, queueId, errorStrings);

    // Return 200 — failure state delivered via Realtime, not HTTP response
    return jsonResponse({ success: true, message: "Processing failed — see queue status" });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BlobReader, BlobWriter, ZipReader } from "https://esm.sh/@zip.js/zip.js@2.7.32";

import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB for ZIP bundles
const PARSER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface NetDmrRow {
  rowNumber: number;
  permitNumber: string;
  outfallId: string;
  monitoringPeriodStart: string | null;
  monitoringPeriodEnd: string | null;
  parameterCode: string;
  parameterDesc: string;
  statisticalBase: string;
  limitValue: number | null;
  limitUnit: string;
  measuredValue: number | null;
  measuredUnit: string;
  nodiCode: string | null;
  sampleCount: number | null;
  exceedancePct: number | null;
  isExceedance: boolean;
}

interface ExtractedDmrData {
  document_type: "netdmr_bundle";
  parser_version: string;
  file_count: number;
  total_rows: number;
  parsed_rows: number;
  skipped_rows: number;
  permit_numbers: string[];
  states: string[];
  date_range: { earliest: string | null; latest: string | null };
  parameters_found: number;
  parameters_resolved: number;
  outfalls_found: number;
  exceedance_count: number;
  no_discharge_count: number;
  submission_count: number;
  line_item_count: number;
  parameter_summary: Array<{
    storet_code: string;
    canonical_name: string | null;
    parameter_id: string | null;
    sample_count: number;
    exceedance_count: number;
  }>;
  warnings: string[];
  records: NetDmrRow[];
  records_truncated: boolean;
  summary: string;
}

// ---------------------------------------------------------------------------
// STORET Code Mapping — EPA parameter codes to canonical names
// Reference: https://cdxnodengn.epa.gov/cdx-enepa/public/storet
// ---------------------------------------------------------------------------
const STORET_MAP: Record<string, string> = {
  // Metals
  "01046": "Iron, Dissolved",
  "01045": "Iron, Total",
  "01056": "Manganese, Dissolved",
  "01055": "Manganese, Total",
  "01147": "Selenium, Dissolved",
  "01145": "Selenium, Total",
  "01105": "Aluminum, Dissolved",
  "01106": "Aluminum, Total",

  // Physical
  "00400": "pH",
  "00010": "Temperature",
  "00530": "Total Suspended Solids",
  "00545": "Settleable Solids",
  "70300": "Total Dissolved Solids",
  "00310": "BOD",
  "00300": "Dissolved Oxygen",
  "00076": "Turbidity",
  "00094": "Specific Conductance",
  "00095": "Conductivity",
  "00061": "Flow, Instantaneous",
  "00060": "Flow, Average",

  // Nutrients
  "00610": "Ammonia",
  "00630": "Nitrate+Nitrite",
  "00665": "Phosphorus, Total",

  // Anions
  "00945": "Sulfate",
  "00940": "Chloride",
  "00410": "Alkalinity",
  "00435": "Acidity",

  // Other
  "00556": "Oil & Grease",
  "00916": "Calcium",
  "00927": "Magnesium",
  "00929": "Sodium",
  "00937": "Potassium",
  "00900": "Hardness",
};

// ---------------------------------------------------------------------------
// NODI Code definitions (inlined for performance)
// ---------------------------------------------------------------------------
const NO_DATA_CODES = new Set(["C", "9", "N", "R", "U", "W"]);

function isNoDataCode(code: string | null): boolean {
  return code !== null && NO_DATA_CODES.has(code.toUpperCase());
}

// ---------------------------------------------------------------------------
// Statistical base mapping
// ---------------------------------------------------------------------------
const STAT_BASE_MAP: Record<string, string> = {
  "01": "minimum",
  "02": "average",
  "03": "maximum",
  "04": "daily_maximum",
  "05": "weekly_average",
  "06": "monthly_average",
  "07": "instantaneous",
  "30": "sample_measurement",
};

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientAny = any;

async function verifyAuth(
  req: Request,
  supabase: SupabaseClientAny,
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
// Queue status helpers
// ---------------------------------------------------------------------------
async function markProcessing(
  supabase: SupabaseClientAny,
  queueId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("file_processing_queue")
    .update({
      status: "processing",
      processing_started_at: now,
      updated_at: now,
    })
    .eq("id", queueId);
}

async function markParsed(
  supabase: SupabaseClientAny,
  queueId: string,
  extractedData: ExtractedDmrData,
  recordCount: number,
  currentStateCode: string | null,
  warnings: string[],
): Promise<void> {
  const now = new Date().toISOString();

  const states = extractedData.states;
  const singleState = states.length === 1 ? states[0].toUpperCase() : null;
  const shouldFillState = !currentStateCode && singleState;

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
  }

  await supabase
    .from("file_processing_queue")
    .update(updateData)
    .eq("id", queueId);
}

async function markFailed(
  supabase: SupabaseClientAny,
  queueId: string,
  errors: string[],
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("file_processing_queue")
    .update({
      status: "failed",
      error_log: errors,
      processing_completed_at: now,
      updated_at: now,
    })
    .eq("id", queueId);
}

// ---------------------------------------------------------------------------
// Error classifier
// ---------------------------------------------------------------------------
function classifyError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const raw = message.length > 800 ? message.slice(0, 800) + "..." : message;

  if (lower.includes("zip") || lower.includes("archive")) {
    return ["Failed to extract ZIP archive. The file may be corrupted.", raw];
  }

  if (lower.includes("csv") || lower.includes("parse")) {
    return ["Failed to parse CSV data. Check the file format.", raw];
  }

  if (lower.includes("permit") && lower.includes("not found")) {
    return ["Permit number not found in database. Import the permit first.", raw];
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
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
// Date parsing (MM/DD/YYYY or YYYY-MM-DD)
// ---------------------------------------------------------------------------
function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // MM/DD/YYYY
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

// ---------------------------------------------------------------------------
// CSV parsing (handles quoted fields with commas)
// ---------------------------------------------------------------------------
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

// ---------------------------------------------------------------------------
// Parse NetDMR CSV content
// NetDMR export format: ~30 columns, headerless in some exports
// ---------------------------------------------------------------------------
function parseNetDmrCsv(
  content: string,
  fileName: string,
  _storetToParameterId: Map<string, string>,
): { rows: NetDmrRow[]; warnings: string[] } {
  // Reserved for future STORET code lookup implementation
  void _storetToParameterId;

  const warnings: string[] = [];
  const rows: NetDmrRow[] = [];

  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    warnings.push(`${fileName}: Empty file`);
    return { rows, warnings };
  }

  // Detect if first line is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes("permit") || firstLine.includes("npdes");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cols = parseCSVLine(line);

    // Skip lines with insufficient columns
    if (cols.length < 15) {
      continue;
    }

    // NetDMR CSV column positions (0-indexed)
    // This may vary by state — KY NetDMR format:
    // 0: Permit Number
    // 1: Permit Name
    // 2: Outfall
    // 3: Monitoring Period Start
    // 4: Monitoring Period End
    // 5: Parameter Code (STORET)
    // 6: Parameter Description
    // 7: Statistical Base Code
    // 8: Limit Value
    // 9: Limit Unit
    // 10: DMR Value
    // 11: DMR Unit
    // 12: NODI Code
    // 13: Number of Excursions
    // 14: Exceedance Percent

    const permitNumber = cols[0]?.trim() ?? "";
    const outfallId = cols[2]?.trim() ?? "";
    const periodStart = parseDate(cols[3]);
    const periodEnd = parseDate(cols[4]);
    const paramCode = cols[5]?.trim() ?? "";
    const paramDesc = cols[6]?.trim() ?? "";
    const statBaseCode = cols[7]?.trim() ?? "";
    const limitValueRaw = cols[8]?.trim() ?? "";
    const limitUnit = cols[9]?.trim() ?? "";
    const measuredValueRaw = cols[10]?.trim() ?? "";
    const measuredUnit = cols[11]?.trim() ?? "";
    const nodiCode = cols[12]?.trim() || null;
    const exceedancePctRaw = cols[14]?.trim() ?? "";

    // Skip rows without permit or parameter
    if (!permitNumber || !paramCode) {
      continue;
    }

    // Parse numeric values
    const limitValue = limitValueRaw ? parseFloat(limitValueRaw) : null;
    const measuredValue = measuredValueRaw ? parseFloat(measuredValueRaw) : null;
    const exceedancePct = exceedancePctRaw ? parseFloat(exceedancePctRaw) : null;

    // Map statistical base code
    const statisticalBase = STAT_BASE_MAP[statBaseCode] ?? "sample_measurement";

    // Determine exceedance
    let isExceedance = false;
    if (
      !isNoDataCode(nodiCode) &&
      measuredValue !== null &&
      limitValue !== null &&
      limitValue > 0
    ) {
      isExceedance = measuredValue > limitValue;
    }

    rows.push({
      rowNumber: i + (hasHeader ? 2 : 1),
      permitNumber,
      outfallId,
      monitoringPeriodStart: periodStart,
      monitoringPeriodEnd: periodEnd,
      parameterCode: paramCode,
      parameterDesc: paramDesc || STORET_MAP[paramCode] || paramCode,
      statisticalBase,
      limitValue: isNaN(limitValue ?? NaN) ? null : limitValue,
      limitUnit,
      measuredValue: isNaN(measuredValue ?? NaN) ? null : measuredValue,
      measuredUnit,
      nodiCode,
      sampleCount: null,
      exceedancePct: isNaN(exceedancePct ?? NaN) ? null : exceedancePct,
      isExceedance,
    });
  }

  return { rows, warnings };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  console.log("[parse-netdmr-bundle] Invoked at", new Date().toISOString());

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

  console.log("[parse-netdmr-bundle] Processing queue_id:", queueId, "by user:", userId);

  // 3. Fetch queue entry
  const { data: queueEntry, error: fetchError } = await supabase
    .from("file_processing_queue")
    .select(
      "id, storage_bucket, storage_path, file_name, file_size_bytes, file_category, state_code, status, uploaded_by, organization_id",
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

  // 5. Guard: only process dmr category
  if (queueEntry.file_category !== "dmr") {
    return jsonResponse(
      {
        success: false,
        error: `parse-netdmr-bundle only processes dmr files, not '${queueEntry.file_category}'`,
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

  // 7. Mark as processing
  await markProcessing(supabase, queueId);

  try {
    // 8. Download file from Storage
    console.log("[parse-netdmr-bundle] Downloading", queueEntry.file_name);
    const { data: fileData, error: dlError } = await supabase.storage
      .from(queueEntry.storage_bucket)
      .download(queueEntry.storage_path);

    if (dlError || !fileData) {
      throw new Error(`Failed to download file: ${dlError?.message ?? "no data returned"}`);
    }

    // 9. Load STORET → parameter_id mapping
    console.log("[parse-netdmr-bundle] Loading parameter mappings");
    const { data: parameters } = await supabase
      .from("parameters")
      .select("id, name, storet_code");

    const storetToParameterId = new Map<string, string>();
    const storetToName = new Map<string, string>();
    if (parameters) {
      for (const p of parameters) {
        if (p.storet_code) {
          storetToParameterId.set(p.storet_code, p.id);
          storetToName.set(p.storet_code, p.name);
        }
      }
    }

    // 10. Extract ZIP and parse CSVs
    const allRows: NetDmrRow[] = [];
    const allWarnings: string[] = [];
    let fileCount = 0;

    const isZip =
      queueEntry.file_name.toLowerCase().endsWith(".zip") ||
      fileData.type === "application/zip";

    if (isZip) {
      console.log("[parse-netdmr-bundle] Extracting ZIP archive");

      const zipReader = new ZipReader(new BlobReader(fileData));
      const entries = await zipReader.getEntries();

      for (const entry of entries) {
        if (entry.directory) continue;

        const name = entry.filename.toLowerCase();
        if (!name.endsWith(".csv") && !name.endsWith(".txt")) continue;

        console.log("[parse-netdmr-bundle] Parsing:", entry.filename);
        fileCount++;

        const writer = new BlobWriter();
        const blob = await entry.getData?.(writer);
        if (!blob) continue;

        const text = await blob.text();
        const { rows, warnings } = parseNetDmrCsv(text, entry.filename, storetToParameterId);

        allRows.push(...rows);
        allWarnings.push(...warnings);
      }

      await zipReader.close();
    } else {
      // Single CSV file
      console.log("[parse-netdmr-bundle] Parsing single CSV");
      fileCount = 1;

      const text = await fileData.text();
      const { rows, warnings } = parseNetDmrCsv(text, queueEntry.file_name, storetToParameterId);

      allRows.push(...rows);
      allWarnings.push(...warnings);
    }

    if (allRows.length === 0) {
      throw new Error("No DMR data found in file. Check the file format.");
    }

    // 11. Build summary statistics
    const permitNumbers = [...new Set(allRows.map((r) => r.permitNumber))];
    const outfalls = [...new Set(allRows.map((r) => r.outfallId))];
    const allDates = allRows
      .map((r) => r.monitoringPeriodEnd)
      .filter((d): d is string => d !== null)
      .sort();

    const parameterCounts = new Map<string, {
      storetCode: string;
      name: string | null;
      parameterId: string | null;
      count: number;
      exceedances: number;
    }>();

    let exceedanceCount = 0;
    let noDischargeCount = 0;

    for (const row of allRows) {
      const key = row.parameterCode;
      const entry = parameterCounts.get(key) ?? {
        storetCode: key,
        name: storetToName.get(key) ?? STORET_MAP[key] ?? null,
        parameterId: storetToParameterId.get(key) ?? null,
        count: 0,
        exceedances: 0,
      };

      entry.count++;
      if (row.isExceedance) {
        entry.exceedances++;
        exceedanceCount++;
      }
      if (row.nodiCode === "C") {
        noDischargeCount++;
      }

      parameterCounts.set(key, entry);
    }

    // Derive states from permit numbers (KY permits start with "KY")
    const states = [...new Set(
      permitNumbers
        .map((p) => {
          const match = p.match(/^([A-Z]{2})/);
          return match ? match[1] : null;
        })
        .filter((s): s is string => s !== null)
    )];

    // Count unique submissions (permit × period)
    const submissionKeys = new Set(
      allRows.map((r) => `${r.permitNumber}|${r.monitoringPeriodEnd}`)
    );

    // 12. Build extracted data
    const MAX_RECORDS = 2000;
    const recordsTruncated = allRows.length > MAX_RECORDS;

    const parameterSummary = [...parameterCounts.values()]
      .sort((a, b) => b.count - a.count)
      .map((p) => ({
        storet_code: p.storetCode,
        canonical_name: p.name,
        parameter_id: p.parameterId,
        sample_count: p.count,
        exceedance_count: p.exceedances,
      }));

    const parametersResolved = parameterSummary.filter((p) => p.parameter_id !== null).length;

    const extractedData: ExtractedDmrData = {
      document_type: "netdmr_bundle",
      parser_version: PARSER_VERSION,
      file_count: fileCount,
      total_rows: allRows.length,
      parsed_rows: allRows.length,
      skipped_rows: 0,
      permit_numbers: permitNumbers,
      states,
      date_range: {
        earliest: allDates[0] ?? null,
        latest: allDates[allDates.length - 1] ?? null,
      },
      parameters_found: parameterCounts.size,
      parameters_resolved: parametersResolved,
      outfalls_found: outfalls.length,
      exceedance_count: exceedanceCount,
      no_discharge_count: noDischargeCount,
      submission_count: submissionKeys.size,
      line_item_count: allRows.length,
      parameter_summary: parameterSummary,
      warnings: allWarnings,
      records: recordsTruncated ? allRows.slice(0, MAX_RECORDS) : allRows,
      records_truncated: recordsTruncated,
      summary: `${allRows.length} DMR line items from ${submissionKeys.size} submissions across ${permitNumbers.length} permits. ${exceedanceCount} exceedances detected.`,
    };

    if (recordsTruncated) {
      allWarnings.push(
        `Records truncated: showing ${MAX_RECORDS.toLocaleString()} of ${allRows.length.toLocaleString()} parsed records in preview.`
      );
    }

    // Check for unmapped STORET codes
    const unmappedParams = parameterSummary
      .filter((p) => !p.parameter_id)
      .map((p) => p.storet_code);

    if (unmappedParams.length > 0) {
      allWarnings.push(
        `${unmappedParams.length} STORET code(s) not found in parameters table: ${unmappedParams.slice(0, 10).join(", ")}. These will need manual mapping.`
      );
    }

    // 13. Mark as parsed
    await markParsed(
      supabase,
      queueId,
      extractedData,
      allRows.length,
      queueEntry.state_code,
      allWarnings,
    );

    console.log(
      "[parse-netdmr-bundle] Success:",
      queueEntry.file_name,
      "| Files:", fileCount,
      "| Rows:", allRows.length,
      "| Submissions:", submissionKeys.size,
      "| Exceedances:", exceedanceCount,
      "| Warnings:", allWarnings.length,
    );

    return jsonResponse({ success: true });
  } catch (err) {
    const errorStrings = classifyError(err);
    console.error("[parse-netdmr-bundle] Failed:", queueEntry.file_name, errorStrings);

    await markFailed(supabase, queueId, errorStrings);

    return jsonResponse({ success: false, error: errorStrings[0], message: "Processing failed — see queue status" }, 500);
  }
});

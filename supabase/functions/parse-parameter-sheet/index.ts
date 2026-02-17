import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

// CORS headers (inlined from _shared/cors.ts)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_LIMITS_IN_EXTRACTED = 10_000; // Cap limits stored in extracted_data JSONB
const VALID_STATES = ["AL", "KY", "TN", "VA", "WV"];

// WV permit number pattern: WV followed by 7 digits
const WV_PERMIT_PATTERN = /^WV\d{7}$/i;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExtractedLimit {
  row_number: number;
  outfall_number: string;
  outfall_status: string;
  parameter_raw: string;
  parameter_id: string | null;
  parameter_canonical: string | null;
  limit_min: number | null;
  limit_avg: number | null;
  limit_max: number | null;
  is_range: boolean;
  range_min: number | null;
  range_max: number | null;
  unit: string;
  frequency: string;
  sample_type: string;
  is_report_only: boolean;
  is_not_constructed: boolean;
  extraction_confidence: number;
}

interface ExtractedOutfall {
  outfall_number: string;
  is_active: boolean;
  status_notes: string | null;
  limit_count: number;
}

interface ExtractedPermit {
  permit_number: string;
  tab_name: string;
  subsidiary_name: string | null;
  address: string | null;
  outfalls: ExtractedOutfall[];
  limits: ExtractedLimit[];
}

interface ExtractedParameterSheet {
  document_type: "parameter_sheet";
  file_format: "xlsx" | "xls";
  state_code: "WV";
  total_tabs: number;
  valid_permit_tabs: number;
  skipped_tabs: string[];
  permits: ExtractedPermit[];
  summary: {
    total_permits: number;
    total_outfalls: number;
    total_limits: number;
    unmatched_parameters: string[];
    not_constructed_outfalls: number;
    report_only_limits: number;
    matched_parameters: number;
    unmatched_parameter_count: number;
  };
  warnings: string[];
  validation_errors: Array<{
    tab: string;
    row: number;
    column: string;
    message: string;
  }>;
  limits_truncated: boolean;
}

interface ParameterAlias {
  alias: string;
  parameter_id: string;
  parameter_name: string;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function classifyError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("no worksheet") || lower.includes("empty file")) {
    return ["Excel file has no worksheets or is empty.", message];
  }
  if (lower.includes("no valid permit tabs")) {
    return ["No tabs with valid WV permit numbers (WV#######) found.", message];
  }
  if (lower.includes("file size")) {
    return ["File exceeds 50MB size limit.", message];
  }
  if (lower.includes("authentication") || lower.includes("jwt")) {
    return ["Authentication failed. Please log in again.", message];
  }

  return [message.slice(0, 800)];
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Auth verification (CRITICAL: Verify JWT before processing)
// ---------------------------------------------------------------------------
async function verifyAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>
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

async function markProcessing(
  supabase: ReturnType<typeof createClient>,
  queueId: string
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
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  extractedData: ExtractedParameterSheet,
  stateCode: string,
  warnings: string[]
): Promise<void> {
  const now = new Date().toISOString();
  const totalLimits = extractedData.permits.reduce((sum, p) => sum + p.limits.length, 0);

  await supabase
    .from("file_processing_queue")
    .update({
      status: "parsed",
      extracted_data: extractedData,
      records_extracted: totalLimits,
      state_code: stateCode,
      error_log: warnings.length > 0 ? warnings : null,
      processing_completed_at: now,
      updated_at: now,
    })
    .eq("id", queueId);
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  errors: string[]
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
// Parameter Resolution via parameter_aliases table
// ---------------------------------------------------------------------------
async function loadParameterAliases(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, { parameterId: string; canonicalName: string }>> {
  const aliasMap = new Map<string, { parameterId: string; canonicalName: string }>();

  try {
    const { data, error } = await supabase
      .from("parameter_aliases")
      .select(`
        alias,
        parameter_id,
        parameters:parameter_id (name)
      `);

    if (!error && data) {
      for (const row of data) {
        const paramName = (row.parameters as { name: string })?.name ?? null;
        if (paramName) {
          aliasMap.set(row.alias.toLowerCase().trim(), {
            parameterId: row.parameter_id,
            canonicalName: paramName,
          });
        }
      }
      console.log(`[parse-parameter-sheet] Loaded ${aliasMap.size} parameter aliases`);
    }
  } catch (e) {
    console.log("[parse-parameter-sheet] Failed to load parameter aliases:", e);
  }

  return aliasMap;
}

function resolveParameter(
  rawName: string,
  aliasMap: Map<string, { parameterId: string; canonicalName: string }>
): { parameterId: string | null; canonicalName: string | null; confidence: number } {
  const normalized = rawName.trim().toLowerCase();

  // Check alias map
  const match = aliasMap.get(normalized);
  if (match) {
    return { parameterId: match.parameterId, canonicalName: match.canonicalName, confidence: 1.0 };
  }

  // Try partial matching (parameter name might have extra text)
  for (const [alias, info] of aliasMap.entries()) {
    if (normalized.includes(alias) || alias.includes(normalized)) {
      return { parameterId: info.parameterId, canonicalName: info.canonicalName, confidence: 0.8 };
    }
  }

  return { parameterId: null, canonicalName: null, confidence: 0 };
}

// ---------------------------------------------------------------------------
// Limit Value Parsing
// ---------------------------------------------------------------------------
interface ParsedLimitValue {
  value: number | null;
  isReportOnly: boolean;
  isRange: boolean;
  rangeMin: number | null;
  rangeMax: number | null;
}

function parseLimitValue(raw: string | null | undefined): ParsedLimitValue {
  if (!raw || raw.trim() === "") {
    return { value: null, isReportOnly: false, isRange: false, rangeMin: null, rangeMax: null };
  }

  const trimmed = raw.toString().trim().toUpperCase();

  // "Report Only", "Monitor Only", "MO", "R"
  if (/^(REPORT|MONITOR)\s*(ONLY)?$|^MO$|^R$/i.test(trimmed)) {
    return { value: null, isReportOnly: true, isRange: false, rangeMin: null, rangeMax: null };
  }

  // pH range: "6.0-9.0" or "6.0 - 9.0"
  const rangeMatch = trimmed.match(/^(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)$/);
  if (rangeMatch) {
    return {
      value: null,
      isReportOnly: false,
      isRange: true,
      rangeMin: parseFloat(rangeMatch[1]),
      rangeMax: parseFloat(rangeMatch[2]),
    };
  }

  // Numeric value
  const num = parseFloat(trimmed.replace(/[<>]/g, ""));
  if (!isNaN(num)) {
    return { value: num, isReportOnly: false, isRange: false, rangeMin: null, rangeMax: null };
  }

  return { value: null, isReportOnly: false, isRange: false, rangeMin: null, rangeMax: null };
}

// ---------------------------------------------------------------------------
// Outfall Status Detection
// ---------------------------------------------------------------------------
function parseOutfallStatus(row: (string | null | undefined)[]): {
  isNotConstructed: boolean;
  isInactive: boolean;
  statusNotes: string | null;
} {
  const rowText = row
    .map((c) => (c ?? "").toString())
    .join(" ")
    .toUpperCase();

  const isNotConstructed = /NOT\s*CONSTRUCTED|^NC$/i.test(rowText);
  const isInactive = /INACTIVE|CLOSED|TERMINATED|ABANDONED/i.test(rowText);

  let statusNotes: string | null = null;
  if (isNotConstructed) statusNotes = "Outfall not constructed";
  else if (isInactive) statusNotes = "Outfall inactive/closed";

  return { isNotConstructed, isInactive, statusNotes };
}

// ---------------------------------------------------------------------------
// Main Parser Logic
// ---------------------------------------------------------------------------
async function parseParameterSheet(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  fileBytes: Uint8Array,
  fileName: string
): Promise<ExtractedParameterSheet> {
  // 1. Load parameter aliases for resolution
  const aliasMap = await loadParameterAliases(supabase);

  // 2. Parse Excel workbook
  const workbook = XLSX.read(fileBytes, { type: "array" });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error("Excel file has no worksheets");
  }

  console.log(`[parse-parameter-sheet] Found ${sheetNames.length} tabs: ${sheetNames.slice(0, 5).join(", ")}...`);

  // 3. Identify permit tabs (tab names that match WV permit pattern)
  const permitTabs: string[] = [];
  const skippedTabs: string[] = [];

  for (const name of sheetNames) {
    const cleaned = name.trim().toUpperCase();
    if (WV_PERMIT_PATTERN.test(cleaned)) {
      permitTabs.push(name);
    } else {
      skippedTabs.push(name);
    }
  }

  console.log(`[parse-parameter-sheet] Found ${permitTabs.length} permit tabs, skipping ${skippedTabs.length}`);

  if (permitTabs.length === 0) {
    throw new Error("No valid permit tabs found. Tab names must be WV permit numbers (e.g., WV1006304)");
  }

  // 4. Parse each permit tab
  const permits: ExtractedPermit[] = [];
  const warnings: string[] = [];
  const validationErrors: ExtractedParameterSheet["validation_errors"] = [];
  const unmatchedParams = new Set<string>();
  let totalLimits = 0;
  let notConstructedCount = 0;
  let reportOnlyCount = 0;
  let matchedParamsCount = 0;

  for (const tabName of permitTabs) {
    const sheet = workbook.Sheets[tabName];
    const permitNumber = tabName.trim().toUpperCase();

    // Convert sheet to array of arrays
    const rows: (string | null | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    if (rows.length < 5) {
      warnings.push(`Tab "${tabName}": Less than 5 rows, skipping`);
      continue;
    }

    // Extract metadata from rows 1-4 (column A typically has org info)
    const subsidiaryName = rows[0]?.[0]?.toString().trim() || null;
    const address = rows[1]?.[0]?.toString().trim() || null;

    // Find header row (usually row 4 or 5, look for "Outfall" or "Parameter")
    let headerRowIndex = -1;
    for (let i = 3; i < Math.min(10, rows.length); i++) {
      const rowText = rows[i]?.map((c) => (c ?? "").toString().toLowerCase()).join(" ") ?? "";
      if (rowText.includes("outfall") || rowText.includes("parameter")) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      warnings.push(`Tab "${tabName}": Could not find header row with Outfall/Parameter columns`);
      continue;
    }

    const headerRow = rows[headerRowIndex] ?? [];

    // Map column indices (flexible column detection)
    let outfallCol = -1;
    let paramCol = -1;
    let minCol = -1;
    let avgCol = -1;
    let maxCol = -1;
    let unitCol = -1;
    let freqCol = -1;
    let sampleTypeCol = -1;
    let statusCol = -1;

    for (let c = 0; c < headerRow.length; c++) {
      const header = (headerRow[c] ?? "").toString().toLowerCase().trim();
      if (header.includes("outfall") && !header.includes("status")) outfallCol = c;
      else if (header.includes("status")) statusCol = c;
      else if (header.includes("parameter")) paramCol = c;
      else if (header.includes("min") && !header.includes("minute")) minCol = c;
      else if (header.includes("avg") || header.includes("average")) avgCol = c;
      else if (header.includes("max") || header.includes("maximum")) maxCol = c;
      else if (header.includes("unit")) unitCol = c;
      else if (header.includes("freq")) freqCol = c;
      else if (header.includes("sample") && header.includes("type")) sampleTypeCol = c;
    }

    if (outfallCol === -1 || paramCol === -1) {
      warnings.push(`Tab "${tabName}": Missing Outfall or Parameter column`);
      continue;
    }

    // Parse data rows
    const limits: ExtractedLimit[] = [];
    const outfallMap = new Map<string, ExtractedOutfall>();

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];

      // Skip empty rows
      const hasContent = row.some((c) => c && c.toString().trim());
      if (!hasContent) continue;

      const outfallNum = (row[outfallCol] ?? "").toString().trim();
      const paramRaw = (row[paramCol] ?? "").toString().trim();

      // Skip rows without outfall or parameter
      if (!outfallNum || !paramRaw) continue;

      // Parse limit values
      const minParsed = minCol >= 0 ? parseLimitValue(row[minCol]) : { value: null, isReportOnly: false, isRange: false, rangeMin: null, rangeMax: null };
      const avgParsed = avgCol >= 0 ? parseLimitValue(row[avgCol]) : { value: null, isReportOnly: false, isRange: false, rangeMin: null, rangeMax: null };
      const maxParsed = maxCol >= 0 ? parseLimitValue(row[maxCol]) : { value: null, isReportOnly: false, isRange: false, rangeMin: null, rangeMax: null };

      const isReportOnly = minParsed.isReportOnly || avgParsed.isReportOnly || maxParsed.isReportOnly;
      const isRange = minParsed.isRange || avgParsed.isRange || maxParsed.isRange;

      // Check outfall status
      const outfallStatus = parseOutfallStatus(row);
      const statusText = statusCol >= 0 ? (row[statusCol] ?? "").toString().trim() : "";

      // Resolve parameter
      const resolved = resolveParameter(paramRaw, aliasMap);

      if (!resolved.parameterId) {
        unmatchedParams.add(paramRaw);
      } else {
        matchedParamsCount++;
      }

      // Track outfall
      if (!outfallMap.has(outfallNum)) {
        outfallMap.set(outfallNum, {
          outfall_number: outfallNum,
          is_active: !outfallStatus.isNotConstructed && !outfallStatus.isInactive,
          status_notes: outfallStatus.statusNotes || statusText || null,
          limit_count: 0,
        });
        if (outfallStatus.isNotConstructed) notConstructedCount++;
      }

      const outfallEntry = outfallMap.get(outfallNum)!;
      outfallEntry.limit_count++;

      if (isReportOnly) reportOnlyCount++;

      const limit: ExtractedLimit = {
        row_number: r + 1,
        outfall_number: outfallNum,
        outfall_status: statusText || (outfallStatus.isNotConstructed ? "NOT CONSTRUCTED" : ""),
        parameter_raw: paramRaw,
        parameter_id: resolved.parameterId,
        parameter_canonical: resolved.canonicalName,
        limit_min: minParsed.value,
        limit_avg: avgParsed.value,
        limit_max: maxParsed.value,
        is_range: isRange,
        range_min: maxParsed.rangeMin ?? avgParsed.rangeMin ?? minParsed.rangeMin,
        range_max: maxParsed.rangeMax ?? avgParsed.rangeMax ?? minParsed.rangeMax,
        unit: unitCol >= 0 ? (row[unitCol] ?? "").toString().trim() : "",
        frequency: freqCol >= 0 ? (row[freqCol] ?? "").toString().trim() : "",
        sample_type: sampleTypeCol >= 0 ? (row[sampleTypeCol] ?? "").toString().trim() : "",
        is_report_only: isReportOnly,
        is_not_constructed: outfallStatus.isNotConstructed,
        extraction_confidence: resolved.confidence,
      };

      limits.push(limit);
      totalLimits++;

      // Truncate if too many
      if (totalLimits >= MAX_LIMITS_IN_EXTRACTED) {
        warnings.push(`Limit extraction capped at ${MAX_LIMITS_IN_EXTRACTED} records`);
        break;
      }
    }

    permits.push({
      permit_number: permitNumber,
      tab_name: tabName,
      subsidiary_name: subsidiaryName,
      address: address,
      outfalls: Array.from(outfallMap.values()),
      limits: limits,
    });

    if (totalLimits >= MAX_LIMITS_IN_EXTRACTED) break;
  }

  // 5. Build result
  const result: ExtractedParameterSheet = {
    document_type: "parameter_sheet",
    file_format: fileName.toLowerCase().endsWith(".xls") ? "xls" : "xlsx",
    state_code: "WV",
    total_tabs: sheetNames.length,
    valid_permit_tabs: permitTabs.length,
    skipped_tabs: skippedTabs.slice(0, 10), // Cap to avoid JSONB bloat
    permits: permits,
    summary: {
      total_permits: permits.length,
      total_outfalls: permits.reduce((sum, p) => sum + p.outfalls.length, 0),
      total_limits: totalLimits,
      unmatched_parameters: Array.from(unmatchedParams).slice(0, 50),
      not_constructed_outfalls: notConstructedCount,
      report_only_limits: reportOnlyCount,
      matched_parameters: matchedParamsCount,
      unmatched_parameter_count: unmatchedParams.size,
    },
    warnings: warnings,
    validation_errors: validationErrors.slice(0, 100),
    limits_truncated: totalLimits >= MAX_LIMITS_IN_EXTRACTED,
  };

  // Generate summary text
  const summaryParts = [
    `Parsed ${permits.length} WV permits`,
    `${result.summary.total_outfalls} outfalls`,
    `${totalLimits} limits`,
  ];
  if (notConstructedCount > 0) summaryParts.push(`${notConstructedCount} not constructed`);
  if (reportOnlyCount > 0) summaryParts.push(`${reportOnlyCount} report-only`);
  if (unmatchedParams.size > 0) summaryParts.push(`${unmatchedParams.size} unmatched parameters`);

  console.log(`[parse-parameter-sheet] ${summaryParts.join(", ")}`);

  return result;
}

// ---------------------------------------------------------------------------
// HTTP Handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let queueId = "";

  try {
    // 1. Parse request
    const body = await req.json();
    queueId = body.queue_id;

    if (!queueId) {
      return jsonResponse({ success: false, error: "Missing queue_id" }, 400);
    }

    console.log(`[parse-parameter-sheet] Processing queue entry: ${queueId}`);

    // 2. Create Supabase client with service role (for storage access)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Verify JWT (CRITICAL: Authenticate before processing)
    const userId = await verifyAuth(req, supabase);
    if (!userId) {
      console.error("[parse-parameter-sheet] Unauthorized: Missing or invalid JWT");
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    console.log(`[parse-parameter-sheet] Authenticated user: ${userId}`);

    // 5. Fetch queue entry
    const { data: entry, error: fetchError } = await supabase
      .from("file_processing_queue")
      .select("*")
      .eq("id", queueId)
      .single();

    if (fetchError || !entry) {
      return jsonResponse({ success: false, error: `Queue entry not found: ${queueId}` }, 404);
    }

    // 6. Validate status
    if (!["queued", "failed"].includes(entry.status)) {
      return jsonResponse({
        success: false,
        error: `Invalid status: ${entry.status}. Expected 'queued' or 'failed'.`,
      }, 400);
    }

    // 7. Validate file category
    if (entry.file_category !== "npdes_permit") {
      return jsonResponse({
        success: false,
        error: `Invalid file_category: ${entry.file_category}. Expected 'npdes_permit'.`,
      }, 400);
    }

    // 8. Validate file size
    if (entry.file_size_bytes > MAX_FILE_SIZE) {
      await markFailed(supabase, queueId, [`File size ${entry.file_size_bytes} exceeds limit`]);
      return jsonResponse({ success: false, error: "File too large" }, 400);
    }

    // 9. Mark as processing
    await markProcessing(supabase, queueId);

    // 10. Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(entry.storage_bucket)
      .download(entry.storage_path);

    if (downloadError || !fileData) {
      const errors = classifyError(downloadError ?? new Error("Download failed"));
      await markFailed(supabase, queueId, errors);
      return jsonResponse({ success: false, error: errors[0] }, 500);
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    console.log(`[parse-parameter-sheet] Downloaded ${fileBytes.length} bytes`);

    // 11. Parse the parameter sheet
    const result = await parseParameterSheet(supabase, queueId, fileBytes, entry.file_name);

    // 12. Mark as parsed
    await markParsed(supabase, queueId, result, "WV", result.warnings);

    return jsonResponse({
      success: true,
      summary: {
        permits: result.summary.total_permits,
        outfalls: result.summary.total_outfalls,
        limits: result.summary.total_limits,
        unmatched_parameters: result.summary.unmatched_parameter_count,
        not_constructed: result.summary.not_constructed_outfalls,
        report_only: result.summary.report_only_limits,
      },
    });
  } catch (err) {
    console.error("[parse-parameter-sheet] Error:", err);
    const errors = classifyError(err);

    if (queueId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await markFailed(supabase, queueId, errors);
    }

    return jsonResponse({ success: false, error: errors[0] }, 500);
  }
});

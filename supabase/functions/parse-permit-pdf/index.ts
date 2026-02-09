import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CLAUDE_TIMEOUT_MS = 90_000; // 90 seconds — permits can be 50+ pages
const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB — Anthropic document limit

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExtractedPermitData {
  permit_number?: string;
  state?: string;
  outfall_count?: number;
  limit_count?: number;
  limits?: Array<{
    parameter?: string;
    outfall?: string;
    value?: string;
    unit?: string;
    frequency?: string;
  }>;
}

interface QueueRow {
  id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_category: string;
  status: string;
  uploaded_by: string | null;
}

// ---------------------------------------------------------------------------
// Claude extraction prompt — tailored for NPDES coal mining permits
// ---------------------------------------------------------------------------
const EXTRACTION_PROMPT = `You are an NPDES permit data extraction specialist for coal mining operations under Clean Water Act regulatory oversight.

Analyze this NPDES (National Pollutant Discharge Elimination System) permit document and extract structured data.

EXTRACTION REQUIREMENTS:

1. **Permit Number**: Find the NPDES permit number (format: typically state prefix + numbers, e.g., WV0001234, KY0098765, AL0012345, VA0088123, TN0076543). Look in the header, title page, or first few pages.

2. **State**: Identify the issuing state from the permit number prefix or agency name:
   - AL = Alabama (ADEM)
   - KY = Kentucky (KYDEP)
   - TN = Tennessee (TDEC)
   - VA = Virginia (DMLR)
   - WV = West Virginia (DEP)

3. **Outfalls**: Count the total number of outfall/discharge points (e.g., Outfall 001, Outfall 002, Internal Outfall 101). Include both external and internal outfalls.

4. **Effluent Limits**: For EACH discharge limit listed in the permit, extract:
   - parameter: The water quality parameter name (e.g., "Total Suspended Solids", "pH", "Iron, Total", "Manganese, Total", "Aluminum, Total", "Selenium, Total", "Specific Conductance", "Flow")
   - outfall: The outfall identifier (e.g., "001", "002", "101")
   - value: The numeric limit value with qualifier (e.g., "35.0 mg/L daily max", "70.0 mg/L monthly avg", "6.0-9.0 S.U.")
   - unit: The measurement unit (e.g., "mg/L", "S.U.", "umhos/cm", "MGD", "lbs/day")
   - frequency: Monitoring frequency (e.g., "1/week", "1/month", "1/quarter", "continuous", "2/month")

RESPOND WITH ONLY A JSON OBJECT in this exact structure (no markdown, no explanation):

{
  "permit_number": "string or null if not found",
  "state": "two-letter state code or null",
  "outfall_count": number,
  "limit_count": number,
  "limits": [
    {
      "parameter": "parameter name",
      "outfall": "outfall ID",
      "value": "limit value with qualifier",
      "unit": "measurement unit",
      "frequency": "monitoring frequency"
    }
  ]
}

IMPORTANT RULES:
- Set limit_count to the total number of individual limit entries extracted
- If you cannot find a permit number, set permit_number to null (do not guess)
- If a field is ambiguous or not clearly stated, include your best interpretation with the raw text
- Include ALL limits from ALL outfalls — do not summarize or skip any
- Distinguish between daily maximum, monthly average, instantaneous maximum where specified
- For pH, capture as range (e.g., "6.0-9.0 S.U.") not as separate min/max entries`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify JWT from Authorization header. Returns user ID or null. */
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

/** Download PDF bytes from Supabase Storage. */
async function downloadPdf(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) {
    throw new Error(`Storage download failed: ${error.message}`);
  }
  if (!data) {
    throw new Error("Storage returned empty file");
  }

  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/** Convert Uint8Array to base64 string (Deno-compatible). */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Call Claude API with PDF document for structured extraction. */
async function extractPermitData(
  pdfBase64: string,
  fileName: string,
): Promise<ExtractedPermitData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    console.log("[parse-permit-pdf] Calling Claude API for", fileName);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API ${response.status}: ${errorBody}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text;

    if (!text) {
      throw new Error("Claude returned empty response");
    }

    console.log("[parse-permit-pdf] Claude response length:", text.length, "chars");

    // Parse JSON — handle markdown code fences if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

    // Clean up common JSON issues from LLM output:
    // 1. Remove trailing commas before } or ]
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
    // 2. Remove single-line comments
    jsonStr = jsonStr.replace(/\/\/[^\n]*/g, "");
    // 3. If response was truncated, try to salvage by closing open structures
    if (!jsonStr.endsWith("}")) {
      // Find the last complete limit entry and close the array + object
      const lastCompleteEntry = jsonStr.lastIndexOf("}");
      if (lastCompleteEntry > 0) {
        const truncated = jsonStr.slice(0, lastCompleteEntry + 1);
        // Count open brackets to close them
        const openBrackets = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
        const openBraces = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
        jsonStr = truncated + "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
        console.log("[parse-permit-pdf] Repaired truncated JSON (closed", openBrackets, "arrays,", openBraces, "objects)");
      }
    }

    const parsed: ExtractedPermitData = JSON.parse(jsonStr);
    return parsed;
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Claude API timed out after 90 seconds");
    }
    throw err;
  }
}

/** Classify errors into strings that match ErrorForensics.tsx patterns. */
function classifyError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("password") || lower.includes("encrypted")) {
    return ["File is password protected. Please upload an unlocked version."];
  }

  if (lower.includes("invalid") || lower.includes("corrupt") || lower.includes("malformed")) {
    return ["File appears to be corrupt or is not a valid PDF document."];
  }

  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("timed out")) {
    return ["Processing timed out. The document may be too large or complex."];
  }

  if (lower.includes("overloaded") || lower.includes("rate limit") || lower.includes("429")) {
    return ["AI processing service is temporarily overloaded. Please retry in a few minutes."];
  }

  return [message.length > 500 ? message.slice(0, 500) + "..." : message];
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
    console.error("[parse-permit-pdf] Failed to mark processing:", error.message);
  }
}

async function markParsed(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  extractedData: ExtractedPermitData,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("file_processing_queue")
    .update({
      status: "parsed",
      extracted_data: extractedData,
      records_extracted: extractedData.limit_count ?? extractedData.limits?.length ?? 0,
      processing_completed_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (error) {
    console.error("[parse-permit-pdf] Failed to mark parsed:", error.message);
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
    console.error("[parse-permit-pdf] Failed to mark failed:", error.message);
  }
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
  console.log("[parse-permit-pdf] Invoked at", new Date().toISOString());

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Check required secrets
  if (!ANTHROPIC_API_KEY) {
    console.error("[parse-permit-pdf] ANTHROPIC_API_KEY not set");
    return jsonResponse({ success: false, error: "Server configuration error" }, 500);
  }

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

  console.log("[parse-permit-pdf] Processing queue_id:", queueId, "by user:", userId);

  // 3. Fetch queue entry
  const { data: queueEntry, error: fetchError } = await supabase
    .from("file_processing_queue")
    .select(
      "id, storage_bucket, storage_path, file_name, file_category, status, uploaded_by",
    )
    .eq("id", queueId)
    .single();

  if (fetchError || !queueEntry) {
    return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
  }

  // 4. Guard: only process queued or failed entries (failed = retry)
  if (queueEntry.status !== "queued" && queueEntry.status !== "failed") {
    return jsonResponse(
      {
        success: false,
        error: `Cannot process entry with status '${queueEntry.status}'. Expected 'queued' or 'failed'.`,
      },
      409,
    );
  }

  // 5. Guard: only process NPDES permits
  if (queueEntry.file_category !== "npdes_permit") {
    return jsonResponse(
      {
        success: false,
        error: `parse-permit-pdf only processes NPDES permits, not '${queueEntry.file_category}'`,
      },
      400,
    );
  }

  // 6. Mark as processing (triggers Realtime → frontend shows amber pulse)
  await markProcessing(supabase, queueId);

  try {
    // 7. Download PDF from Storage
    console.log(
      "[parse-permit-pdf] Downloading from",
      queueEntry.storage_bucket,
      queueEntry.storage_path,
    );
    const pdfBytes = await downloadPdf(
      supabase,
      queueEntry.storage_bucket,
      queueEntry.storage_path,
    );

    // 8. Validate PDF size
    if (pdfBytes.length > MAX_PDF_SIZE) {
      await markFailed(supabase, queueId, [
        `PDF file is too large (${(pdfBytes.length / 1024 / 1024).toFixed(1)}MB). Maximum supported size is ${MAX_PDF_SIZE / 1024 / 1024}MB.`,
      ]);
      return jsonResponse({ success: true, message: "File too large for processing" });
    }

    // 9. Validate PDF magic bytes
    const pdfHeader = new TextDecoder().decode(pdfBytes.slice(0, 5));
    if (pdfHeader !== "%PDF-") {
      await markFailed(supabase, queueId, [
        "File is not a valid PDF. The file header does not match PDF format.",
      ]);
      return jsonResponse({ success: true, message: "Invalid PDF format" });
    }

    // 10. Convert to base64 for Claude API
    const pdfBase64 = uint8ArrayToBase64(pdfBytes);

    // 11. Call Claude for structured extraction
    const extractedData = await extractPermitData(pdfBase64, queueEntry.file_name);

    // 12. Handle missing permit number (still useful data, mark parsed with warning)
    if (!extractedData.permit_number) {
      console.warn("[parse-permit-pdf] No permit number found in", queueEntry.file_name);

      const now = new Date().toISOString();
      await supabase
        .from("file_processing_queue")
        .update({
          status: "parsed",
          extracted_data: extractedData,
          records_extracted:
            extractedData.limit_count ?? extractedData.limits?.length ?? 0,
          error_log: [
            "No permit number found in this document. Please verify this is an NPDES permit.",
          ],
          processing_completed_at: now,
          updated_at: now,
        })
        .eq("id", queueId);
    } else {
      // 13. Full success
      await markParsed(supabase, queueId, extractedData);
    }

    console.log(
      "[parse-permit-pdf] Success:",
      queueEntry.file_name,
      "| Permit:",
      extractedData.permit_number ?? "NOT FOUND",
      "| Outfalls:",
      extractedData.outfall_count ?? 0,
      "| Limits:",
      extractedData.limits?.length ?? 0,
    );

    return jsonResponse({ success: true });
  } catch (err) {
    // Classify error for ErrorForensics pattern matching
    const errorStrings = classifyError(err);
    console.error("[parse-permit-pdf] Failed:", queueEntry.file_name, errorStrings);

    await markFailed(supabase, queueId, errorStrings);

    // Return 200 — failure state delivered via Realtime, not HTTP response
    return jsonResponse({ success: true, message: "Processing failed — see queue status" });
  }
});

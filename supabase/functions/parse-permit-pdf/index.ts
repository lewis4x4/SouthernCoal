import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CLAUDE_TIMEOUT_MS = 180_000; // 180 seconds — scanned PDFs with many image pages take longer
const SIGNED_URL_EXPIRY = 300; // 5 minutes — enough for Claude to fetch the PDF
const BASE64_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — keep low to avoid WORKER_LIMIT on scanned PDFs

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExtractedPermitData {
  // Always present
  document_type: string;
  permit_number?: string;
  state?: string;

  // Dates
  effective_date?: string;
  expiration_date?: string;

  // For original_permit, renewal, draft_permit, tsmp_permit, modification
  outfall_count?: number;
  limit_count?: number;
  limits?: Array<{
    parameter?: string;
    outfall?: string;
    value?: string;
    unit?: string;
    frequency?: string;
  }>;

  // For modification
  mod_number?: string;
  description?: string;

  // For extension
  extension_months?: number;
  new_expiration_date?: string;

  // For monitoring_release
  released_outfalls?: string[];

  // For wet_suspension
  test_types?: string[];

  // For transfer
  from_entity?: string;
  to_entity?: string;

  // For selenium_compliance
  monitoring_period?: string;

  // General summary for any type
  summary?: string;
}

// ---------------------------------------------------------------------------
// Claude extraction prompt — classifies + extracts permit-related documents
// ---------------------------------------------------------------------------
const EXTRACTION_PROMPT = `You are an NPDES permit document specialist for coal mining operations under Clean Water Act regulatory oversight across AL, KY, TN, VA, and WV.

STEP 1 — CLASSIFY THE DOCUMENT TYPE

Read the document and determine which ONE type it is:

| document_type | Description |
|---|---|
| original_permit | Full NPDES permit with outfall tables and effluent limits |
| modification | Permit modification (Mod #N) — changes to an existing permit |
| extension | Permit extension — extends expiration date (WV: "NPDES Permit Extension", NPE format) |
| extension_letter | Administrative cover letter about an extension (WV: "NPDES Extension Letter") — NOT a permit |
| renewal | Permit renewal (WV: NPR #N) — full replacement permit with new limits |
| draft_permit | Draft version of a permit — not yet final/effective |
| transfer | Permit transfer between entities |
| closure | Permit closure or termination ("Closed", "Terminated") |
| inactivation | Permit inactivation (KY-specific) |
| tsmp_permit | Temporary Surface Mining Permit (TN-specific, TNR###### format) |
| monitoring_release | Release from monitoring at specific outfalls (AL-specific) |
| wet_suspension | WET (Whole Effluent Toxicity) test requirement suspension (AL-specific) |
| selenium_compliance | Selenium compliance report (VA-specific) |
| administrative_notice | Any other administrative document — letters, application updates, notices |

STATE-SPECIFIC GUIDANCE:
- KENTUCKY: Filenames use "EKCL" (Eastern Kentucky Coal LLC). Permit numbers: KYGE##### format. Site IDs: 7-digit numbers (e.g., 8130354).
- TENNESSEE: TSMP permits use TNR###### format. Site numbers: 4-digit prefix (e.g., 2427, 2866). Regular NPDES: TN####### format.
- WEST VIRGINIA: Three extension types — "NPDES Permit Extension" (actual permit), "NPDES Extension Letter" (admin notice), "NPE(N)-YYYY-MMDD" (numbered extension). NPR = Notice of Permit Renewal. Mod # = modification number.
- VIRGINIA: Mine numbers: 7-digit prefix (e.g., 1100877). Selenium compliance is a VA-specific reporting requirement.
- ALABAMA: Monitoring releases reference specific outfalls. WET suspensions specify acute and/or chronic test types.

STEP 2 — EXTRACT DATA BASED ON DOCUMENT TYPE

For ALL types, extract:
- document_type (from Step 1)
- permit_number (NPDES permit number: AL#######, KYGE#####, TN#######, VA#######, WV#######, or TNR###### for TSMP)
- state (two-letter code: AL, KY, TN, VA, WV)
- effective_date (YYYY-MM-DD) — REQUIRED: use the permit effective date, letter date, issuance date, or document date. Every document has a date — find it. For letters and notices, use the date at the top of the letter. For permits, use the effective date field.
- expiration_date (YYYY-MM-DD if found)
- summary (1-2 sentence description of the document)

ADDITIONAL FIELDS by document type:

For original_permit, renewal, draft_permit, tsmp_permit:
- outfall_count: total outfall/discharge points (external + internal)
- limit_count: total individual limit entries
- limits: array of { parameter, outfall, value, unit, frequency }

For modification:
- mod_number: modification identifier (e.g., "1", "2", "Mod #3")
- description: what was modified
- outfall_count, limit_count, limits (if the modification includes updated limit tables)

For extension:
- extension_months: number of months extended (if stated)
- new_expiration_date: new expiration date (YYYY-MM-DD)

For monitoring_release:
- released_outfalls: array of outfall IDs released (e.g., ["002", "003"])

For wet_suspension:
- test_types: array of test types suspended (e.g., ["acute", "chronic"])

For transfer:
- from_entity: previous permit holder name
- to_entity: new permit holder name

For selenium_compliance:
- monitoring_period: the reporting period covered

RESPOND WITH ONLY A JSON OBJECT (no markdown, no explanation, no code fences):

{
  "document_type": "one of the 14 types above",
  "permit_number": "string or null",
  "state": "two-letter code or null",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "summary": "brief description",
  ... type-specific fields as listed above ...
}

IMPORTANT RULES:
- document_type is REQUIRED — always classify the document
- effective_date is REQUIRED — every document has a date. Use the letter date, issuance date, or document date if there is no explicit "effective date" field. Never return null for effective_date.
- If you cannot find a permit number, set permit_number to null (do not guess)
- For limits: include ALL limits from ALL outfalls — do not summarize or skip any
- Distinguish between daily maximum, monthly average, instantaneous maximum
- For pH, capture as range (e.g., "6.0-9.0 S.U.")
- Set limit_count to the total number of limit entries extracted
- If the document does not contain limit tables, omit limits/outfall_count/limit_count entirely`;

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

/** Generate a signed URL for a storage file. */
async function getSignedUrl(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message ?? "no URL returned"}`);
  }

  return data.signedUrl;
}

/** Download a PDF from storage via Supabase client (service role) and return as base64. */
async function downloadPdfAsBase64(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Failed to download PDF: ${error?.message ?? "no data returned"}`);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return encodeBase64(bytes);
}

/** Download a PDF, trim to maxPages, and return as base64.
 *  Uses pdf-lib to copy only the first N pages into a new document. */
async function downloadAndTrimPdf(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  maxPages: number = 100,
): Promise<{ base64: string; totalPages: number; keptPages: number }> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Failed to download PDF: ${error?.message ?? "no data returned"}`);
  }

  const pdfBytes = new Uint8Array(await data.arrayBuffer());
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();
  const keptPages = Math.min(totalPages, maxPages);

  if (totalPages <= maxPages) {
    // No trimming needed
    return { base64: encodeBase64(pdfBytes), totalPages, keptPages };
  }

  console.log(`[parse-permit-pdf] Trimming PDF from ${totalPages} to ${keptPages} pages`);

  const trimmedDoc = await PDFDocument.create();
  const pageIndices = Array.from({ length: keptPages }, (_, i) => i);
  const copiedPages = await trimmedDoc.copyPages(srcDoc, pageIndices);
  for (const page of copiedPages) {
    trimmedDoc.addPage(page);
  }

  const trimmedBytes = await trimmedDoc.save();
  return { base64: encodeBase64(new Uint8Array(trimmedBytes)), totalPages, keptPages };
}

/** Document source for Claude API — either URL or base64. */
type PdfSource =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: "application/pdf"; data: string };

/** Call Claude API with PDF (via URL or base64) for structured extraction. */
async function extractPermitData(
  source: PdfSource,
  fileName: string,
): Promise<ExtractedPermitData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  const mode = source.type === "url" ? "URL" : "base64";

  try {
    console.log("[parse-permit-pdf] Calling Claude API for", fileName, `(via ${mode})`);

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
                source,
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
      const lastCompleteEntry = jsonStr.lastIndexOf("}");
      if (lastCompleteEntry > 0) {
        const truncated = jsonStr.slice(0, lastCompleteEntry + 1);
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
      throw new Error("Claude API timed out after 120 seconds");
    }
    throw err;
  }
}

/** Classify errors into strings that match ErrorForensics.tsx patterns.
 *  Always includes the raw error as second element for diagnostics. */
function classifyError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const raw = message.length > 800 ? message.slice(0, 800) + "..." : message;

  if (lower.includes("password") || lower.includes("encrypted")) {
    return ["File is password protected. Please upload an unlocked version.", raw];
  }

  // Don't match "invalid_request_error" (generic API error type) as file corruption
  const isApiErrorType = lower.includes("invalid_request_error");
  if (!isApiErrorType && (lower.includes("invalid") || lower.includes("corrupt") || lower.includes("malformed"))) {
    return ["File appears to be corrupt or is not a valid PDF document.", raw];
  }

  if (lower.includes("too many pages") || lower.includes("page limit") || lower.includes("exceeds") && lower.includes("page")) {
    return ["Document exceeds the 100-page limit. Large scanned documents may need to be split.", raw];
  }

  if (lower.includes("request size") || lower.includes("too large") || lower.includes("payload")) {
    return ["Document is too large for processing. Try a smaller or lower-resolution version.", raw];
  }

  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("timed out")) {
    return ["Processing timed out. The document may be too large or complex.", raw];
  }

  if (lower.includes("overloaded") || lower.includes("rate limit") || lower.includes("429")) {
    return ["AI processing service is temporarily overloaded. Please retry in a few minutes.", raw];
  }

  if (lower.includes("worker") || lower.includes("compute") || lower.includes("resource") || lower.includes("memory")) {
    return ["Edge Function ran out of compute resources. The file may be too large for server-side processing.", raw];
  }

  return [raw];
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

const VALID_STATES = ["AL", "KY", "TN", "VA", "WV"];

async function markParsed(
  supabase: ReturnType<typeof createClient>,
  queueId: string,
  extractedData: ExtractedPermitData,
  currentStateCode: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  // Auto-fill state_code from extraction if missing on upload
  const extractedState = extractedData.state?.toUpperCase() ?? null;
  const shouldFillState = !currentStateCode && extractedState && VALID_STATES.includes(extractedState);

  // records_extracted depends on document type
  const docType = extractedData.document_type;
  const hasLimits = ["original_permit", "renewal", "draft_permit", "tsmp_permit", "modification"].includes(docType);
  const recordCount = hasLimits
    ? (extractedData.limit_count ?? extractedData.limits?.length ?? 0)
    : 1; // Non-limit documents count as 1 processed record

  const updateData: Record<string, unknown> = {
    status: "parsed",
    extracted_data: extractedData,
    records_extracted: recordCount,
    processing_completed_at: now,
    updated_at: now,
  };

  if (shouldFillState) {
    updateData.state_code = extractedState;
    console.log("[parse-permit-pdf] Auto-filled state_code:", extractedState);
  }

  const { error } = await supabase
    .from("file_processing_queue")
    .update(updateData)
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
      "id, storage_bucket, storage_path, file_name, file_size_bytes, file_category, state_code, status, uploaded_by",
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
    // 7. Generate signed URL for the PDF
    const fileSize = queueEntry.file_size_bytes ?? 0;
    console.log(
      "[parse-permit-pdf] Creating signed URL for",
      queueEntry.file_name,
      `(${(fileSize / 1024 / 1024).toFixed(1)}MB)`,
    );
    const pdfUrl = await getSignedUrl(
      supabase,
      queueEntry.storage_bucket,
      queueEntry.storage_path,
    );

    // 8. URL-first extraction (Claude fetches the PDF — no Edge Function memory pressure)
    //    Falls back to trimmed base64 for >100-page PDFs, plain base64 for small files.
    let extractedData: ExtractedPermitData;
    let pageTrimWarning: string | null = null;
    try {
      extractedData = await extractPermitData(
        { type: "url", url: pdfUrl },
        queueEntry.file_name,
      );
    } catch (urlErr) {
      const urlErrMsg = urlErr instanceof Error ? urlErr.message : String(urlErr);
      const isPageLimit = /100 pdf pages|page limit|too many pages/i.test(urlErrMsg);

      if (isPageLimit) {
        // PDF exceeds 100-page API limit — download, trim to 30 pages (key permit data
        // is in the first 20-30 pages; rest is appendices/fact sheets), retry as base64.
        // Using 30 instead of 100 also keeps memory usage low to avoid WORKER_LIMIT.
        const MAX_TRIMMED_PAGES = 30;
        console.log(
          "[parse-permit-pdf] PDF exceeds 100-page limit. Downloading and trimming to",
          MAX_TRIMMED_PAGES, "pages...",
        );
        const { base64, totalPages, keptPages } = await downloadAndTrimPdf(
          supabase,
          queueEntry.storage_bucket,
          queueEntry.storage_path,
          MAX_TRIMMED_PAGES,
        );
        pageTrimWarning = `Document has ${totalPages} pages. Only the first ${keptPages} pages were processed to stay within resource limits. Appendices and fact sheets may not be included.`;
        extractedData = await extractPermitData(
          { type: "base64", media_type: "application/pdf", data: base64 },
          queueEntry.file_name,
        );
      } else if (fileSize <= BASE64_MAX_BYTES) {
        // Small file — try plain base64 fallback
        console.log(
          "[parse-permit-pdf] URL extraction failed, trying base64 fallback.",
          "File size:", fileSize, "bytes. Error:", urlErrMsg,
        );
        const pdfBase64 = await downloadPdfAsBase64(
          supabase,
          queueEntry.storage_bucket,
          queueEntry.storage_path,
        );
        extractedData = await extractPermitData(
          { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          queueEntry.file_name,
        );
      } else {
        throw urlErr; // Too large for base64 — surface the real error
      }
    }

    // 9. Fallback: extract effective_date from filename if Claude missed it
    // Filenames follow pattern: PERMITNUMBER-YYYY-MMDD description.pdf
    if (!extractedData.effective_date) {
      const dateMatch = queueEntry.file_name.match(/(\d{4})-(\d{2})(\d{2})/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        extractedData.effective_date = `${year}-${month}-${day}`;
        console.log("[parse-permit-pdf] Filled effective_date from filename:", extractedData.effective_date);
      }
    }

    // 10. Handle missing permit number (still useful data, mark parsed with warning)
    if (!extractedData.permit_number) {
      console.warn("[parse-permit-pdf] No permit number found in", queueEntry.file_name);

      const now = new Date().toISOString();
      const extractedState = extractedData.state?.toUpperCase() ?? null;
      const shouldFillState = !queueEntry.state_code && extractedState && VALID_STATES.includes(extractedState);

      const docType = extractedData.document_type;
      const hasLimits = ["original_permit", "renewal", "draft_permit", "tsmp_permit", "modification"].includes(docType);
      const recordCount = hasLimits
        ? (extractedData.limit_count ?? extractedData.limits?.length ?? 0)
        : 1;

      const warnings = [
        "No permit number found in this document. Please verify this is an NPDES permit.",
      ];
      if (pageTrimWarning) warnings.push(pageTrimWarning);

      const updateData: Record<string, unknown> = {
        status: "parsed",
        extracted_data: extractedData,
        records_extracted: recordCount,
        error_log: warnings,
        processing_completed_at: now,
        updated_at: now,
      };
      if (shouldFillState) updateData.state_code = extractedState;

      await supabase
        .from("file_processing_queue")
        .update(updateData)
        .eq("id", queueId);
    } else {
      // 13. Full success
      await markParsed(supabase, queueId, extractedData, queueEntry.state_code);

      // Store page-trim warning if applicable
      if (pageTrimWarning) {
        await supabase
          .from("file_processing_queue")
          .update({ error_log: [pageTrimWarning] })
          .eq("id", queueId);
      }
    }

    console.log(
      "[parse-permit-pdf] Success:",
      queueEntry.file_name,
      "| Type:",
      extractedData.document_type,
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

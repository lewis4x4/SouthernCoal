import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  downloadQueueFile,
  jsonResponse,
  loadLabQueueEntry,
  markFailed,
  markParsed,
  markProcessing,
  validateLabQueueEntry,
  verifyLabParserAuth,
} from "../_shared/lab-parser-queue.ts";
import { parseVaLabFileContent } from "../_shared/va-lab-fixed-width.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_RECORDS_IN_EXTRACTED = 5_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const userId = await verifyLabParserAuth(req, supabase);
  if (!userId) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401, corsHeaders);
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405, corsHeaders);
  }

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
      corsHeaders,
    );
  }

  const { entry, error: loadError } = await loadLabQueueEntry(supabase, queueId);
  if (!entry) {
    return jsonResponse({ success: false, error: loadError ?? "Not found" }, 404, corsHeaders);
  }

  const validationError = validateLabQueueEntry(entry);
  if (validationError) {
    const status = validationError.includes("status") ? 409 : 400;
    return jsonResponse({ success: false, error: validationError }, status, corsHeaders);
  }

  await markProcessing(supabase, queueId);

  try {
    const buffer = await downloadQueueFile(supabase, entry);
    const text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
    const { extracted, formatDetected } = parseVaLabFileContent(text);

    if (extracted.parsed_rows === 0) {
      const errMsg = extracted.validation_errors[0]?.message ??
        "No records parsed — VA lab file shape validation failed.";
      await markFailed(supabase, queueId, [errMsg, ...extracted.warnings]);
      return jsonResponse({
        success: false,
        error: errMsg,
        format_detected: formatDetected,
        warnings: extracted.warnings,
      }, 422, corsHeaders);
    }

    const recordsTruncated = extracted.records.length > MAX_RECORDS_IN_EXTRACTED;
    const stored = recordsTruncated
      ? {
        ...extracted,
        records: extracted.records.slice(0, MAX_RECORDS_IN_EXTRACTED),
        records_truncated: true,
        warnings: [
          ...extracted.warnings,
          `Records truncated to ${MAX_RECORDS_IN_EXTRACTED} in preview.`,
        ],
      }
      : extracted;

    await markParsed(
      supabase,
      queueId,
      stored as Record<string, unknown>,
      extracted.parsed_rows,
      entry.state_code,
      stored.warnings,
    );

    return jsonResponse({
      success: true,
      queue_id: queueId,
      format_detected: formatDetected,
      parsed_rows: extracted.parsed_rows,
      warnings: stored.warnings,
    }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(supabase, queueId, [message.slice(0, 800)]);
    return jsonResponse({ success: false, error: message.slice(0, 800) }, 500, corsHeaders);
  }
});

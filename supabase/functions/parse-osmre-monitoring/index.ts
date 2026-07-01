import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
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
import { parseOsmreMonitoringSheets, type OsmreSheetInput } from "../_shared/osmre-monitoring-parse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_RECORDS_IN_EXTRACTED = 5_000;

function workbookToSheets(fileBytes: Uint8Array): OsmreSheetInput[] {
  const workbook = XLSX.read(fileBytes, { type: "array" });
  if (!workbook.SheetNames.length) {
    throw new Error("No worksheet found in this file.");
  }

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]!;
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return {
      name,
      rows: rows.map((row) =>
        (row as unknown[]).map((cell) => {
          if (cell == null) return "";
          return String(cell);
        })
      ),
    };
  });
}

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
  let preParsedSheets: OsmreSheetInput[] | null = null;
  try {
    const body = await req.json();
    queueId = body.queue_id;
    if (!queueId || typeof queueId !== "string") {
      throw new Error("queue_id is required");
    }
    if (Array.isArray(body.pre_parsed_sheets)) {
      preParsedSheets = body.pre_parsed_sheets as OsmreSheetInput[];
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
    let sheets: OsmreSheetInput[];
    if (preParsedSheets && preParsedSheets.length > 0) {
      sheets = preParsedSheets;
    } else {
      const buffer = await downloadQueueFile(supabase, entry);
      sheets = workbookToSheets(new Uint8Array(buffer));
    }

    const { extracted, sheetsParsed, sheetsSkipped } = parseOsmreMonitoringSheets(sheets);

    if (extracted.parsed_rows === 0) {
      const errMsg = extracted.validation_errors[0]?.message ??
        "No records parsed — OSMRE workbook shape validation failed.";
      await markFailed(supabase, queueId, [errMsg, ...extracted.warnings]);
      return jsonResponse({
        success: false,
        error: errMsg,
        sheets_parsed: sheetsParsed,
        sheets_skipped: sheetsSkipped,
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
      entry.state_code ?? "TN",
      stored.warnings,
    );

    return jsonResponse({
      success: true,
      queue_id: queueId,
      parsed_rows: extracted.parsed_rows,
      sheets_parsed: sheetsParsed,
      sheets_skipped: sheetsSkipped,
      warnings: stored.warnings,
    }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(supabase, queueId, [message.slice(0, 800)]);
    return jsonResponse({ success: false, error: message.slice(0, 800) }, 500, corsHeaders);
  }
});

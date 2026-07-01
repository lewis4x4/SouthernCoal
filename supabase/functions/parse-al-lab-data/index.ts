import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsHeaders } from "../_shared/cors.ts";
import {
  parseAlLabCsvContent,
  parseAlLabSheets,
  type AlSheetInput,
} from "../_shared/al-lab-parse.ts";
import {
  aliasSourceForDocumentType,
  applyEnrichmentToExtracted,
  enrichLabImportRecords,
} from "../_shared/lab-record-enrichment.ts";
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_RECORDS_IN_EXTRACTED = 5_000;

function workbookToSheets(fileBytes: Uint8Array): AlSheetInput[] {
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

function detectFileFormat(fileName: string): "csv" | "xlsx" | "xls" {
  if (/\.csv$/i.test(fileName)) return "csv";
  if (/\.xls$/i.test(fileName) && !/\.xlsx$/i.test(fileName)) return "xls";
  return "xlsx";
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
  let preParsedSheets: AlSheetInput[] | null = null;
  try {
    const body = await req.json();
    queueId = body.queue_id;
    if (!queueId || typeof queueId !== "string") {
      throw new Error("queue_id is required");
    }
    if (Array.isArray(body.pre_parsed_sheets)) {
      preParsedSheets = body.pre_parsed_sheets as AlSheetInput[];
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

  const fileFormat = detectFileFormat(entry.file_name);
  const fileHint = `${entry.file_name} ${entry.storage_path}`;

  try {
    let result;
    if (preParsedSheets && preParsedSheets.length > 0) {
      result = parseAlLabSheets({ sheets: preParsedSheets, fileHint, fileFormat });
    } else {
      const buffer = await downloadQueueFile(supabase, entry);
      if (fileFormat === "csv") {
        const text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
        result = parseAlLabCsvContent(text, fileHint);
      } else {
        result = parseAlLabSheets({
          sheets: workbookToSheets(new Uint8Array(buffer)),
          fileHint,
          fileFormat,
        });
      }
    }

    const { extracted: parsed, formatDetected, sheetsParsed, sheetsSkipped } = result;

    let extracted = parsed;
    if (entry.organization_id) {
      const enrichment = await enrichLabImportRecords(
        supabase,
        entry.organization_id,
        parsed.records,
        {
          persistOutfallAliases: true,
          aliasSource: aliasSourceForDocumentType(parsed.document_type),
        },
      );
      extracted = applyEnrichmentToExtracted(parsed, enrichment);
    }

    if (extracted.parsed_rows === 0) {
      const errMsg = extracted.validation_errors[0]?.message ??
        "No records parsed — AL lab file shape validation failed.";
      await markFailed(supabase, queueId, [errMsg, ...extracted.warnings]);
      return jsonResponse({
        success: false,
        error: errMsg,
        format_detected: formatDetected,
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
      entry.state_code ?? "AL",
      stored.warnings,
    );

    return jsonResponse({
      success: true,
      queue_id: queueId,
      format_detected: formatDetected,
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsHeaders } from "../_shared/cors.ts";
import { isPrivilegedOrAnonymousJwt } from "../_shared/auth.ts";
import { markFailed, markParsed, markProcessing } from "../_shared/queue-status.ts";
import {
  parseMatrixObjects,
  resolveSamplingMatrixRows,
  rowsToMatrixObjects,
  type SamplingMatrixExtracted,
} from "../_shared/sampling-matrix-parse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyAuth(req: Request, supabase: SupabaseClient): Promise<{
  userId: string;
  organizationId: string;
} | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  if (isPrivilegedOrAnonymousJwt(token)) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) return null;
  return { userId: user.id, organizationId: profile.organization_id };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    const next = text[i + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      i += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  row.push(current);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  return rows;
}

function parseWorkbook(bytes: Uint8Array, fileName: string): {
  format: SamplingMatrixExtracted["file_format"];
  objects: Record<string, unknown>[];
} {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { format: "csv", objects: rowsToMatrixObjects(parseCsv(text)) };
  }

  const workbook = XLSX.read(bytes, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no worksheets.");
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
  const format: SamplingMatrixExtracted["file_format"] = lower.endsWith(".xls") ? "xls" : "xlsx";
  return { format, objects: rowsToMatrixObjects(matrix) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await verifyAuth(req, supabase);
  if (!auth) return jsonResponse({ success: false, error: "Unauthorized" }, 401);

  let queueId = "";
  try {
    const body = await req.json();
    queueId = body.queue_id;
    if (!queueId) return jsonResponse({ success: false, error: "queue_id required" }, 400);

    const { data: entry, error: fetchError } = await supabase
      .from("file_processing_queue")
      .select("*")
      .eq("id", queueId)
      .single();

    if (fetchError || !entry) {
      return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
    }
    if (entry.organization_id !== auth.organizationId) {
      return jsonResponse({ success: false, error: "Access denied" }, 403);
    }
    if (entry.file_category !== "sampling_matrix") {
      return jsonResponse({ success: false, error: "Invalid file_category for sampling matrix parser" }, 400);
    }
    if (!["queued", "failed"].includes(entry.status)) {
      return jsonResponse({ success: false, error: `Invalid status: ${entry.status}` }, 409);
    }
    if (entry.file_size_bytes > MAX_FILE_SIZE) {
      await markFailed(supabase, queueId, ["File exceeds 25MB limit."]);
      return jsonResponse({ success: false, error: "File too large" }, 400);
    }

    await markProcessing(supabase, queueId);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(entry.storage_bucket)
      .download(entry.storage_path);

    if (downloadError || !fileData) {
      const message = downloadError?.message ?? "Download failed";
      await markFailed(supabase, queueId, [message]);
      return jsonResponse({ success: false, error: message }, 500);
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const { format, objects } = parseWorkbook(bytes, entry.file_name);
    let extracted = parseMatrixObjects(objects, format);

    if (extracted.summary.total_rows === 0) {
      const err = extracted.validation_errors[0]?.message ?? "No parseable rows found.";
      await markFailed(supabase, queueId, [err, ...extracted.warnings]);
      return jsonResponse({ success: false, error: err }, 422);
    }

    extracted = await resolveSamplingMatrixRows(supabase, auth.organizationId, extracted);

    await markParsed(
      supabase,
      queueId,
      extracted as unknown as Record<string, unknown>,
      extracted.summary.total_rows,
      entry.state_code,
      extracted.warnings,
    );

    return jsonResponse({
      success: true,
      queue_id: queueId,
      summary: extracted.summary,
      draft_label: extracted.draft_label,
      warnings: extracted.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (queueId) await markFailed(supabase, queueId, [message.slice(0, 800)]);
    return jsonResponse({ success: false, error: message.slice(0, 800) }, 500);
  }
});

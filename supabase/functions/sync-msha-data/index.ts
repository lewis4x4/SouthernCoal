import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzip } from "https://esm.sh/unzipit@1.4.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  isWithinLookback,
  mapMshaViolationRow,
  MSHA_VIOLATIONS_ZIP_URL,
  parseMshaViolationLine,
  stripField,
} from "../_shared/msha-violations.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";
const MSHA_MINE_ID_MAP = Deno.env.get("MSHA_MINE_ID_MAP") ?? "";

const ALLOWED_ROLES = [
  "admin",
  "executive",
  "environmental_manager",
  "safety_manager",
  "coo",
  "compliance_reviewer",
];

const UPSERT_BATCH_SIZE = 100;
const DEFAULT_LOOKBACK_YEARS = 5;

interface AuthResult {
  authorized: boolean;
  userId: string | null;
}

interface SyncRequestBody {
  sync_type?: "manual" | "scheduled";
  lookback_years?: number;
  dry_run?: boolean;
  run_tag?: string;
}

async function validateAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<AuthResult> {
  const secret = req.headers.get("x-internal-secret");
  if (secret && SYNC_INTERNAL_SECRET && secret === SYNC_INTERNAL_SECRET) {
    return { authorized: true, userId: null };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { authorized: false, userId: null };
  }

  const token = authHeader.replace("Bearer ", "");
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
    return { authorized: true, userId: null };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { authorized: false, userId: null };

  const { data: roles } = await supabase
    .from("user_role_assignments")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames: string[] = [];
  for (const row of roles ?? []) {
    const name = row.roles && typeof row.roles === "object" && "name" in row.roles
      ? String((row.roles as { name: string }).name)
      : "";
    if (name) roleNames.push(name);
  }

  if (!roleNames.some((r) => ALLOWED_ROLES.includes(r))) {
    return { authorized: false, userId: null };
  }

  return { authorized: true, userId: user.id };
}

function parseMineIdMap(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as Record<string, string>;
  const normalized: Record<string, string> = {};
  for (const [mineId, orgId] of Object.entries(parsed)) {
    normalized[stripField(mineId)] = stripField(orgId);
  }
  return normalized;
}

async function flushBatch(
  supabase: ReturnType<typeof createClient>,
  batch: ReturnType<typeof mapMshaViolationRow>[],
): Promise<{ upserted: number; failed: number }> {
  const rows = batch.filter((row): row is NonNullable<typeof row> => row !== null);
  if (rows.length === 0) return { upserted: 0, failed: 0 };

  const { error } = await supabase
    .from("external_msha_inspections")
    .upsert(rows, { onConflict: "organization_id,mine_id,violation_number" });

  if (error) {
    console.error("[sync-msha] batch upsert failed:", error.message);
    return { upserted: 0, failed: rows.length };
  }

  return { upserted: rows.length, failed: 0 };
}

async function streamViolations(
  blob: Blob,
  mineIdMap: Record<string, string>,
  lookbackYears: number,
  onBatch: (rows: ReturnType<typeof mapMshaViolationRow>[]) => Promise<void>,
): Promise<{ scanned: number; matched: number; skippedLookback: number }> {
  const mineIds = new Set(Object.keys(mineIdMap));
  const { entries } = await unzip(blob);
  const entry = entries.find((item) => item.name.toLowerCase().endsWith("violations.txt"));

  if (!entry) {
    throw new Error("Violations.txt not found in MSHA archive");
  }

  let scanned = 0;
  let matched = 0;
  let skippedLookback = 0;
  let headerSkipped = false;
  let buffer = "";
  let batch: ReturnType<typeof mapMshaViolationRow>[] = [];

  for await (const chunk of entry.read()) {
    buffer += new TextDecoder().decode(chunk);
    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);

      if (!headerSkipped) {
        headerSkipped = true;
      } else {
        scanned += 1;
        const parsed = parseMshaViolationLine(line);
        if (parsed) {
          const mineId = stripField(parsed.MINE_ID);
          if (mineIds.has(mineId)) {
            const orgId = mineIdMap[mineId];
            if (!orgId) continue;
            const mappedIssue = mapMshaViolationRow(parsed, orgId);
            if (mappedIssue && isWithinLookback(mappedIssue.violation_issue_date, lookbackYears)) {
              matched += 1;
              batch.push(mappedIssue);
              if (batch.length >= UPSERT_BATCH_SIZE) {
                await onBatch(batch);
                batch = [];
              }
            } else {
              skippedLookback += 1;
            }
          }
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.trim()) {
    const parsed = parseMshaViolationLine(buffer.trim());
    if (parsed) {
      scanned += 1;
      const mineId = stripField(parsed.MINE_ID);
      if (mineIds.has(mineId)) {
        const orgId = mineIdMap[mineId];
        if (orgId) {
          const mapped = mapMshaViolationRow(parsed, orgId);
          if (mapped && isWithinLookback(mapped.violation_issue_date, lookbackYears)) {
            matched += 1;
            batch.push(mapped);
          } else {
            skippedLookback += 1;
          }
        }
      }
    }
  }

  if (batch.length > 0) {
    await onBatch(batch);
  }

  return { scanned, matched, skippedLookback };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await validateAuth(req, supabase);

  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: SyncRequestBody = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text) body = JSON.parse(text) as SyncRequestBody;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const syncType = body.sync_type ?? "manual";
  const lookbackYears = body.lookback_years ?? DEFAULT_LOOKBACK_YEARS;
  const runTag = body.run_tag ?? (syncType === "scheduled" ? "cron-weekly-msha" : "manual-msha");

  if (!MSHA_MINE_ID_MAP) {
    await supabase.from("external_sync_log").insert({
      source: "msha",
      sync_type: syncType,
      status: "failed",
      completed_at: new Date().toISOString(),
      records_synced: 0,
      records_failed: 0,
      error_details: { reason: "MSHA mine ID mapping not configured", run_tag: runTag },
    });

    await supabase.from("audit_log").insert({
      user_id: auth.userId,
      action: "external_sync_failed",
      module: "external_data",
      description: JSON.stringify({
        source: "msha",
        reason: "MSHA_MINE_ID_MAP env var not set. Contact admin to configure mine IDs.",
      }),
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: "MSHA sync requires mine ID mapping. Contact admin to configure.",
        hint: 'Set MSHA_MINE_ID_MAP as JSON: {"4601432":"<org_uuid>", ...}',
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let mineIdMap: Record<string, string>;
  try {
    mineIdMap = parseMineIdMap(MSHA_MINE_ID_MAP);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid MSHA_MINE_ID_MAP format. Expected JSON object." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const configuredMineIds = Object.keys(mineIdMap);
  if (configuredMineIds.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "MSHA_MINE_ID_MAP is empty." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const orgIds = [...new Set(Object.values(mineIdMap))];
  const primaryOrgId = orgIds[0] ?? null;

  if (body.dry_run) {
    return new Response(
      JSON.stringify({
        success: true,
        dry_run: true,
        source: "msha",
        configured_mine_ids: configuredMineIds,
        organization_ids: orgIds,
        lookback_years: lookbackYears,
        dataset_url: MSHA_VIOLATIONS_ZIP_URL,
        run_tag: runTag,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: syncLog, error: syncLogError } = await supabase
    .from("external_sync_log")
    .insert({
      organization_id: primaryOrgId,
      source: "msha",
      sync_type: syncType,
      status: "running",
      triggered_by: auth.userId,
      metadata: { run_tag: runTag, lookback_years: lookbackYears, mine_ids: configuredMineIds },
    })
    .select("id")
    .single();

  if (syncLogError || !syncLog) {
    return new Response(
      JSON.stringify({ success: false, error: "Failed to create sync log" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let recordsSynced = 0;
  let recordsFailed = 0;
  let rowsScanned = 0;
  let rowsMatched = 0;
  let rowsSkippedLookback = 0;
  const errors: string[] = [];

  try {
    console.log(`[sync-msha] downloading ${MSHA_VIOLATIONS_ZIP_URL}`);
    const downloadResp = await fetch(MSHA_VIOLATIONS_ZIP_URL);
    if (!downloadResp.ok) {
      throw new Error(`MSHA download failed: HTTP ${downloadResp.status}`);
    }

    const archiveBlob = await downloadResp.blob();
    console.log(`[sync-msha] archive size ${archiveBlob.size} bytes; streaming violations`);

    const streamStats = await streamViolations(
      archiveBlob,
      mineIdMap,
      lookbackYears,
      async (batch) => {
        const result = await flushBatch(supabase, batch);
        recordsSynced += result.upserted;
        recordsFailed += result.failed;
      },
    );

    rowsScanned = streamStats.scanned;
    rowsMatched = streamStats.matched;
    rowsSkippedLookback = streamStats.skippedLookback;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    console.error("[sync-msha]", message);
  }

  const finalStatus = errors.length > 0 && recordsSynced === 0 ? "failed" : "completed";

  await supabase
    .from("external_sync_log")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      error_details: errors.length > 0
        ? {
          errors,
          rows_scanned: rowsScanned,
          rows_matched: rowsMatched,
          rows_skipped_lookback: rowsSkippedLookback,
        }
        : {
          rows_scanned: rowsScanned,
          rows_matched: rowsMatched,
          rows_skipped_lookback: rowsSkippedLookback,
        },
    })
    .eq("id", syncLog.id);

  await supabase.from("audit_log").insert({
    user_id: auth.userId,
    organization_id: primaryOrgId,
    action: finalStatus === "completed" ? "external_sync_completed" : "external_sync_failed",
    module: "external_data",
    table_name: "external_sync_log",
    record_id: syncLog.id,
    description: JSON.stringify({
      source: "msha",
      run_tag: runTag,
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      rows_scanned: rowsScanned,
      rows_matched: rowsMatched,
    }),
  });

  return new Response(
    JSON.stringify({
      success: finalStatus === "completed",
      source: "msha",
      recordsSynced,
      recordsFailed,
      rowsScanned,
      rowsMatched,
      rowsSkippedLookback,
      configuredMineIds,
      errors,
      sync_log_id: syncLog.id,
    }),
    {
      status: finalStatus === "completed" ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

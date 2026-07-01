import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { readZipTextEntry } from "../_shared/msha-zip.ts";
import {
  isJusticeController,
  MSHA_MINES_ZIP_URL,
  parseMshaMineLine,
  resolveOperatorToOrgId,
  stripField,
  toParsedMineRecord,
  type ParsedMineRecord,
  type SubsidiaryOrgRow,
} from "../_shared/msha-mine-map.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

interface RequestBody {
  action?: "refresh" | "reconcile";
  run_tag?: string;
  dry_run?: boolean;
}

async function validateAuth(req: Request, supabase: ReturnType<typeof createClient>) {
  const secret = req.headers.get("x-internal-secret");
  if (secret && SYNC_INTERNAL_SECRET && secret === SYNC_INTERNAL_SECRET) {
    return { ok: true, userId: null as string | null };
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, userId: null };
  const token = authHeader.replace("Bearer ", "");
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: true, userId: null };
  }
  const { data: { user } } = await supabase.auth.getUser(token);
  return { ok: !!user, userId: user?.id ?? null };
}

async function streamMines(blob: Blob): Promise<ParsedMineRecord[]> {
  const text = await readZipTextEntry(blob, (name) => name.endsWith("mines.txt"));
  const records: ParsedMineRecord[] = [];
  let headerSkipped = false;

  for (const line of text.split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed) continue;
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const parsed = parseMshaMineLine(trimmed);
    if (parsed && stripField(parsed.COAL_METAL_IND).toUpperCase() === "C") {
      records.push(toParsedMineRecord(parsed));
    }
  }

  return records;
}

Deno.serve(async (req) => {
  try {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await validateAuth(req, supabase);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody = { action: "refresh" };
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = body.action ?? "refresh";
  const runTag = body.run_tag ?? (action === "reconcile" ? "reconcile-manual" : "refresh-manual");

  const [{ data: allowlistRows }, { data: subsidiaryRows }, { data: overrideRows }, { data: beforeMap }] =
    await Promise.all([
      supabase.from("msha_controller_allowlist").select("controller_id"),
      supabase.from("msha_subsidiary_org").select("subsidiary_name, organization_id, normalized_name"),
      supabase.from("msha_mine_org_override").select("mine_id, organization_id"),
      supabase.from("msha_mine_org_map").select("mine_id, organization_id, operator_name, controller_id, mine_status, is_active"),
    ]);

  const allowlist = new Set((allowlistRows ?? []).map((r) => stripField(r.controller_id).toUpperCase()));
  const subsidiaries = (subsidiaryRows ?? []) as SubsidiaryOrgRow[];
  const overrides = new Map((overrideRows ?? []).map((r) => [r.mine_id, r.organization_id]));
  const beforeByMine = new Map((beforeMap ?? []).map((r) => [r.mine_id, r]));

  const downloadResp = await fetch(MSHA_MINES_ZIP_URL);
  if (!downloadResp.ok) {
    return new Response(JSON.stringify({ error: `MSHA Mines download failed: ${downloadResp.status}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const records = await streamMines(await downloadResp.blob());
  const justiceSeen = new Set<string>();
  let mapped = 0;
  let review = 0;
  let overridesApplied = 0;
  let deactivated = 0;
  const drift: Record<string, unknown> = {
    operator_changes: [] as unknown[],
    newly_review: [] as unknown[],
    newly_deactivated: [] as unknown[],
  };

  for (const mine of records) {
    if (!mine.mine_id || !isJusticeController(mine.controller_id, allowlist)) continue;
    justiceSeen.add(mine.mine_id);

    const overrideOrg = overrides.get(mine.mine_id);
    const derivedOrg = overrideOrg ?? resolveOperatorToOrgId(mine.operator_name, subsidiaries);
    const now = new Date().toISOString();

    if (derivedOrg) {
      if (overrideOrg) overridesApplied += 1;
      const before = beforeByMine.get(mine.mine_id);
      if (before && before.organization_id !== derivedOrg) {
        (drift.operator_changes as unknown[]).push({
          mine_id: mine.mine_id,
          from_org: before.organization_id,
          to_org: derivedOrg,
        });
      }

      if (!body.dry_run) {
        await supabase.from("msha_mine_org_map").upsert({
          mine_id: mine.mine_id,
          organization_id: derivedOrg,
          operator_name: mine.operator_name,
          controller_id: mine.controller_id,
          mine_name: mine.mine_name,
          state: mine.state,
          mine_status: mine.mine_status,
          source: overrideOrg ? "override" : "derived",
          is_active: true,
          last_seen: now,
        }, { onConflict: "mine_id" });

        await supabase.from("msha_mine_review").delete().eq("mine_id", mine.mine_id);
      }
      mapped += 1;
    } else {
      if (!body.dry_run) {
        await supabase.from("msha_mine_review").upsert({
          mine_id: mine.mine_id,
          operator_name: mine.operator_name,
          controller_id: mine.controller_id,
          mine_name: mine.mine_name,
          state: mine.state,
          mine_status: mine.mine_status,
          last_seen: now,
        }, { onConflict: "mine_id" });
      }
      if (!beforeByMine.has(mine.mine_id)) {
        (drift.newly_review as unknown[]).push({ mine_id: mine.mine_id, operator_name: mine.operator_name });
      }
      review += 1;
    }
  }

  const toDeactivate = (beforeMap ?? []).filter(
    (row) => row.is_active && !justiceSeen.has(row.mine_id) && !overrides.has(row.mine_id),
  );

  for (const row of toDeactivate) {
    (drift.newly_deactivated as unknown[]).push({ mine_id: row.mine_id, operator_name: row.operator_name });
    if (!body.dry_run) {
      await supabase.from("msha_mine_org_map")
        .update({ is_active: false, last_seen: new Date().toISOString() })
        .eq("mine_id", row.mine_id);
    }
    deactivated += 1;
  }

  const summary = {
    run_tag: runTag,
    action,
    scanned_coal_mines: records.length,
    justice_coal_mines: justiceSeen.size,
    mapped,
    review,
    overrides_applied: overridesApplied,
    deactivated,
    drift,
  };

  if (!body.dry_run) {
    await supabase.from("msha_map_drift_log").insert({
      run_type: action,
      status: "completed",
      summary,
    });

    await supabase.from("audit_log").insert({
      user_id: auth.userId,
      action: action === "reconcile" ? "msha_map_reconciled" : "msha_map_refreshed",
      module: "external_data",
      description: JSON.stringify(summary),
    });
  }

  return new Response(JSON.stringify({ success: true, ...summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[refresh-msha-mine-map]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

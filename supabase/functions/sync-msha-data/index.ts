import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";
const MSHA_MINE_ID_MAP = Deno.env.get("MSHA_MINE_ID_MAP") ?? "";

// ---------------------------------------------------------------------------
// Auth — internal secret only
// ---------------------------------------------------------------------------
function validateAuth(req: Request): boolean {
  const secret = req.headers.get("x-internal-secret");
  return !!SYNC_INTERNAL_SECRET && secret === SYNC_INTERNAL_SECRET;
}

// ---------------------------------------------------------------------------
// TODO: Full MSHA sync pipeline (implement when Tom provides mine IDs)
//
// 1. Parse MSHA_MINE_ID_MAP env var: JSON object mapping mine_id → org_id
//    Example: {"4601432":"<org-uuid>","4601433":"<org-uuid>"}
//
// 2. Download current MSHA data from:
//    https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA/MinesProdData/Violations.zip
//    (tab-delimited TSV inside zip, published weekly on Fridays)
//
// 3. Extract zip, parse TSV, filter rows where MINE_ID is in our map
//
// 4. For each matching row, upsert into external_msha_inspections:
//    - mine_id: row.MINE_ID
//    - event_number: row.EVENT_NO
//    - inspection_date: row.INSPECTION_BEGIN_DT
//    - inspection_type: row.INSPECTION_PROC_ID
//    - violation_number: row.VIOLATION_NO
//    - violation_type: row.VIOLATION_TYPE_CD
//    - section_of_act: row.SECTION_OF_ACT
//    - significant_substantial: row.SIG_SUB === 'Y'
//    - negligence: row.NEGLIGENCE
//    - proposed_penalty: row.PROPOSED_PENALTY
//    - penalty_amount: row.AMOUNT_PAID (or FINAL_AMOUNT)
//    - current_status: row.VIOLATION_STATUS
//    - raw_data: full row as jsonb
//
// 5. Update external_sync_log with results
// 6. Trigger detect-discrepancies with source='msha'
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!validateAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if mine IDs are configured
  if (!MSHA_MINE_ID_MAP) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Log the attempted sync
    await supabase.from("external_sync_log").insert({
      source: "msha",
      sync_type: "manual",
      status: "failed",
      completed_at: new Date().toISOString(),
      records_synced: 0,
      records_failed: 0,
      error_details: { reason: "MSHA mine ID mapping not configured" },
    });

    await supabase.from("audit_log").insert({
      action: "external_sync_failed",
      module: "external_data",
      metadata: {
        source: "msha",
        reason: "MSHA_MINE_ID_MAP env var not set. Contact admin to configure mine IDs.",
      },
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: "MSHA sync requires mine ID mapping. Contact admin to configure.",
        hint: "Set MSHA_MINE_ID_MAP env var as JSON: {\"mine_id\":\"org_uuid\", ...}",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Parse mine ID map
  let mineIdMap: Record<string, string>;
  try {
    mineIdMap = JSON.parse(MSHA_MINE_ID_MAP);
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid MSHA_MINE_ID_MAP format. Expected JSON object." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Placeholder — will implement full pipeline when mine IDs arrive
  return new Response(
    JSON.stringify({
      success: false,
      error: "MSHA sync pipeline not yet implemented. Mine ID map parsed successfully.",
      mineIds: Object.keys(mineIdMap),
    }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

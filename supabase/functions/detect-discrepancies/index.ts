import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function validateAuth(req: Request): boolean {
  const secret = req.headers.get("x-internal-secret");
  return !!SYNC_INTERNAL_SECRET && secret === SYNC_INTERNAL_SECRET;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Discrepancy {
  organization_id: string;
  npdes_id: string | null;
  mine_id: string | null;
  source: string;
  discrepancy_type: string;
  severity: string;
  description: string;
  internal_value: string | null;
  external_value: string | null;
  internal_source_table: string | null;
  internal_source_id: string | null;
  external_source_id: string;
  monitoring_period_start: string | null;
  monitoring_period_end: string | null;
}

// ---------------------------------------------------------------------------
// Severity rules per plan:
// - SNC not tracked → critical
// - ECHO violation missing internally → high
// - DMR mismatch >25% → high, 10-25% → medium
// - Missing from external only → low
// ---------------------------------------------------------------------------
function assignSeverity(type: string, context: Record<string, unknown>): string {
  if (type === "status_mismatch") {
    const ext = String(context.external_value || "").toLowerCase();
    if (ext.includes("snc") || ext.includes("significant")) return "critical";
    return "medium";
  }

  if (type === "missing_internal") {
    const violCode = context.violation_code as string | undefined;
    if (violCode) return "high";
    return "medium";
  }

  if (type === "missing_external") {
    return "low";
  }

  if (type === "value_mismatch") {
    const pct = context.exceedance_pct as number | undefined;
    if (pct && Math.abs(pct) > 25) return "high";
    return "medium";
  }

  return "medium";
}

// ---------------------------------------------------------------------------
// Dedup check: don't re-insert if a matching discrepancy is already pending/reviewed
// ---------------------------------------------------------------------------
async function isDuplicate(
  supabase: ReturnType<typeof createClient>,
  d: Discrepancy,
): Promise<boolean> {
  let query = supabase
    .from("discrepancy_reviews")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", d.organization_id)
    .eq("discrepancy_type", d.discrepancy_type)
    .eq("source", d.source)
    .in("status", ["pending", "reviewed"]);

  if (d.npdes_id) query = query.eq("npdes_id", d.npdes_id);
  if (d.monitoring_period_end) query = query.eq("monitoring_period_end", d.monitoring_period_end);
  if (d.external_source_id) query = query.eq("external_source_id", d.external_source_id);

  const { count } = await query;
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// ECHO comparison rules
// ---------------------------------------------------------------------------
async function detectEchoDiscrepancies(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<Discrepancy[]> {
  const discrepancies: Discrepancy[] = [];

  // -----------------------------------------------------------------------
  // Rule 1: Permit status mismatch
  // Compare external_echo_facilities.permit_status vs npdes_permits.status
  // -----------------------------------------------------------------------
  const { data: echoFacilities } = await supabase
    .from("external_echo_facilities")
    .select("id, npdes_id, permit_status, compliance_status, qtrs_in_nc")
    .eq("organization_id", orgId);

  for (const facility of echoFacilities || []) {
    // Check if permit exists internally
    const { data: internalPermit } = await supabase
      .from("npdes_permits")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("permit_number", facility.npdes_id)
      .limit(1)
      .maybeSingle();

    if (internalPermit && facility.permit_status) {
      // Normalize for comparison
      const extStatus = String(facility.permit_status).toLowerCase().trim();
      const intStatus = String(internalPermit.status || "").toLowerCase().trim();

      if (extStatus && intStatus && extStatus !== intStatus) {
        discrepancies.push({
          organization_id: orgId,
          npdes_id: facility.npdes_id,
          mine_id: null,
          source: "echo",
          discrepancy_type: "status_mismatch",
          severity: assignSeverity("status_mismatch", {
            external_value: facility.compliance_status,
          }),
          description: `Permit status mismatch: internal="${internalPermit.status}" vs ECHO="${facility.permit_status}"`,
          internal_value: internalPermit.status,
          external_value: facility.permit_status,
          internal_source_table: "npdes_permits",
          internal_source_id: internalPermit.id,
          external_source_id: facility.id,
          monitoring_period_start: null,
          monitoring_period_end: null,
        });
      }
    }

    // Rule: SNC in ECHO but not tracked
    if (
      facility.compliance_status &&
      String(facility.compliance_status).toLowerCase().includes("snc")
    ) {
      // Check if we have any exceedance for this permit
      const { count: excCount } = await supabase
        .from("exceedances")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      if ((excCount ?? 0) === 0) {
        discrepancies.push({
          organization_id: orgId,
          npdes_id: facility.npdes_id,
          mine_id: null,
          source: "echo",
          discrepancy_type: "missing_internal",
          severity: "critical",
          description: `ECHO reports SNC status ("${facility.compliance_status}") for ${facility.npdes_id} but no exceedances are tracked internally`,
          internal_value: null,
          external_value: facility.compliance_status,
          internal_source_table: "exceedances",
          internal_source_id: null,
          external_source_id: facility.id,
          monitoring_period_start: null,
          monitoring_period_end: null,
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Rule 2: ECHO violation not tracked internally
  // -----------------------------------------------------------------------
  const { data: echoDmrsWithViolations } = await supabase
    .from("external_echo_dmrs")
    .select("id, npdes_id, outfall, parameter_code, parameter_desc, violation_code, violation_desc, monitoring_period_end, exceedance_pct, dmr_value, limit_value")
    .eq("organization_id", orgId)
    .not("violation_code", "is", null);

  for (const dmr of echoDmrsWithViolations || []) {
    discrepancies.push({
      organization_id: orgId,
      npdes_id: dmr.npdes_id,
      mine_id: null,
      source: "echo",
      discrepancy_type: "missing_internal",
      severity: assignSeverity("missing_internal", { violation_code: dmr.violation_code }),
      description: `ECHO violation (${dmr.violation_code}: ${dmr.violation_desc || "N/A"}) for ${dmr.npdes_id} outfall ${dmr.outfall || "?"}, parameter ${dmr.parameter_desc || dmr.parameter_code || "?"} — not tracked in internal exceedances`,
      internal_value: null,
      external_value: `${dmr.violation_code}: DMR=${dmr.dmr_value}, Limit=${dmr.limit_value}`,
      internal_source_table: "exceedances",
      internal_source_id: null,
      external_source_id: dmr.id,
      monitoring_period_start: null,
      monitoring_period_end: dmr.monitoring_period_end,
    });
  }

  // -----------------------------------------------------------------------
  // Rule 3: DMR value mismatch >10%
  // Compare external_echo_dmrs vs dmr_line_items (if populated)
  // -----------------------------------------------------------------------
  const { count: dmrCount } = await supabase
    .from("dmr_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  if ((dmrCount ?? 0) > 0) {
    // Internal DMR data exists — compare values
    const { data: echoDmrs } = await supabase
      .from("external_echo_dmrs")
      .select("id, npdes_id, outfall, parameter_code, parameter_desc, monitoring_period_end, dmr_value, limit_value, limit_unit")
      .eq("organization_id", orgId)
      .not("dmr_value", "is", null);

    for (const ext of echoDmrs || []) {
      // Try to find matching internal DMR line item
      const { data: intDmr } = await supabase
        .from("dmr_line_items")
        .select("id, reported_value")
        .eq("organization_id", orgId)
        .eq("parameter_code", ext.parameter_code)
        .limit(1)
        .maybeSingle();

      if (intDmr && intDmr.reported_value != null && ext.dmr_value != null) {
        const diff = Math.abs(intDmr.reported_value - ext.dmr_value);
        const base = Math.max(Math.abs(intDmr.reported_value), Math.abs(ext.dmr_value), 0.0001);
        const pctDiff = (diff / base) * 100;

        if (pctDiff > 10) {
          discrepancies.push({
            organization_id: orgId,
            npdes_id: ext.npdes_id,
            mine_id: null,
            source: "echo",
            discrepancy_type: "value_mismatch",
            severity: assignSeverity("value_mismatch", { exceedance_pct: pctDiff }),
            description: `DMR value mismatch (${pctDiff.toFixed(1)}%) for ${ext.npdes_id} ${ext.parameter_desc || ext.parameter_code}: internal=${intDmr.reported_value} vs ECHO=${ext.dmr_value}`,
            internal_value: String(intDmr.reported_value),
            external_value: String(ext.dmr_value),
            internal_source_table: "dmr_line_items",
            internal_source_id: intDmr.id,
            external_source_id: ext.id,
            monitoring_period_start: null,
            monitoring_period_end: ext.monitoring_period_end,
          });
        }
      }
    }
  }

  return discrepancies;
}

// ---------------------------------------------------------------------------
// Main
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let source = "echo";
  let orgId: string | null = null;
  let syncLogId: string | null = null;
  let triggeredBy: string | null = null;

  try {
    const body = await req.json();
    source = body.source || "echo";
    orgId = body.organization_id || null;
    syncLogId = body.sync_log_id || null;
    triggeredBy = body.triggered_by || null;
  } catch {
    // Defaults
  }

  // If no org specified, get the first one that has external data
  if (!orgId) {
    const { data: orgs } = await supabase
      .from("external_echo_facilities")
      .select("organization_id")
      .limit(1)
      .single();
    orgId = orgs?.organization_id || null;
  }

  if (!orgId) {
    return new Response(
      JSON.stringify({ success: true, message: "No external data found to compare", detected: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Run detection
  let discrepancies: Discrepancy[] = [];

  if (source === "echo") {
    discrepancies = await detectEchoDiscrepancies(supabase, orgId);
  }
  // MSHA detection will be added when sync pipeline is implemented

  // Dedup and insert
  let inserted = 0;
  let skippedDupes = 0;

  for (const d of discrepancies) {
    const dupe = await isDuplicate(supabase, d);
    if (dupe) {
      skippedDupes++;
      continue;
    }

    const { error: insertErr } = await supabase
      .from("discrepancy_reviews")
      .insert(d);

    if (insertErr) {
      console.error("Failed to insert discrepancy:", insertErr.message);
    } else {
      inserted++;
    }
  }

  // Audit log
  await supabase.from("audit_log").insert({
    user_id: triggeredBy,
    organization_id: orgId,
    action: "discrepancy_detected",
    module: "external_data",
    table_name: "discrepancy_reviews",
    description: JSON.stringify({
      source,
      sync_log_id: syncLogId,
      total_found: discrepancies.length,
      inserted,
      skipped_duplicates: skippedDupes,
      triggered_by: triggeredBy || "system",
    }),
  });

  console.log(
    `Discrepancy detection: ${discrepancies.length} found, ${inserted} inserted, ${skippedDupes} skipped (dupes)`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      source,
      totalFound: discrepancies.length,
      inserted,
      skippedDuplicates: skippedDupes,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

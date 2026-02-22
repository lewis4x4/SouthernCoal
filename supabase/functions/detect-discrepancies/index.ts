import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

// Safety cap: max rows fetched per paginated loop (500 pages × 1000 rows = 500K)
const MAX_PAGINATION_ITERATIONS = 500;

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
  // Batch-fetch all data up front to avoid N+1 queries
  // -----------------------------------------------------------------------

  // 1a. Paginate external facilities (PostgREST max-rows = 1000)
  const echoFacilities: Array<{ id: string; npdes_id: string; permit_status: string | null; compliance_status: string | null; qtrs_in_nc: number | null }> = [];
  let facOffset = 0;
  const FAC_PAGE = 1000;
  let hasMoreFacs = true;
  let facIterations = 0;
  while (hasMoreFacs && facIterations < MAX_PAGINATION_ITERATIONS) {
    const { data: facPage } = await supabase
      .from("external_echo_facilities")
      .select("id, npdes_id, permit_status, compliance_status, qtrs_in_nc")
      .eq("organization_id", orgId)
      .order("id")
      .range(facOffset, facOffset + FAC_PAGE - 1);
    const rows = facPage || [];
    echoFacilities.push(...rows);
    hasMoreFacs = rows.length === FAC_PAGE;
    facOffset += FAC_PAGE;
    facIterations++;
  }
  if (facIterations >= MAX_PAGINATION_ITERATIONS) {
    console.warn(`Facility pagination hit safety cap (${MAX_PAGINATION_ITERATIONS} iterations, ${echoFacilities.length} rows)`);
  }

  // 1b. Batch-fetch all internal permits for this org (avoids N+1)
  const { data: internalPermits } = await supabase
    .from("npdes_permits")
    .select("id, permit_number, status")
    .eq("organization_id", orgId);

  const permitByNpdes = new Map<string, { id: string; status: string | null }>();
  for (const p of internalPermits || []) {
    if (p.permit_number) {
      permitByNpdes.set(String(p.permit_number).toUpperCase(), { id: p.id, status: p.status });
    }
  }

  // 1c. Batch-fetch exceedance counts per npdes_id for SNC check
  const { data: exceedanceCounts } = await supabase
    .from("exceedances")
    .select("npdes_id")
    .eq("organization_id", orgId);

  const npdesWithExceedances = new Set<string>();
  for (const e of exceedanceCounts || []) {
    if (e.npdes_id) npdesWithExceedances.add(String(e.npdes_id).toUpperCase());
  }

  // 1d. Compare in-memory
  for (const facility of echoFacilities) {
    const internalPermit = permitByNpdes.get(String(facility.npdes_id).toUpperCase());

    if (internalPermit && facility.permit_status) {
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
      const hasExceedance = npdesWithExceedances.has(String(facility.npdes_id).toUpperCase());

      if (!hasExceedance) {
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
  // Paginated fetch — PostgREST defaults to 1000 rows without explicit limit
  // -----------------------------------------------------------------------
  const PAGE_SIZE = 1000; // PostgREST max-rows default
  let violOffset = 0;
  let hasMoreViolations = true;
  let violIterations = 0;

  while (hasMoreViolations && violIterations < MAX_PAGINATION_ITERATIONS) {
    const { data: echoDmrsWithViolations } = await supabase
      .from("external_echo_dmrs")
      .select("id, npdes_id, outfall, parameter_code, parameter_desc, violation_code, violation_desc, monitoring_period_end, exceedance_pct, dmr_value, limit_value")
      .eq("organization_id", orgId)
      .not("violation_code", "is", null)
      .order("id")
      .range(violOffset, violOffset + PAGE_SIZE - 1);

    const rows = echoDmrsWithViolations || [];
    for (const dmr of rows) {
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

    hasMoreViolations = rows.length === PAGE_SIZE;
    violOffset += PAGE_SIZE;
    violIterations++;
  }
  if (violIterations >= MAX_PAGINATION_ITERATIONS) {
    console.warn(`Violation pagination hit safety cap (${MAX_PAGINATION_ITERATIONS} iterations)`);
  }

  // -----------------------------------------------------------------------
  // Rule 3: DMR value mismatch >10%
  // Compare external_echo_dmrs vs dmr_line_items (if populated)
  // Batch-fetch internal DMRs to avoid N+1 queries
  // -----------------------------------------------------------------------
  const { count: dmrCount } = await supabase
    .from("dmr_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  if ((dmrCount ?? 0) > 0) {
    // Pre-fetch internal DMR line items with joins through FKs.
    // dmr_line_items uses FK references (parameter_id, outfall_id, dmr_submission_id)
    // rather than denormalized columns. We join through dmr_submissions → npdes_permits
    // and water_quality_parameters to build composite match keys.
    // Key: "npdes_id:outfall:storet_code:period_end" for accurate cross-reference.
    const intDmrMap = new Map<string, { id: string; reported_value: number }>();
    let intOffset = 0;
    let hasMoreInt = true;
    let intIterations = 0;
    while (hasMoreInt && intIterations < MAX_PAGINATION_ITERATIONS) {
      const { data: intPage } = await supabase
        .from("dmr_line_items")
        .select(`
          id, concentration_avg, quantity_avg,
          outfalls!inner(outfall_number),
          water_quality_parameters!inner(storet_code),
          dmr_submissions!inner(reporting_period_end, npdes_permits!inner(permit_number))
        `)
        .order("id")
        .range(intOffset, intOffset + PAGE_SIZE - 1);
      const intRows = (intPage || []) as Array<Record<string, unknown>>;
      for (const row of intRows) {
        const sub = row.dmr_submissions as Record<string, unknown> | null;
        const permit = sub?.npdes_permits as Record<string, unknown> | null;
        const param = row.water_quality_parameters as Record<string, unknown> | null;
        const outfall = row.outfalls as Record<string, unknown> | null;

        const npdesId = String(permit?.permit_number || "").toUpperCase();
        const storetCode = String(param?.storet_code || "");
        const outfallNum = String(outfall?.outfall_number || "");
        const periodEnd = String(sub?.reporting_period_end || "");
        const reportedValue = (row.concentration_avg as number) ?? (row.quantity_avg as number);

        if (!npdesId || !storetCode || reportedValue == null) continue;

        const key = `${npdesId}:${outfallNum}:${storetCode}:${periodEnd}`;
        if (!intDmrMap.has(key)) {
          intDmrMap.set(key, { id: row.id as string, reported_value: reportedValue });
        }
      }
      hasMoreInt = intRows.length === PAGE_SIZE;
      intOffset += PAGE_SIZE;
      intIterations++;
    }
    if (intIterations >= MAX_PAGINATION_ITERATIONS) {
      console.warn(`Internal DMR pagination hit safety cap (${MAX_PAGINATION_ITERATIONS} iterations)`);
    }

    // Paginate external DMRs with values
    let extOffset = 0;
    let hasMoreExt = true;
    let extIterations = 0;
    while (hasMoreExt && extIterations < MAX_PAGINATION_ITERATIONS) {
      const { data: echoDmrs } = await supabase
        .from("external_echo_dmrs")
        .select("id, npdes_id, outfall, parameter_code, parameter_desc, monitoring_period_end, dmr_value, limit_value, limit_unit")
        .eq("organization_id", orgId)
        .not("dmr_value", "is", null)
        .order("id")
        .range(extOffset, extOffset + PAGE_SIZE - 1);

      const extRows = echoDmrs || [];
      for (const ext of extRows) {
        // Build composite key matching the internal map structure
        const key = `${String(ext.npdes_id).toUpperCase()}:${ext.outfall || ""}:${ext.parameter_code || ""}:${ext.monitoring_period_end || ""}`;
        const intDmr = intDmrMap.get(key);

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
      hasMoreExt = extRows.length === PAGE_SIZE;
      extOffset += PAGE_SIZE;
      extIterations++;
    }
    if (extIterations >= MAX_PAGINATION_ITERATIONS) {
      console.warn(`External DMR pagination hit safety cap (${MAX_PAGINATION_ITERATIONS} iterations)`);
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
    if (typeof body.source === "string") source = body.source;
    if (typeof body.organization_id === "string") orgId = body.organization_id;
    if (typeof body.sync_log_id === "string") syncLogId = body.sync_log_id;
    if (typeof body.triggered_by === "string") triggeredBy = body.triggered_by;
  } catch {
    // Defaults on parse failure
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

  // Batch insert via RPC — handles partial unique index dedup in SQL
  let inserted = 0;
  let skippedDupes = 0;
  let insertErrors = 0;

  // Filter out rows missing external_source_id
  const valid = discrepancies.filter((d) => {
    if (!d.external_source_id) {
      insertErrors++;
      return false;
    }
    return true;
  });

  const BATCH_SIZE = 500;

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);

    const { data: result, error: rpcErr } = await supabase.rpc(
      "batch_insert_discrepancies",
      { rows: batch },
    );

    if (rpcErr) {
      console.error(`Batch RPC error (offset ${i}):`, rpcErr.message);
      insertErrors += batch.length;
    } else if (result) {
      const r = typeof result === "string" ? JSON.parse(result) : result;
      inserted += r.inserted || 0;
      skippedDupes += r.skipped || 0;
    }
  }

  // Audit log — validate triggeredBy as UUID before using as user_id FK
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validUserId = triggeredBy && uuidRegex.test(triggeredBy) ? triggeredBy : null;
  const { error: auditErr } = await supabase.from("audit_log").insert({
    user_id: validUserId,
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
      insert_errors: insertErrors,
      triggered_by: triggeredBy || "system",
    }),
  });
  if (auditErr) console.error("Audit log insert failed:", auditErr.message);

  console.log(
    `Discrepancy detection: ${discrepancies.length} found, ${inserted} inserted, ${skippedDupes} skipped (dupes), ${insertErrors} insert errors`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      source,
      totalFound: discrepancies.length,
      inserted,
      skippedDuplicates: skippedDupes,
      skipped_duplicates: skippedDupes,
      insertErrors,
      insert_errors: insertErrors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

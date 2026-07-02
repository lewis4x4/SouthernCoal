import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isPrivilegedOrAnonymousJwt } from "../_shared/auth.ts";
import { triggerInternalEdgeFunction } from "../_shared/internal-dispatch.ts";
import { evaluateMshaCitations, type MshaCitationInput } from "../_shared/msha-discrepancy-rules.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

// Safety cap: max rows fetched per paginated loop (500 pages × 1000 rows = 500K)
const MAX_PAGINATION_ITERATIONS = 500;

// ---------------------------------------------------------------------------
// Auth — internal secret OR user JWT (Review Queue manual re-run)
// ---------------------------------------------------------------------------
const ALLOWED_ROLES = ["environmental_manager", "executive", "admin"];

interface AuthResult {
  authorized: boolean;
  userId: string | null;
  orgId: string | null;
}

async function validateAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<AuthResult> {
  const denied: AuthResult = { authorized: false, userId: null, orgId: null };

  const secret = req.headers.get("x-internal-secret");
  if (secret && SYNC_INTERNAL_SECRET && secret === SYNC_INTERNAL_SECRET) {
    return { authorized: true, userId: null, orgId: null };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return denied;

  const token = authHeader.replace("Bearer ", "").trim();

  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
    return { authorized: true, userId: null, orgId: null };
  }
  if (isPrivilegedOrAnonymousJwt(token)) return denied;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return denied;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) return denied;

  const { data: roleData } = await supabase
    .from("user_role_assignments")
    .select("roles(name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const userRole = (
    roleData?.roles &&
    typeof roleData.roles === "object" &&
    "name" in roleData.roles
  )
    ? (roleData.roles as { name: string }).name
    : null;

  if (!userRole || !ALLOWED_ROLES.includes(userRole)) return denied;

  return {
    authorized: true,
    userId: user.id,
    orgId: profile.organization_id,
  };
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
  targetNpdesIds?: string[],
): Promise<Discrepancy[]> {
  const discrepancies: Discrepancy[] = [];
  const targetSet = targetNpdesIds?.length
    ? new Set(targetNpdesIds.map((id) => id.trim().toUpperCase()))
    : null;
  const matchesTarget = (npdesId: string | null | undefined): boolean =>
    !targetSet || (npdesId != null && targetSet.has(String(npdesId).toUpperCase()));

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
      if (!matchesTarget(facility.npdes_id)) continue;
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
    let violQuery = supabase
      .from("external_echo_dmrs")
      .select("id, npdes_id, outfall, parameter_code, parameter_desc, violation_code, violation_desc, monitoring_period_end, exceedance_pct, dmr_value, limit_value")
      .eq("organization_id", orgId)
      .not("violation_code", "is", null)
      .order("id")
      .range(violOffset, violOffset + PAGE_SIZE - 1);
    if (targetSet) {
      violQuery = violQuery.in("npdes_id", Array.from(targetSet));
    }
    const { data: echoDmrsWithViolations } = await violQuery;

    const rows = echoDmrsWithViolations || [];
    for (const dmr of rows) {
      if (!matchesTarget(dmr.npdes_id)) continue;
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
  // Compare external_echo_dmrs vs dmr_line_items (modern + CMS prod schemas)
  // -----------------------------------------------------------------------
  const { count: dmrCountModern } = await supabase
    .from("dmr_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  let hasInternalDmrs = (dmrCountModern ?? 0) > 0;
  if (!hasInternalDmrs) {
    const { count: dmrCountCms } = await supabase
      .from("dmr_submissions")
      .select("id, npdes_permits!inner(organization_id)", { count: "exact", head: true })
      .eq("npdes_permits.organization_id", orgId);
    hasInternalDmrs = (dmrCountCms ?? 0) > 0;
  }

  if (hasInternalDmrs) {
    const intDmrMap = new Map<string, { id: string; reported_value: number }>();
    let intOffset = 0;
    let hasMoreInt = true;
    let intIterations = 0;

    const loadInternalDmrPage = async (modern: boolean) => {
      if (modern) {
        return supabase
          .from("dmr_line_items")
          .select(`
            id,
            measured_value,
            storet_code,
            outfalls!inner(outfall_number),
            dmr_submissions!inner(
              monitoring_period_end,
              organization_id,
              npdes_permits!inner(permit_number, metadata)
            )
          `)
          .eq("dmr_submissions.organization_id", orgId)
          .not("measured_value", "is", null)
          .order("id")
          .range(intOffset, intOffset + PAGE_SIZE - 1);
      }
      return supabase
        .from("dmr_line_items")
        .select(`
          id,
          concentration_max,
          storet_code,
          outfalls!inner(outfall_number),
          dmr_submissions!inner(
            reporting_period_end,
            permit_id,
            npdes_permits!inner(permit_number, metadata, organization_id)
          )
        `)
        .eq("dmr_submissions.npdes_permits.organization_id", orgId)
        .not("concentration_max", "is", null)
        .order("id")
        .range(intOffset, intOffset + PAGE_SIZE - 1);
    };

    const useModernSchema = (dmrCountModern ?? 0) > 0;

    while (hasMoreInt && intIterations < MAX_PAGINATION_ITERATIONS) {
      const { data: intPage } = await loadInternalDmrPage(useModernSchema);
      const intRows = (intPage || []) as Array<Record<string, unknown>>;
      for (const row of intRows) {
        const sub = row.dmr_submissions as Record<string, unknown> | null;
        const permit = sub?.npdes_permits as Record<string, unknown> | null;
        const outfall = row.outfalls as Record<string, unknown> | null;
        const meta = permit?.metadata as Record<string, unknown> | null;
        const federalOverride = (meta?.federal_npdes_id_override as string | undefined)
          ?.trim()
          .toUpperCase();
        const npdesId = federalOverride ||
          String(permit?.permit_number || "").toUpperCase();
        const storetCode = String(row.storet_code || "").trim();
        const outfallNum = String(outfall?.outfall_number || "").trim();
        const periodEnd = String(
          sub?.monitoring_period_end || sub?.reporting_period_end || "",
        );
        const reportedValue = useModernSchema
          ? row.measured_value as number
          : row.concentration_max as number;

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
      let extQuery = supabase
        .from("external_echo_dmrs")
        .select("id, npdes_id, outfall, parameter_code, parameter_desc, monitoring_period_end, dmr_value, limit_value, limit_unit")
        .eq("organization_id", orgId)
        .not("dmr_value", "is", null)
        .order("id")
        .range(extOffset, extOffset + PAGE_SIZE - 1);
      if (targetSet) {
        extQuery = extQuery.in("npdes_id", Array.from(targetSet));
      }
      const { data: echoDmrs } = await extQuery;

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
// MSHA abatement / S&S rules — open citations at risk (DRAFT operational aid)
// ---------------------------------------------------------------------------
async function detectMshaDiscrepancies(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<Discrepancy[]> {
  const citations: MshaCitationInput[] = [];
  let offset = 0;
  const PAGE = 1000;
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < MAX_PAGINATION_ITERATIONS) {
    const { data: page } = await supabase
      .from("external_msha_inspections")
      .select(
        "id, mine_id, violation_number, event_number, inspection_date, violation_issue_date, " +
        "abatement_due_date, termination_date, significant_substantial, contested, current_status, proposed_penalty",
      )
      .eq("organization_id", orgId)
      .is("termination_date", null)
      .order("id")
      .range(offset, offset + PAGE - 1);

    const rows = page || [];
    for (const row of rows) {
      citations.push({
        id: String(row.id),
        mine_id: String(row.mine_id),
        violation_number: String(row.violation_number ?? ""),
        event_number: row.event_number ? String(row.event_number) : null,
        inspection_date: row.inspection_date ? String(row.inspection_date) : null,
        violation_issue_date: row.violation_issue_date ? String(row.violation_issue_date) : null,
        abatement_due_date: row.abatement_due_date ? String(row.abatement_due_date) : null,
        termination_date: row.termination_date ? String(row.termination_date) : null,
        significant_substantial: Boolean(row.significant_substantial),
        contested: Boolean(row.contested),
        current_status: row.current_status ? String(row.current_status) : null,
        proposed_penalty: row.proposed_penalty != null ? Number(row.proposed_penalty) : null,
      });
    }

    hasMore = rows.length === PAGE;
    offset += PAGE;
    iterations++;
  }

  if (iterations >= MAX_PAGINATION_ITERATIONS) {
    console.warn(
      `MSHA citation pagination hit safety cap (${MAX_PAGINATION_ITERATIONS} iterations, ${citations.length} rows)`,
    );
  }

  return evaluateMshaCitations(citations).map((candidate) => ({
    organization_id: orgId,
    npdes_id: null,
    mine_id: candidate.mine_id,
    source: "msha",
    discrepancy_type: candidate.discrepancy_type,
    severity: candidate.severity,
    description: candidate.description,
    internal_value: candidate.internal_value,
    external_value: candidate.external_value,
    internal_source_table: null,
    internal_source_id: null,
    external_source_id: candidate.external_source_id,
    monitoring_period_start: candidate.monitoring_period_start,
    monitoring_period_end: candidate.monitoring_period_end,
  }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
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

  let source = "echo";
  let orgId: string | null = auth.orgId;
  let syncLogId: string | null = null;
  let triggeredBy: string | null = auth.userId;
  let targetNpdesIds: string[] = [];

  try {
    const body = await req.json();
    if (typeof body.source === "string") source = body.source;
    if (typeof body.organization_id === "string") orgId = body.organization_id;
    if (typeof body.sync_log_id === "string") syncLogId = body.sync_log_id;
    if (typeof body.triggered_by === "string") triggeredBy = body.triggered_by;
    if (Array.isArray(body.target_npdes_ids)) {
      targetNpdesIds = body.target_npdes_ids
        .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v: string) => v.trim().toUpperCase());
    }
  } catch {
    // Defaults on parse failure
  }

  // If no org specified, infer from synced external data for the requested source
  if (!orgId) {
    const table = source === "msha" ? "external_msha_inspections" : "external_echo_facilities";
    const { data: orgs } = await supabase
      .from(table)
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
    discrepancies = await detectEchoDiscrepancies(
      supabase,
      orgId,
      targetNpdesIds.length > 0 ? targetNpdesIds : undefined,
    );
  } else if (source === "msha") {
    discrepancies = await detectMshaDiscrepancies(supabase, orgId);
  }

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

  // 5.16 — evaluate alert rules and dispatch email/SMS (non-fatal)
  try {
    await triggerInternalEdgeFunction("dispatch-compliance-alerts", {
      organization_id: orgId,
      source,
      inserted,
      sync_log_id: syncLogId,
    });
  } catch (err) {
    console.error("dispatch-compliance-alerts invoke error:", err);
  }

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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

const ECHO_BASE = "https://echo.epa.gov/api";
const RATE_LIMIT_MS = 500; // max ~2 req/sec per EPA guidelines
const MAX_RETRIES = 3;
const BACKFILL_YEARS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PermitMapping {
  organization_id: string;
  npdes_id: string;
  state_code: string | null;
}

// ---------------------------------------------------------------------------
// Auth — internal secret only (server-to-server)
// ---------------------------------------------------------------------------
function validateAuth(req: Request): boolean {
  const secret = req.headers.get("x-internal-secret");
  return !!SYNC_INTERNAL_SECRET && secret === SYNC_INTERNAL_SECRET;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return resp;
      if (resp.status === 429 || resp.status === 503) {
        const backoff = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`ECHO API ${resp.status}, backing off ${backoff}ms (attempt ${attempt + 1})`);
        await sleep(backoff);
        continue;
      }
      console.error(`ECHO API error: ${resp.status} for ${url}`);
      return null;
    } catch (err) {
      console.error(`ECHO fetch error (attempt ${attempt + 1}):`, err);
      if (attempt === retries - 1) return null;
      await sleep(Math.pow(2, attempt + 1) * 1000);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ECHO API Parsers
// ---------------------------------------------------------------------------
function parseFacilityInfo(data: Record<string, unknown>, npdesId: string): Record<string, unknown> | null {
  try {
    // ECHO API wraps results in Results.Facilities array
    const results = data?.Results as Record<string, unknown> | undefined;
    const facilities = results?.Facilities as Record<string, unknown>[] | undefined;
    if (!facilities || facilities.length === 0) return null;

    const f = facilities[0];
    return {
      facility_name: f.FacName || f.CWPName || null,
      permit_status: f.CWPPermitStatusDesc || f.CWPStatus || null,
      compliance_status: f.CWPSNCStatus || f.CWPComplianceStatus || null,
      qtrs_in_nc: f.CWPQtrsInNC ? Number(f.CWPQtrsInNC) : null,
      last_inspection_date: f.CWPLastInspectionDate || null,
      last_penalty_amount: f.CWPLastPenaltyAmt ? Number(f.CWPLastPenaltyAmt) : null,
      last_penalty_date: f.CWPLastPenaltyDate || null,
      facility_address: f.FacStreet || null,
      city: f.FacCity || null,
      zip: f.FacZip || null,
      latitude: f.FacLat ? Number(f.FacLat) : null,
      longitude: f.FacLong ? Number(f.FacLong) : null,
      permit_effective_date: f.CWPEffectiveDate || null,
      permit_expiration_date: f.CWPExpirationDate || null,
      sic_codes: f.SICCodes ? String(f.SICCodes).split(",").map((s: string) => s.trim()) : [],
      naics_codes: f.NAICSCodes ? String(f.NAICSCodes).split(",").map((s: string) => s.trim()) : [],
    };
  } catch (err) {
    console.error(`Error parsing facility info for ${npdesId}:`, err);
    return null;
  }
}

interface DmrRecord {
  npdes_id: string;
  outfall: string | null;
  parameter_code: string | null;
  parameter_desc: string | null;
  statistical_base: string | null;
  monitoring_period_start: string | null;
  monitoring_period_end: string | null;
  limit_value: number | null;
  limit_unit: string | null;
  dmr_value: number | null;
  dmr_unit: string | null;
  nodi_code: string | null;
  violation_code: string | null;
  violation_desc: string | null;
  exceedance_pct: number | null;
}

function parseDmrData(data: Record<string, unknown>, npdesId: string): DmrRecord[] {
  try {
    const results = data?.Results as Record<string, unknown> | undefined;
    // ECHO effluent API returns data under different possible keys
    const rows = (results?.EFFRows || results?.Rows || results?.EffluentChart || []) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) return [];

    return rows.map((r) => ({
      npdes_id: npdesId,
      outfall: r.PipeID || r.ExternalOutfallNmbr || null,
      parameter_code: r.ParameterCode || r.PollutantCode || null,
      parameter_desc: r.ParameterDesc || r.PollutantDesc || null,
      statistical_base: r.StatisticalBaseShortDesc || r.MonitoringLocationDesc || null,
      monitoring_period_start: r.MonitoringPeriodStartDate || null,
      monitoring_period_end: r.MonitoringPeriodEndDate || null,
      limit_value: r.LimitValueNmbr != null ? Number(r.LimitValueNmbr) : null,
      limit_unit: r.LimitUnitDesc || r.LimitValueStandardUnits || null,
      dmr_value: r.DMRValueNmbr != null ? Number(r.DMRValueNmbr) : null,
      dmr_unit: r.DMRUnitDesc || r.DMRValueStandardUnits || null,
      nodi_code: r.NODICode || null,
      violation_code: r.ViolationCode || null,
      violation_desc: r.ViolationDesc || null,
      exceedance_pct: r.ExceedancePct != null ? Number(r.ExceedancePct) : null,
    })) as DmrRecord[];
  } catch (err) {
    console.error(`Error parsing DMR data for ${npdesId}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth
  if (!validateAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Parse optional body
  let syncType = "manual";
  try {
    const body = await req.json();
    syncType = body.sync_type || "manual";
  } catch {
    // No body is fine — defaults to manual
  }

  // -----------------------------------------------------------------------
  // 1. Build permit → org map from file_processing_queue
  // -----------------------------------------------------------------------
  const { data: permitRows, error: permitError } = await supabase
    .from("file_processing_queue")
    .select("uploaded_by, state_code, extracted_data")
    .eq("status", "parsed")
    .eq("file_category", "npdes_permit")
    .not("extracted_data->permit_number", "is", null);

  if (permitError) {
    console.error("Error querying permits:", permitError);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to query permit data" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Resolve org IDs for uploaders
  const uploaderIds = [...new Set((permitRows || []).map((r) => r.uploaded_by).filter(Boolean))];
  const orgMap: Record<string, string> = {};

  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, organization_id")
      .in("id", uploaderIds);

    for (const p of profiles || []) {
      orgMap[p.id] = p.organization_id;
    }
  }

  // Deduplicate permits: one entry per npdes_id
  const permitMap = new Map<string, PermitMapping>();
  for (const row of permitRows || []) {
    const npdesId = row.extracted_data?.permit_number as string | undefined;
    if (!npdesId || !row.uploaded_by || !orgMap[row.uploaded_by]) continue;

    if (!permitMap.has(npdesId)) {
      permitMap.set(npdesId, {
        organization_id: orgMap[row.uploaded_by],
        npdes_id: npdesId,
        state_code: row.state_code,
      });
    }
  }

  const permits = Array.from(permitMap.values());
  console.log(`Found ${permits.length} unique NPDES permits to sync`);

  if (permits.length === 0) {
    return new Response(
      JSON.stringify({ success: true, message: "No permits found to sync", permitsSynced: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // -----------------------------------------------------------------------
  // 2. Create sync log entry
  // -----------------------------------------------------------------------
  const orgId = permits[0].organization_id; // All permits belong to same org for SCC
  const { data: syncLog, error: syncLogError } = await supabase
    .from("external_sync_log")
    .insert({
      organization_id: orgId,
      source: "echo_facility",
      sync_type: syncType,
      status: "running",
    })
    .select("id")
    .single();

  if (syncLogError || !syncLog) {
    console.error("Failed to create sync log:", syncLogError);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to create sync log" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // -----------------------------------------------------------------------
  // 3. Sync facility info from ECHO
  // -----------------------------------------------------------------------
  let facilitiesSynced = 0;
  let dmrsInserted = 0;
  const errors: string[] = [];

  // Backfill date range
  const backfillStart = new Date();
  backfillStart.setFullYear(backfillStart.getFullYear() - BACKFILL_YEARS);
  const startDateStr = `${String(backfillStart.getMonth() + 1).padStart(2, "0")}/${String(backfillStart.getDate()).padStart(2, "0")}/${backfillStart.getFullYear()}`;

  for (const permit of permits) {
    try {
      // 3a. Facility info
      const facilityUrl = `${ECHO_BASE}/cwa_rest_services.get_facility_info?p_id=${encodeURIComponent(permit.npdes_id)}&output=JSON`;
      const facilityResp = await fetchWithRetry(facilityUrl);

      if (!facilityResp) {
        errors.push(`${permit.npdes_id}: facility fetch failed`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const facilityJson = await facilityResp.json() as Record<string, unknown>;
      const parsed = parseFacilityInfo(facilityJson, permit.npdes_id);

      if (parsed) {
        const { error: upsertErr } = await supabase
          .from("external_echo_facilities")
          .upsert(
            {
              organization_id: permit.organization_id,
              npdes_id: permit.npdes_id,
              state_code: permit.state_code,
              ...parsed,
              raw_response: facilityJson,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "organization_id,npdes_id" },
          );

        if (upsertErr) {
          errors.push(`${permit.npdes_id}: facility upsert failed — ${upsertErr.message}`);
        } else {
          facilitiesSynced++;
        }
      } else {
        // KY general permits (KYGE40xxx) may have limited ECHO coverage
        console.log(`${permit.npdes_id}: no facility data in ECHO (may be general permit)`);
      }

      await sleep(RATE_LIMIT_MS);

      // 3b. DMR / effluent data
      const dmrUrl = `${ECHO_BASE}/eff_rest_services.get_effluent_chart?p_id=${encodeURIComponent(permit.npdes_id)}&output=JSON&p_start_date=${startDateStr}`;
      const dmrResp = await fetchWithRetry(dmrUrl);

      if (!dmrResp) {
        errors.push(`${permit.npdes_id}: DMR fetch failed`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const dmrJson = await dmrResp.json() as Record<string, unknown>;
      const dmrRecords = parseDmrData(dmrJson, permit.npdes_id);

      if (dmrRecords.length > 0) {
        // Look up facility ID for FK
        const { data: facility } = await supabase
          .from("external_echo_facilities")
          .select("id")
          .eq("organization_id", permit.organization_id)
          .eq("npdes_id", permit.npdes_id)
          .single();

        // Batch upsert in chunks of 50
        for (let i = 0; i < dmrRecords.length; i += 50) {
          const batch = dmrRecords.slice(i, i + 50).map((dmr) => ({
            organization_id: permit.organization_id,
            facility_id: facility?.id || null,
            npdes_id: dmr.npdes_id,
            outfall: dmr.outfall,
            parameter_code: dmr.parameter_code,
            parameter_desc: dmr.parameter_desc,
            statistical_base: dmr.statistical_base,
            monitoring_period_start: dmr.monitoring_period_start,
            monitoring_period_end: dmr.monitoring_period_end,
            limit_value: dmr.limit_value,
            limit_unit: dmr.limit_unit,
            dmr_value: dmr.dmr_value,
            dmr_unit: dmr.dmr_unit,
            nodi_code: dmr.nodi_code,
            violation_code: dmr.violation_code,
            violation_desc: dmr.violation_desc,
            exceedance_pct: dmr.exceedance_pct,
            raw_response: null, // Skip raw per-row to save space
            synced_at: new Date().toISOString(),
          }));

          const { error: dmrErr, count } = await supabase
            .from("external_echo_dmrs")
            .upsert(batch, {
              onConflict: "organization_id,npdes_id,outfall,parameter_code,statistical_base,monitoring_period_end",
              count: "exact",
            });

          if (dmrErr) {
            errors.push(`${permit.npdes_id}: DMR upsert batch failed — ${dmrErr.message}`);
          } else {
            dmrsInserted += count || batch.length;
          }
        }
      }

      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      errors.push(`${permit.npdes_id}: unexpected error — ${String(err)}`);
    }
  }

  // -----------------------------------------------------------------------
  // 4. Update sync log
  // -----------------------------------------------------------------------
  const finalStatus = errors.length === permits.length ? "failed" : "completed";
  await supabase
    .from("external_sync_log")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      records_synced: facilitiesSynced,
      records_failed: errors.length,
      error_details: errors.length > 0 ? { errors } : null,
      metadata: { dmrs_inserted: dmrsInserted, permits_total: permits.length },
    })
    .eq("id", syncLog.id);

  // -----------------------------------------------------------------------
  // 5. Audit log
  // -----------------------------------------------------------------------
  await supabase.from("audit_log").insert({
    action: errors.length === permits.length ? "external_sync_failed" : "external_sync_completed",
    module: "external_data",
    organization_id: orgId,
    metadata: {
      source: "echo",
      sync_log_id: syncLog.id,
      facilities_synced: facilitiesSynced,
      dmrs_inserted: dmrsInserted,
      errors_count: errors.length,
    },
  });

  // -----------------------------------------------------------------------
  // 6. Trigger discrepancy detection
  // -----------------------------------------------------------------------
  try {
    const detectUrl = `${SUPABASE_URL}/functions/v1/detect-discrepancies`;
    await fetch(detectUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SYNC_INTERNAL_SECRET,
      },
      body: JSON.stringify({ source: "echo", organization_id: orgId, sync_log_id: syncLog.id }),
    });
  } catch (err) {
    console.error("Failed to trigger discrepancy detection:", err);
    // Non-fatal — sync data is still saved
  }

  console.log(`Sync complete: ${facilitiesSynced} facilities, ${dmrsInserted} DMRs, ${errors.length} errors`);

  return new Response(
    JSON.stringify({
      success: true,
      syncLogId: syncLog.id,
      permitsSynced: facilitiesSynced,
      dmrsInserted,
      errors: errors.length > 0 ? errors : undefined,
      totalPermits: permits.length,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

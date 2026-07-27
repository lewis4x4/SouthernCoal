import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isPrivilegedOrAnonymousJwt, verifyInternalSecret } from "../_shared/auth.ts";
import {
  bisectDmrDateChunk,
  buildDmrDateChunks,
  buildEffluentChartUrl,
  type DmrDateChunk,
  HEAVY_DMR_NPDES_IDS,
  resolveDmrChunkMonths,
  resolveHeavyDmrParameterCodes,
} from "../_shared/echo-dmr-sync.ts";
import {
  buildEchoBatchPlan,
  buildEchoCoverageResult,
  normalizeNpdesIds,
} from "../_shared/echo-sync-batching.ts";
import { completeJobRun, readJobRunId } from "../_shared/job-run.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

const ECHO_BASE = "https://echodata.epa.gov/echo";
const RATE_LIMIT_MS = 500; // max ~2 req/sec per EPA guidelines
const MAX_RETRIES = 3;
const BACKFILL_YEARS = 3;
const RETRYABLE_ECHO_STATUSES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PermitMapping {
  organization_id: string;
  npdes_id: string;
  state_code: string | null;
}

type NormalizeResult =
  | { normalized: string; reason: null }
  | { normalized: null; reason: "missing_state_prefix" | "non_npdes_format" | "malformed_id" };

// ---------------------------------------------------------------------------
// Auth — dual path: internal secret OR JWT with role check
// ---------------------------------------------------------------------------
const ALLOWED_ROLES = ["environmental_manager", "executive", "admin"];
const ECHO_SKIP_PATTERNS = [
  /^KYGE\d{5}$/,   // KY general permits
  /^TNR059\d{3}$/, // TN stormwater general permits
];

// Valid US state codes for NPDES permits (all 50 + DC + territories)
const VALID_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "VI", "WA",
  "WV", "WI", "WY", "AS", "GU", "MP",
]);

interface AuthResult {
  authorized: boolean;
  userId: string | null;
  orgId: string | null;
  role: string | null;
}

async function validateAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<AuthResult> {
  const denied: AuthResult = { authorized: false, userId: null, orgId: null, role: null };

  // Path 1: Internal secret (cron, server-to-server) — shared, constant-time.
  if (verifyInternalSecret(req)) {
    return { authorized: true, userId: null, orgId: null, role: "system" };
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();

    // Path 2: Service role key (pg_cron / pg_net)
    if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
      return { authorized: true, userId: null, orgId: null, role: "system" };
    }
    if (isPrivilegedOrAnonymousJwt(token)) return denied;

    // Path 3: User JWT (frontend "Sync Now") — verify signature via Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return denied;

    // Get org from user_profiles
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) return denied;

    // Get role from user_role_assignments (user_profiles has no role column)
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
      role: userRole,
    };
  }

  return denied;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface WeeklyContinuationInput {
  remainingNpdesIds: string[];
  coverageNpdesIds: string[];
  failedNpdesIds: string[];
  unresolvedNpdesIds: string[];
  batchNumber: number;
  rootJobRunId: string | null;
  runTag: string;
  staleDays: number;
  batchSize: number;
}

interface ContinuationRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

async function dispatchWeeklyContinuation(
  supabaseClient: unknown,
  input: WeeklyContinuationInput,
): Promise<{ requestId: number | null; error: string | null }> {
  const supabase = supabaseClient as ContinuationRpcClient;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase.rpc(
        "dispatch_echo_weekly_sync_continuation",
        {
          p_remaining_npdes_ids: input.remainingNpdesIds,
          p_coverage_npdes_ids: input.coverageNpdesIds,
          p_failed_npdes_ids: input.failedNpdesIds,
          p_unresolved_npdes_ids: input.unresolvedNpdesIds,
          p_batch_number: input.batchNumber,
          p_root_job_run_id: input.rootJobRunId,
          p_run_tag: input.runTag,
          p_stale_days: input.staleDays,
          p_batch_size: input.batchSize,
        },
      );

      if (!error) {
        const requestId = typeof data === "number" ? data : Number(data);
        return {
          requestId: Number.isFinite(requestId) ? requestId : null,
          error: null,
        };
      }
      lastError = error.message;
    } catch (err) {
      lastError = String(err);
    }

    if (attempt < MAX_RETRIES - 1) {
      await sleep(Math.pow(2, attempt) * 500);
    }
  }

  return {
    requestId: null,
    error: lastError ?? "unknown continuation dispatch failure",
  };
}

function normalizeNpdesId(rawValue: string, stateCode: string | null): NormalizeResult {
  const cleaned = rawValue.trim().toUpperCase();
  if (!cleaned) return { normalized: null, reason: "malformed_id" };

  // SMCRA-like IDs (e.g., S-4001-07) are not NPDES permits.
  if (/^[A-Z]-\d/.test(cleaned)) {
    return { normalized: null, reason: "non_npdes_format" };
  }

  let normalized = cleaned;
  if (/^\d+$/.test(cleaned)) {
    const state = (stateCode || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(state) || !VALID_STATES.has(state)) {
      return { normalized: null, reason: "missing_state_prefix" };
    }
    normalized = `${state}${cleaned}`;
  }

  if (!/^[A-Z0-9-]+$/.test(normalized) || normalized.length < 7 || normalized.length > 12) {
    return { normalized: null, reason: "malformed_id" };
  }

  return { normalized, reason: null };
}

function shouldSkipEcho(npdesId: string): boolean {
  return ECHO_SKIP_PATTERNS.some((pattern) => pattern.test(npdesId));
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
  timeoutMs = 30_000,
): Promise<Response | null> {
  return (await fetchWithRetryResult(url, retries, timeoutMs)).response;
}

async function fetchWithRetryResult(
  url: string,
  retries = MAX_RETRIES,
  timeoutMs = 30_000,
): Promise<{ response: Response | null; failureReason: string | null }> {
  let lastFailureReason: string | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (resp.ok) return { response: resp, failureReason: null };
      lastFailureReason = `epa_http_${resp.status}`;
      if (RETRYABLE_ECHO_STATUSES.has(resp.status)) {
        const backoff = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`ECHO API ${resp.status}, backing off ${backoff}ms (attempt ${attempt + 1})`);
        await sleep(backoff);
        continue;
      }
      console.error(`ECHO API error: ${resp.status} for ${url}`);
      return { response: null, failureReason: lastFailureReason };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        lastFailureReason = `timeout_${timeoutMs}ms`;
        console.error(`ECHO API timeout after ${timeoutMs}ms (attempt ${attempt + 1}): ${url}`);
      } else {
        lastFailureReason = `fetch_error:${String(err).slice(0, 160)}`;
        console.error(`ECHO fetch error (attempt ${attempt + 1}):`, err);
      }
      if (attempt === retries - 1) return { response: null, failureReason: lastFailureReason };
      await sleep(Math.pow(2, attempt + 1) * 1000);
    } finally {
      clearTimeout(timeout);
    }
  }
  return { response: null, failureReason: lastFailureReason ?? "fetch_failed" };
}

// ---------------------------------------------------------------------------
// ECHO API Parsers
// ---------------------------------------------------------------------------
function parseFacilityInfo(data: Record<string, unknown>, npdesId: string): Record<string, unknown> | null {
  try {
    // DFR API wraps results under Results with Permits, ComplianceSummary, etc.
    const results = data?.Results as Record<string, unknown> | undefined;
    if (!results) return null;

    // Check for DFR "no data" message
    const message = results.Message as string | undefined;
    if (message && message.toLowerCase().includes("no ")) {
      console.log(`${npdesId}: DFR reports: ${message}`);
      return null;
    }

    // Facility info from Permits array
    const permits = results.Permits as Record<string, unknown>[] | undefined;
    if (!permits || permits.length === 0) return null;

    // Prefer the NPDES-specific permit row in multi-permit DFR responses.
    const f =
      permits.find((p) => String(p.SourceID || "").toUpperCase() === npdesId.toUpperCase()) ||
      permits.find((p) => String(p.EPASystem || "").toUpperCase() === "ICIS-NPDES") ||
      permits[0];

    // Compliance info from ComplianceSummary.Source or EnforcementComplianceSummaries.Summaries
    const compSummary = results.ComplianceSummary as Record<string, unknown> | undefined;
    const compSources = (compSummary?.Source as Record<string, unknown>[]) || [];
    const compSource = compSources.find((s) => s.SourceID === npdesId) || compSources[0];

    const ecsSummary = results.EnforcementComplianceSummaries as Record<string, unknown> | undefined;
    const ecsSummaries = (ecsSummary?.Summaries as Record<string, unknown>[]) || [];
    const ecsEntry = ecsSummaries.find((s) => s.Statute === "CWA") || ecsSummaries[0];

    // SIC / NAICS — DFR nests under Sources[].SICCodes[] / NAICSCodes[]
    const sicObj = results.SIC as Record<string, unknown> | undefined;
    const sicSources = (sicObj?.Sources as Record<string, unknown>[]) || [];
    const sicCodes = sicSources.flatMap((s) => (s.SICCodes as Record<string, unknown>[]) || []);

    const naicsObj = results.NAICS as Record<string, unknown> | undefined;
    const naicsSources = (naicsObj?.Sources as Record<string, unknown>[]) || [];
    const naicsCodes = naicsSources.flatMap((s) => (s.NAICSCodes as Record<string, unknown>[]) || []);

    // Parse inspection date from enforcement summary (MM/DD/YYYY → ISO date)
    let lastInspDate: string | null = null;
    if (ecsEntry?.LastInspection) {
      const parts = String(ecsEntry.LastInspection).split("/");
      if (parts.length === 3) lastInspDate = `${parts[2]}-${parts[0]}-${parts[1]}`;
    }

    return {
      facility_name: f.FacilityName || null,
      permit_status: f.FacilityStatus || f.PermitStatus || null,
      compliance_status: ecsEntry?.CurrentStatus || (compSource?.CurrentSNC === "Yes" ? "Significant Noncompliance" : compSource?.CurrentSNC === "No" ? "No Violation" : null),
      qtrs_in_nc: compSource?.QtrsInNC ? Number(compSource.QtrsInNC) : (ecsEntry?.QtrsInNC ? Number(ecsEntry.QtrsInNC) : null),
      last_inspection_date: lastInspDate,
      last_penalty_amount: ecsEntry?.TotalPenalties ? Number(ecsEntry.TotalPenalties) : null,
      last_penalty_date: null, // DFR doesn't provide individual penalty dates
      facility_address: f.FacilityStreet || null,
      city: f.FacilityCity || null,
      zip: f.FacilityZip || null,
      latitude: f.Latitude ? Number(f.Latitude) : null,
      longitude: f.Longitude ? Number(f.Longitude) : null,
      permit_effective_date: null, // DFR doesn't surface permit effective date directly
      permit_expiration_date: f.ExpDate || null,
      sic_codes: sicCodes.map((s) => String(s.SICCode || "")).filter(Boolean),
      naics_codes: naicsCodes.map((n) => String(n.NAICSCode || "")).filter(Boolean),
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

interface DmrFetchFailure {
  npdes_id: string;
  start_date: string;
  end_date: string;
  parameter_code: string | null;
  reason: string;
  bisect_depth?: number;
}

interface DmrWindowResult {
  npdes_id: string;
  start_date: string;
  end_date: string;
  parameter_code: string | null;
  status: "imported" | "empty" | "failed" | "upsert_failed";
  rows_parsed: number;
  rows_deduped: number;
  rows_imported: number;
  bisect_depth: number;
  reason?: string;
}

interface DmrWindowSyncResult {
  inserted: number;
  emptyResponses: number;
  requestsAttempted: number;
  failures: DmrFetchFailure[];
  windowResults: DmrWindowResult[];
}

// Convert EPA date "31-OCT-22" → "2022-10-31"
function parseEpaDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const m = raw.match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})$/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mon = months[m[2].toUpperCase()];
  if (!mon) return null;
  let year = m[3];
  if (year.length === 2) year = Number(year) > 50 ? `19${year}` : `20${year}`;
  return `${year}-${mon}-${day}`;
}

function parseDmrData(data: Record<string, unknown>, npdesId: string): DmrRecord[] {
  try {
    const results = data?.Results as Record<string, unknown> | undefined;
    if (!results) return [];

    // ECHO effluent API nests data: Results.PermFeatures[].Parameters[].DischargeMonitoringReports[]
    const permFeatures = results.PermFeatures as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(permFeatures) || permFeatures.length === 0) return [];

    const records: DmrRecord[] = [];

    for (const feat of permFeatures) {
      const outfall = String(feat.PermFeatureNmbr || "");
      const params = feat.Parameters as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(params)) continue;

      for (const param of params) {
        const paramCode = String(param.ParameterCode || "");
        const paramDesc = String(param.ParameterDesc || "");
        // statistical_base is part of the dmr upsert conflict key — it must come
        // from the statistical base fields, never the monitoring-location text.
        const statBase = param.StatisticalBaseDesc
          ? String(param.StatisticalBaseDesc)
          : param.StatisticalBaseCode
            ? String(param.StatisticalBaseCode)
            : null;

        const dmrs = param.DischargeMonitoringReports as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(dmrs)) continue;

        for (const dmr of dmrs) {
          const dmrVal = dmr.DMRValueNmbr != null ? Number(dmr.DMRValueNmbr) : null;
          const limitVal = dmr.LimitValueNmbr != null ? Number(dmr.LimitValueNmbr) : null;
          const viols = dmr.NPDESViolations as Array<Record<string, unknown>> | undefined;
          const hasViolation = Array.isArray(viols) && viols.length > 0;
          const exceedPct = dmr.ExceedencePct != null ? Number(dmr.ExceedencePct) : null;

          // Only store records with a reported value, a violation, or an exceedance
          if (dmrVal == null && !hasViolation && exceedPct == null) continue;

          const firstViol = hasViolation ? viols![0] : null;

          records.push({
            npdes_id: npdesId,
            outfall: outfall || null,
            parameter_code: paramCode || null,
            parameter_desc: paramDesc || null,
            statistical_base: String(dmr.StatisticalBaseDesc || statBase || ""),
            monitoring_period_start: null, // Not provided per-DMR in this structure
            monitoring_period_end: parseEpaDate(dmr.MonitoringPeriodEndDate as string),
            limit_value: isNaN(limitVal as number) ? null : limitVal,
            limit_unit: (dmr.LimitUnitDesc || null) as string | null,
            dmr_value: isNaN(dmrVal as number) ? null : dmrVal,
            dmr_unit: (dmr.DMRUnitDesc || null) as string | null,
            nodi_code: (dmr.NODICode || null) as string | null,
            violation_code: firstViol ? String(firstViol.ViolationCode || "") : null,
            violation_desc: firstViol ? String(firstViol.ViolationDesc || "") : null,
            exceedance_pct: isNaN(exceedPct as number) ? null : exceedPct,
          });
        }
      }
    }

    return records;
  } catch (err) {
    console.error(`Error parsing DMR data for ${npdesId}:`, err);
    return [];
  }
}

function dedupeDmrRecords(records: DmrRecord[]): DmrRecord[] {
  const dedupMap = new Map<string, DmrRecord>();
  for (const dmr of records) {
    const key = `${dmr.outfall}|${dmr.parameter_code}|${dmr.statistical_base}|${dmr.monitoring_period_end}`;
    dedupMap.set(key, dmr);
  }
  return Array.from(dedupMap.values());
}

async function upsertDmrBatch(
  supabase: ReturnType<typeof createClient>,
  permit: PermitMapping,
  uniqueDmrs: DmrRecord[],
  errors: string[],
): Promise<number> {
  if (uniqueDmrs.length === 0) return 0;

  const { data: facility } = await supabase
    .from("external_echo_facilities")
    .select("id")
    .eq("organization_id", permit.organization_id)
    .eq("npdes_id", permit.npdes_id)
    .single();

  let inserted = 0;
  for (let i = 0; i < uniqueDmrs.length; i += 50) {
    const batch = uniqueDmrs.slice(i, i + 50).map((dmr) => ({
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
      raw_response: null,
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
      inserted += count || batch.length;
    }
  }
  return inserted;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shouldBisectDmrFetchFailure(reason: string | null, chunk: DmrDateChunk): boolean {
  if (!bisectDmrDateChunk(chunk)) return false;
  if (!reason) return true;
  return (
    reason.startsWith("epa_http_429") ||
    reason.startsWith("epa_http_500") ||
    reason.startsWith("epa_http_502") ||
    reason.startsWith("epa_http_503") ||
    reason.startsWith("epa_http_504") ||
    reason.startsWith("timeout_") ||
    reason.startsWith("fetch_error")
  );
}

function combineDmrWindowSyncResults(results: DmrWindowSyncResult[]): DmrWindowSyncResult {
  return results.reduce<DmrWindowSyncResult>(
    (acc, result) => ({
      inserted: acc.inserted + result.inserted,
      emptyResponses: acc.emptyResponses + result.emptyResponses,
      requestsAttempted: acc.requestsAttempted + result.requestsAttempted,
      failures: [...acc.failures, ...result.failures],
      windowResults: [...acc.windowResults, ...result.windowResults],
    }),
    { inserted: 0, emptyResponses: 0, requestsAttempted: 0, failures: [], windowResults: [] },
  );
}

async function syncDmrWindowWithBisection(
  supabase: ReturnType<typeof createClient>,
  permit: PermitMapping,
  chunk: DmrDateChunk,
  parameterCode: string | null,
  errors: string[],
  depth = 0,
): Promise<DmrWindowSyncResult> {
  const startDate = isoDate(chunk.start);
  const endDate = isoDate(chunk.end);
  const dmrUrl = buildEffluentChartUrl(ECHO_BASE, permit.npdes_id, chunk.start, chunk.end, {
    parameterCode,
  });
  const { response: dmrResp, failureReason } = await fetchWithRetryResult(
    dmrUrl,
    parameterCode ? 2 : MAX_RETRIES,
    parameterCode ? 45_000 : 120_000,
  );

  if (!dmrResp) {
    if (shouldBisectDmrFetchFailure(failureReason, chunk)) {
      const halves = bisectDmrDateChunk(chunk);
      if (halves) {
        console.warn(
          `${permit.npdes_id}: DMR fetch ${failureReason ?? "failed"} for ${startDate}–${endDate}` +
            (parameterCode ? ` parameter=${parameterCode}` : "") +
            `; bisecting into ${isoDate(halves[0].start)}–${isoDate(halves[0].end)} and ${isoDate(halves[1].start)}–${isoDate(halves[1].end)}`,
        );
        await sleep(RATE_LIMIT_MS);
        const left = await syncDmrWindowWithBisection(
          supabase,
          permit,
          halves[0],
          parameterCode,
          errors,
          depth + 1,
        );
        await sleep(RATE_LIMIT_MS);
        const right = await syncDmrWindowWithBisection(
          supabase,
          permit,
          halves[1],
          parameterCode,
          errors,
          depth + 1,
        );
        return {
          ...combineDmrWindowSyncResults([left, right]),
          requestsAttempted: left.requestsAttempted + right.requestsAttempted + 1,
        };
      }
    }

    const failure: DmrFetchFailure = {
      npdes_id: permit.npdes_id,
      start_date: startDate,
      end_date: endDate,
      parameter_code: parameterCode,
      reason: failureReason ?? "fetch_failed_or_timed_out",
      bisect_depth: depth,
    };
    failuresLog(permit, failure, errors);
    await sleep(RATE_LIMIT_MS);
    return {
      inserted: 0,
      emptyResponses: 0,
      requestsAttempted: 1,
      failures: [failure],
      windowResults: [{
        npdes_id: permit.npdes_id,
        start_date: startDate,
        end_date: endDate,
        parameter_code: parameterCode,
        status: "failed",
        rows_parsed: 0,
        rows_deduped: 0,
        rows_imported: 0,
        bisect_depth: depth,
        reason: failure.reason,
      }],
    };
  }

  let dmrJson: Record<string, unknown>;
  try {
    dmrJson = await dmrResp.json() as Record<string, unknown>;
  } catch (err) {
    const reason = `invalid_json:${String(err).slice(0, 160)}`;
    const failure: DmrFetchFailure = {
      npdes_id: permit.npdes_id,
      start_date: startDate,
      end_date: endDate,
      parameter_code: parameterCode,
      reason,
      bisect_depth: depth,
    };
    failuresLog(permit, failure, errors);
    await sleep(RATE_LIMIT_MS);
    return {
      inserted: 0,
      emptyResponses: 0,
      requestsAttempted: 1,
      failures: [failure],
      windowResults: [{
        npdes_id: permit.npdes_id,
        start_date: startDate,
        end_date: endDate,
        parameter_code: parameterCode,
        status: "failed",
        rows_parsed: 0,
        rows_deduped: 0,
        rows_imported: 0,
        bisect_depth: depth,
        reason,
      }],
    };
  }

  const dmrRecords = parseDmrData(dmrJson, permit.npdes_id);
  if (dmrRecords.length === 0) {
    const topLevelKeys = Object.keys(dmrJson || {});
    const resultKeys = Object.keys((dmrJson?.Results as Record<string, unknown>) || {});
    console.log(
      `${permit.npdes_id}: DMR chunk ${startDate}–${endDate}` +
        (parameterCode ? ` parameter=${parameterCode}` : "") +
        ` returned 0 rows. topKeys=[${topLevelKeys.join(", ")}], resultKeys=[${resultKeys.join(", ")}]`,
    );
    await sleep(RATE_LIMIT_MS);
    return {
      inserted: 0,
      emptyResponses: 1,
      requestsAttempted: 1,
      failures: [],
      windowResults: [{
        npdes_id: permit.npdes_id,
        start_date: startDate,
        end_date: endDate,
        parameter_code: parameterCode,
        status: "empty",
        rows_parsed: 0,
        rows_deduped: 0,
        rows_imported: 0,
        bisect_depth: depth,
      }],
    };
  }

  const uniqueDmrs = dedupeDmrRecords(dmrRecords);
  const dedupDropped = dmrRecords.length - uniqueDmrs.length;
  if (dedupDropped > 0) {
    console.log(`${permit.npdes_id}: deduped ${dedupDropped} duplicate DMR rows (${dmrRecords.length} → ${uniqueDmrs.length})`);
  }

  const errorsBefore = errors.length;
  const inserted = await upsertDmrBatch(supabase, permit, uniqueDmrs, errors);
  await sleep(RATE_LIMIT_MS);
  return {
    inserted,
    emptyResponses: 0,
    requestsAttempted: 1,
    failures: [],
    windowResults: [{
      npdes_id: permit.npdes_id,
      start_date: startDate,
      end_date: endDate,
      parameter_code: parameterCode,
      status: errors.length > errorsBefore ? "upsert_failed" : "imported",
      rows_parsed: dmrRecords.length,
      rows_deduped: uniqueDmrs.length,
      rows_imported: inserted,
      bisect_depth: depth,
      reason: errors.length > errorsBefore ? "dmr_upsert_failed" : undefined,
    }],
  };
}

function failuresLog(permit: PermitMapping, failure: DmrFetchFailure, errors: string[]) {
  errors.push(
    `${permit.npdes_id}: DMR fetch failed for ${failure.start_date}–${failure.end_date}` +
      (failure.parameter_code ? ` parameter=${failure.parameter_code}` : "") +
      ` (${failure.reason})`,
  );
}

async function syncPermitDmrData(
  supabase: ReturnType<typeof createClient>,
  permit: PermitMapping,
  chunkMonths: number,
  errors: string[],
  dmrChunkIndex?: number | null,
  requestedParameterCodes: string[] = [],
): Promise<{
  inserted: number;
  emptyResponses: number;
  chunksFetched: number;
  totalChunks: number;
  chunkIndex: number | null;
  parameterSliced: boolean;
  parameterCodes: string[];
  requestsAttempted: number;
  parameterRequestsAttempted: number;
  failures: DmrFetchFailure[];
  windowResults: DmrWindowResult[];
}> {
  const allChunks = buildDmrDateChunks(BACKFILL_YEARS, chunkMonths);
  const chunks =
    typeof dmrChunkIndex === "number" && dmrChunkIndex >= 0 && dmrChunkIndex < allChunks.length
      ? [allChunks[dmrChunkIndex]]
      : allChunks;
  let inserted = 0;
  let emptyResponses = 0;
  let requestsAttempted = 0;
  let parameterRequestsAttempted = 0;
  const failures: DmrFetchFailure[] = [];
  const windowResults: DmrWindowResult[] = [];
  const parameterCodes = await resolvePermitDmrParameterCodes(
    supabase,
    permit,
    requestedParameterCodes,
  );
  const parameterSliced =
    HEAVY_DMR_NPDES_IDS.has(permit.npdes_id.toUpperCase()) && parameterCodes.length > 0;

  for (const chunk of chunks) {
    const fetchTargets = parameterSliced
      ? parameterCodes.map((parameterCode) => ({ parameterCode }))
      : [{ parameterCode: null as string | null }];

    for (const target of fetchTargets) {
      const result = await syncDmrWindowWithBisection(
        supabase,
        permit,
        chunk,
        target.parameterCode,
        errors,
      );
      inserted += result.inserted;
      emptyResponses += result.emptyResponses;
      requestsAttempted += result.requestsAttempted;
      if (target.parameterCode) parameterRequestsAttempted += result.requestsAttempted;
      failures.push(...result.failures);
      windowResults.push(...result.windowResults);
    }
  }

  return {
    inserted,
    emptyResponses,
    chunksFetched: chunks.length,
    totalChunks: allChunks.length,
    chunkIndex: typeof dmrChunkIndex === "number" ? dmrChunkIndex : null,
    parameterSliced,
    parameterCodes,
    requestsAttempted,
    parameterRequestsAttempted,
    failures,
    windowResults,
  };
}

async function resolvePermitDmrParameterCodes(
  supabase: ReturnType<typeof createClient>,
  permit: PermitMapping,
  requestedParameterCodes: string[],
): Promise<string[]> {
  const requested = resolveHeavyDmrParameterCodes(permit.npdes_id, requestedParameterCodes);
  if (requested.length > 0) return requested;

  if (!HEAVY_DMR_NPDES_IDS.has(permit.npdes_id.toUpperCase())) return [];

  const { data: permitRow } = await supabase
    .from("npdes_permits")
    .select("id")
    .eq("organization_id", permit.organization_id)
    .eq("permit_number", permit.npdes_id)
    .maybeSingle();

  if (!permitRow?.id) return resolveHeavyDmrParameterCodes(permit.npdes_id);

  const { data: limitRows, error } = await supabase
    .from("permit_limits")
    .select("storet_code, parameters(storet_code, epa_parameter_code)")
    .eq("permit_id", permitRow.id)
    .eq("is_active", true)
    .limit(500);

  if (error) {
    console.warn(`${permit.npdes_id}: failed to resolve parameter codes from permit_limits: ${error.message}`);
    return resolveHeavyDmrParameterCodes(permit.npdes_id);
  }

  const codes = new Set<string>();
  for (const row of limitRows ?? []) {
    const nested = row.parameters as { storet_code?: string | null; epa_parameter_code?: string | null } | null;
    for (const code of [row.storet_code, nested?.epa_parameter_code, nested?.storet_code]) {
      if (typeof code === "string" && code.trim()) {
        codes.add(code.trim().toUpperCase());
        break;
      }
    }
  }

  return codes.size > 0 ? [...codes] : resolveHeavyDmrParameterCodes(permit.npdes_id);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth — internal secret OR JWT with role check
  const auth = await validateAuth(req, supabase);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Tenant isolation: internal secret / service role (userId null) may sync all
  // orgs (cron). A JWT user is pinned to their own org — every permit, override,
  // and freshness check below is filtered to callerOrgId in that case.
  const isPrivileged = auth.userId === null;
  const callerOrgId = auth.orgId;

  // Parse optional body
  let syncType = "manual";
  let limit = 0; // 0 = no limit
  let offset = 0;
  let dryRun = false;
  let runTag: string | null = null;
  let targetNpdesIds: string[] = [];
  let staleDays = 0;
  let staleOnly = false;
  let dmrChunkMonths = 0;
  let dmrChunkIndex: number | null = null;
  let dmrParameterCodes: string[] = [];
  let skipFacility = false;
  let dmrOnly = false;
  let jobRunId: string | null = null;
  let autoContinue = false;
  let continuationNpdesIds: string[] = [];
  let coverageNpdesIds: string[] = [];
  let priorFailedNpdesIds: string[] = [];
  let priorUnresolvedNpdesIds: string[] = [];
  let batchNumber = 1;
  let rootJobRunId: string | null = null;
  try {
    const body = await req.json();
    jobRunId = readJobRunId(body);
    syncType = body.sync_type || "manual";
    limit = typeof body.limit === "number" && body.limit > 0 ? body.limit : 0;
    offset = typeof body.offset === "number" && body.offset >= 0 ? body.offset : 0;
    dryRun = body.dry_run === true;
    runTag = typeof body.run_tag === "string" && body.run_tag.trim().length > 0
      ? body.run_tag.trim()
      : null;
    targetNpdesIds = Array.isArray(body.target_npdes_ids)
      ? body.target_npdes_ids
        .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v: string) => v.trim().toUpperCase())
      : [];
    if (typeof body.stale_days === "number" && body.stale_days > 0) {
      staleDays = Math.floor(body.stale_days);
    }
    if (body.stale_only === true) staleOnly = true;
    if (body.stale_only === false) staleOnly = false;
    if (typeof body.dmr_chunk_months === "number" && body.dmr_chunk_months > 0) {
      dmrChunkMonths = Math.floor(body.dmr_chunk_months);
    }
    if (typeof body.dmr_chunk_index === "number" && body.dmr_chunk_index >= 0) {
      dmrChunkIndex = Math.floor(body.dmr_chunk_index);
    }
    if (Array.isArray(body.dmr_parameter_codes)) {
      dmrParameterCodes = body.dmr_parameter_codes
        .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v: string) => v.trim().toUpperCase());
    }
    skipFacility = body.skip_facility === true;
    dmrOnly = body.dmr_only === true;
    if (dmrOnly) skipFacility = true;
    autoContinue = body.auto_continue === true;
    continuationNpdesIds = normalizeNpdesIds(
      Array.isArray(body.continuation_npdes_ids) ? body.continuation_npdes_ids : [],
    );
    coverageNpdesIds = normalizeNpdesIds(
      Array.isArray(body.coverage_npdes_ids) ? body.coverage_npdes_ids : [],
    );
    priorFailedNpdesIds = normalizeNpdesIds(
      Array.isArray(body.prior_failed_npdes_ids) ? body.prior_failed_npdes_ids : [],
    );
    priorUnresolvedNpdesIds = normalizeNpdesIds(
      Array.isArray(body.prior_unresolved_npdes_ids)
        ? body.prior_unresolved_npdes_ids
        : [],
    );
    if (typeof body.batch_number === "number" && body.batch_number > 0) {
      batchNumber = Math.floor(body.batch_number);
    }
    rootJobRunId = typeof body.root_job_run_id === "string" &&
        body.root_job_run_id.trim().length > 0
      ? body.root_job_run_id.trim()
      : null;
  } catch {
    // No body is fine — defaults to manual, no limit, offset 0
  }

  // Continuation fields can cause service-side work after this request returns.
  // Only the trusted cron/server path may use them; JWT users retain the
  // existing single-request, tenant-pinned behavior.
  if (!isPrivileged) {
    autoContinue = false;
    continuationNpdesIds = [];
    coverageNpdesIds = [];
    priorFailedNpdesIds = [];
    priorUnresolvedNpdesIds = [];
    batchNumber = 1;
    rootJobRunId = null;
  }

  if (syncType === "scheduled") {
    if (staleDays <= 0) staleDays = 7;
    if (!staleOnly) staleOnly = true;
    if (limit <= 0) limit = 5;
    if (!runTag) runTag = "cron-weekly-echo";
  }
  if (!rootJobRunId) rootJobRunId = jobRunId;

  // -----------------------------------------------------------------------
  // 1. Build permit → org map from file_processing_queue
  // -----------------------------------------------------------------------
  // Paginate — PostgREST caps a single response at 1000 rows, which would
  // silently drop permits once the queue grows past that. Loop until drained.
  const permitRows: Array<{ uploaded_by: string | null; state_code: string | null; extracted_data: Record<string, unknown> | null }> = [];
  {
    const QUEUE_PAGE = 1000;
    let qOffset = 0;
    let qMore = true;
    let qIterations = 0;
    const QUEUE_MAX_ITERATIONS = 500;
    while (qMore && qIterations < QUEUE_MAX_ITERATIONS) {
      const { data: qPage, error: permitError } = await supabase
        .from("file_processing_queue")
        .select("uploaded_by, state_code, extracted_data")
        // Permit rows can be post-parse statuses (embedded/imported) in current pipeline.
        .in("status", ["parsed", "embedded", "imported"])
        .eq("file_category", "npdes_permit")
        .not("extracted_data->permit_number", "is", null)
        .order("id")
        .range(qOffset, qOffset + QUEUE_PAGE - 1);

      if (permitError) {
        console.error("Error querying permits:", permitError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to query permit data" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const rows = (qPage || []) as typeof permitRows;
      permitRows.push(...rows);
      qMore = rows.length === QUEUE_PAGE;
      qOffset += QUEUE_PAGE;
      qIterations++;
    }
    if (qIterations >= QUEUE_MAX_ITERATIONS) {
      console.warn(`file_processing_queue pagination hit safety cap (${QUEUE_MAX_ITERATIONS} pages)`);
    }
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

  const permitsSkippedMissingOrgSet = new Set<string>();
  const permitsSkippedInvalidSet = new Set<string>();
  const permitsSkippedPatternSet = new Set<string>();
  const rawPermitIds = new Set<string>();

  // Deduplicate permits: one eligible entry per normalized npdes_id
  const permitMap = new Map<string, PermitMapping>();
  for (const row of permitRows || []) {
    const rawPermit = row.extracted_data?.permit_number as string | undefined;
    if (!rawPermit) continue;
    rawPermitIds.add(rawPermit.trim().toUpperCase());

    if (!row.uploaded_by || !orgMap[row.uploaded_by]) {
      permitsSkippedMissingOrgSet.add(rawPermit.trim().toUpperCase());
      continue;
    }

    // JWT users may only sync their own org's permits.
    if (!isPrivileged && orgMap[row.uploaded_by] !== callerOrgId) {
      continue;
    }

    const normalized = normalizeNpdesId(rawPermit, row.state_code ?? null);
    if (!normalized.normalized) {
      permitsSkippedInvalidSet.add(rawPermit.trim().toUpperCase());
      continue;
    }

    if (shouldSkipEcho(normalized.normalized)) {
      permitsSkippedPatternSet.add(normalized.normalized);
      continue;
    }

    if (!permitMap.has(normalized.normalized)) {
      permitMap.set(normalized.normalized, {
        organization_id: orgMap[row.uploaded_by],
        npdes_id: normalized.normalized,
        state_code: row.state_code,
      });
    }
  }

  // -----------------------------------------------------------------------
  // 1b. Apply NPDES ID overrides (e.g., VA DMLR → federal NPDES mapping)
  // -----------------------------------------------------------------------
  let overrideQuery = supabase
    .from("npdes_id_overrides")
    .select("organization_id, state_code, source_permit_id, npdes_id");
  if (!isPrivileged) {
    overrideQuery = overrideQuery.eq("organization_id", callerOrgId);
  }
  const { data: overrideRows } = await overrideQuery;

  let overridesApplied = 0;
  if (overrideRows && overrideRows.length > 0) {
    for (const ov of overrideRows) {
      const sourceKey = ov.source_permit_id.trim().toUpperCase();

      // Defense in depth even if RLS/query filter changes.
      if (!isPrivileged && ov.organization_id !== callerOrgId) continue;

      // If the source permit ID was in our raw set but failed normalization
      // or wasn't in the map, add it now with the override NPDES ID
      if (!permitMap.has(ov.npdes_id.trim().toUpperCase())) {
        permitMap.set(ov.npdes_id.trim().toUpperCase(), {
          organization_id: ov.organization_id,
          npdes_id: ov.npdes_id.trim().toUpperCase(),
          state_code: ov.state_code,
        });
        overridesApplied++;
        // Remove from skipped sets since the override resolves them
        permitsSkippedInvalidSet.delete(sourceKey);
      }
    }
    console.log(`Applied ${overridesApplied} NPDES ID overrides (${overrideRows.length} total in table)`);
  }

  let eligiblePermits = Array.from(permitMap.values()).sort((a, b) =>
    a.npdes_id.localeCompare(b.npdes_id),
  );

  let stalePermitsSkipped = 0;
  if (
    staleOnly &&
    staleDays > 0 &&
    targetNpdesIds.length === 0 &&
    continuationNpdesIds.length === 0
  ) {
    const npdesIds = eligiblePermits.map((p) => p.npdes_id);
    const syncedAtByNpdes = new Map<string, string>();
    const BATCH = 200;
    for (let i = 0; i < npdesIds.length; i += BATCH) {
      const chunk = npdesIds.slice(i, i + BATCH);
      let facilityQuery = supabase
        .from("external_echo_facilities")
        .select("npdes_id, synced_at")
        .in("npdes_id", chunk);
      if (!isPrivileged) {
        facilityQuery = facilityQuery.eq("organization_id", callerOrgId);
      }
      const { data: facilityRows, error: facilityErr } = await facilityQuery;
      if (facilityErr) {
        console.error("Stale permit filter query failed:", facilityErr.message);
        break;
      }
      for (const row of facilityRows || []) {
        if (row.synced_at) syncedAtByNpdes.set(row.npdes_id, row.synced_at);
      }
    }

    const cutoffMs = Date.now() - staleDays * 86_400_000;
    const before = eligiblePermits.length;
    eligiblePermits = eligiblePermits.filter((p) => {
      const syncedAt = syncedAtByNpdes.get(p.npdes_id);
      if (!syncedAt) return true;
      return new Date(syncedAt).getTime() < cutoffMs;
    });
    stalePermitsSkipped = before - eligiblePermits.length;
    console.log(
      `Stale filter (${staleDays}d): ${eligiblePermits.length} to sync, ${stalePermitsSkipped} skipped as fresh`,
    );
  }

  const targetSet = new Set(targetNpdesIds);
  const permitByNpdesId = new Map(
    eligiblePermits.map((permit) => [permit.npdes_id, permit]),
  );
  const batchPlan = buildEchoBatchPlan({
    eligibleNpdesIds: eligiblePermits.map((permit) => permit.npdes_id),
    targetNpdesIds,
    continuationNpdesIds,
    priorCoverageNpdesIds: coverageNpdesIds,
    limit,
    offset,
  });
  const permits = batchPlan.selectedNpdesIds
    .map((npdesId) => permitByNpdesId.get(npdesId))
    .filter((permit): permit is PermitMapping => Boolean(permit));
  const hasMore = batchPlan.hasMore;
  coverageNpdesIds = batchPlan.coverageNpdesIds;
  const unresolvedNpdesIds = normalizeNpdesIds([
    ...priorUnresolvedNpdesIds,
    ...batchPlan.unresolvedNpdesIds,
  ]);

  console.log(
    `Found ${rawPermitIds.size} unique raw permits, ${eligiblePermits.length} eligible, syncing ${permits.length} (batch=${batchNumber}, offset=${offset}, limit=${limit || "all"}, hasMore=${hasMore}, targets=${targetSet.size}, continuation=${continuationNpdesIds.length})`,
  );

  if (dryRun) {
    const coverageResult = buildEchoCoverageResult({
      coverageNpdesIds,
      processedNpdesIds: permits.map((permit) => permit.npdes_id),
      remainingUnprocessedNpdesIds: batchPlan.remainingUnprocessedNpdesIds,
      failedNpdesIds: priorFailedNpdesIds,
      unresolvedNpdesIds,
      continuationDispatched: false,
      batchNumber,
      rootJobRunId,
    });
    return new Response(
      JSON.stringify({
        success: true,
        dryRun: true,
        source: "echo",
        permits_total: rawPermitIds.size,
        permits_eligible: eligiblePermits.length,
        permits_selected: permits.length,
        permits_skipped_pattern: permitsSkippedPatternSet.size,
        permits_skipped_invalid: permitsSkippedInvalidSet.size,
        permits_skipped_missing_org: permitsSkippedMissingOrgSet.size,
        overrides_applied: overridesApplied,
        selected_npdes_ids: permits.map((p) => p.npdes_id),
        run_tag: runTag,
        stale_days: staleDays > 0 ? staleDays : undefined,
        stale_only: staleOnly || undefined,
        stale_permits_skipped: stalePermitsSkipped > 0 ? stalePermitsSkipped : undefined,
        coverage: coverageResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (permits.length === 0) {
    const coverageResult = buildEchoCoverageResult({
      coverageNpdesIds,
      processedNpdesIds: [],
      remainingUnprocessedNpdesIds: batchPlan.remainingUnprocessedNpdesIds,
      failedNpdesIds: priorFailedNpdesIds,
      unresolvedNpdesIds,
      continuationDispatched: false,
      batchNumber,
      rootJobRunId,
    });
    const noPermitStatus = coverageResult.coverage_complete ? "completed" : "failed";
    const { data: noPermitSyncLog, error: noPermitSyncLogError } = await supabase
      .from("external_sync_log")
      .insert({
        organization_id: callerOrgId,
        source: "echo_facility",
        sync_type: syncType,
        status: noPermitStatus,
        triggered_by: auth.userId,
        completed_at: new Date().toISOString(),
        records_synced: 0,
        records_failed: coverageResult.remaining_count,
        error_details: coverageResult.coverage_complete
          ? null
          : { remaining_npdes_ids: coverageResult.remaining_npdes_ids },
        metadata: {
          run_tag: runTag,
          batch_number: batchNumber,
          coverage: coverageResult,
        },
      })
      .select("id")
      .single();

    if (noPermitSyncLogError || !noPermitSyncLog) {
      await completeJobRun(supabase, jobRunId, "failed", {
        rowsScanned: 0,
        rowsAffected: 0,
        errorDetail:
          `Failed to persist empty ECHO coverage: ${noPermitSyncLogError?.message ?? "no log row"}`,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to persist ECHO coverage",
          coverage: coverageResult,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: noPermitAuditError } = await supabase.from("audit_log").insert({
      user_id: auth.userId,
      organization_id: callerOrgId,
      action: coverageResult.coverage_complete
        ? "external_sync_completed"
        : "external_sync_failed",
      module: "external_data",
      table_name: "external_sync_log",
      record_id: noPermitSyncLog.id,
      description: JSON.stringify({
        source: "echo",
        run_tag: runTag,
        triggered_by: auth.userId || "system",
        role: auth.role,
        coverage: coverageResult,
      }),
    });
    if (noPermitAuditError) {
      console.error("No-permit audit log insert failed:", noPermitAuditError.message);
    }

    await completeJobRun(
      supabase,
      jobRunId,
      coverageResult.coverage_complete ? "succeeded" : "failed",
      {
        rowsScanned: 0,
        rowsAffected: 0,
        errorDetail: coverageResult.coverage_complete
          ? null
          : `ECHO coverage incomplete; remaining=${coverageResult.remaining_count}`,
      },
    );
    return new Response(
      JSON.stringify({
        success: coverageResult.coverage_complete,
        message: "No permits found to sync",
        permitsSynced: 0,
        totalPermits: rawPermitIds.size,
        permits_total: rawPermitIds.size,
        permits_eligible: eligiblePermits.length,
        permits_skipped_pattern: permitsSkippedPatternSet.size,
        permits_skipped_invalid: permitsSkippedInvalidSet.size,
        permits_skipped_missing_org: permitsSkippedMissingOrgSet.size,
        overrides_applied: overridesApplied,
        syncLogId: noPermitSyncLog.id,
        coverage: coverageResult,
      }),
      {
        status: coverageResult.coverage_complete ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
      triggered_by: auth.userId,
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
  let facilityEmptyResponses = 0;
  let dmrEmptyResponses = 0;
  let dmrChunksFetched = 0;
  let dmrRequestsAttempted = 0;
  let dmrParameterSlices = 0;
  const dmrFetchFailures: DmrFetchFailure[] = [];
  const dmrParameterFailures: DmrFetchFailure[] = [];
  const dmrWindowResults: DmrWindowResult[] = [];
  const errors: string[] = [];
  const failedNpdesIdsThisBatch = new Set<string>();

  // Backfill date range (used for logging; DMR fetch uses chunked windows)
  const backfillStart = new Date();
  backfillStart.setFullYear(backfillStart.getFullYear() - BACKFILL_YEARS);

  for (const permit of permits) {
    const errorsBeforePermit = errors.length;
    try {
      // 3a. Facility info via DFR (Detailed Facility Report)
      if (!skipFacility) {
        const facilityUrl = `${ECHO_BASE}/dfr_rest_services.get_dfr?p_id=${encodeURIComponent(permit.npdes_id)}&output=JSON`;
        const facilityResp = await fetchWithRetry(facilityUrl);

        if (!facilityResp) {
          errors.push(`${permit.npdes_id}: facility fetch failed (continuing to DMR sync)`);
        } else {
          const facilityJson = await facilityResp.json() as Record<string, unknown>;
          const parsed = parseFacilityInfo(facilityJson, permit.npdes_id);

          if (!parsed) {
            facilityEmptyResponses++;
            const topKeys = Object.keys((facilityJson?.Results as Record<string, unknown>) || facilityJson || {});
            const resultsObj = facilityJson?.Results as Record<string, unknown> | undefined;
            const permitsArr = (resultsObj?.Permits as unknown[]) || [];
            const msg = resultsObj?.Message || "no message";
            const fetchStatus = facilityResp.status;
            errors.push(`${permit.npdes_id}: parse returned null (status=${fetchStatus}, msg=${msg}, keys=[${topKeys.slice(0, 5).join(",")}], permits=${permitsArr.length})`);
          }

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
            console.log(`${permit.npdes_id}: no facility data in ECHO (may be general permit)`);
          }
        }

        await sleep(RATE_LIMIT_MS);
      }

      // 3b. DMR / effluent data — date-range chunked (p_start_date + p_end_date)
      const chunkMonths = resolveDmrChunkMonths(permit.npdes_id, dmrChunkMonths || undefined);
      const dmrResult = await syncPermitDmrData(
        supabase,
        permit,
        chunkMonths,
        errors,
        dmrChunkIndex,
        dmrParameterCodes,
      );
      dmrsInserted += dmrResult.inserted;
      dmrEmptyResponses += dmrResult.emptyResponses;
      dmrChunksFetched += dmrResult.chunksFetched;
      dmrRequestsAttempted += dmrResult.requestsAttempted;
      dmrWindowResults.push(...dmrResult.windowResults);
      dmrFetchFailures.push(...dmrResult.failures);
      if (dmrResult.parameterSliced) {
        dmrParameterSlices += dmrResult.parameterRequestsAttempted;
        dmrParameterFailures.push(...dmrResult.failures);
      }

      if (dmrResult.inserted === 0 && dmrResult.emptyResponses > 0) {
        console.log(`${permit.npdes_id}: no DMR rows synced across ${dmrResult.chunksFetched} date chunks`);
      }
    } catch (err) {
      errors.push(`${permit.npdes_id}: unexpected error — ${String(err)}`);
    } finally {
      if (errors.length > errorsBeforePermit) {
        failedNpdesIdsThisBatch.add(permit.npdes_id);
      }
    }
  }

  // -----------------------------------------------------------------------
  // 4. Continue the weekly drain, then publish batch coverage
  // -----------------------------------------------------------------------
  const accumulatedFailedNpdesIds = normalizeNpdesIds([
    ...priorFailedNpdesIds,
    ...failedNpdesIdsThisBatch,
  ]);
  let continuationRequestId: number | null = null;
  let continuationError: string | null = null;
  let continuationDispatched = false;

  if (autoContinue && batchPlan.remainingUnprocessedNpdesIds.length > 0) {
    const continuation = await dispatchWeeklyContinuation(supabase, {
      remainingNpdesIds: batchPlan.remainingUnprocessedNpdesIds,
      coverageNpdesIds,
      failedNpdesIds: accumulatedFailedNpdesIds,
      unresolvedNpdesIds,
      batchNumber: batchNumber + 1,
      rootJobRunId,
      runTag: runTag ?? "cron-weekly-echo",
      staleDays: staleDays || 7,
      batchSize: limit || 5,
    });
    continuationRequestId = continuation.requestId;
    continuationError = continuation.error;
    continuationDispatched = continuation.error === null;
    if (continuationError) {
      errors.push(`weekly continuation dispatch failed — ${continuationError}`);
    }
  }

  const coverageResult = buildEchoCoverageResult({
    coverageNpdesIds,
    processedNpdesIds: permits.map((permit) => permit.npdes_id),
    remainingUnprocessedNpdesIds: batchPlan.remainingUnprocessedNpdesIds,
    failedNpdesIds: accumulatedFailedNpdesIds,
    unresolvedNpdesIds,
    continuationDispatched,
    continuationRequestId,
    continuationError,
    batchNumber,
    rootJobRunId,
  });

  // -----------------------------------------------------------------------
  // 5. Update sync log
  // -----------------------------------------------------------------------
  // Truthful status: nothing synced + errors → failed; something synced but
  // some chunks/permits errored → partial (so cron/stale logic doesn't treat a
  // gap-filled sync as complete); otherwise completed.
  const finalStatus =
    errors.length === 0
      ? "completed"
      : dmrsInserted === 0 && facilitiesSynced === 0
        ? "failed"
        : "partial";
  await supabase
    .from("external_sync_log")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      records_synced: facilitiesSynced,
      records_failed: errors.length,
      error_details: errors.length > 0 ? { errors } : null,
      metadata: {
        dmrs_inserted: dmrsInserted,
        permits_total: rawPermitIds.size,
        permits_eligible: eligiblePermits.length,
        permits_synced_this_batch: permits.length,
        permits_skipped_pattern: permitsSkippedPatternSet.size,
        permits_skipped_invalid: permitsSkippedInvalidSet.size,
        permits_skipped_missing_org: permitsSkippedMissingOrgSet.size,
        overrides_applied: overridesApplied,
        facility_empty_responses: facilityEmptyResponses,
        dmr_empty_responses: dmrEmptyResponses,
        dmr_chunks_fetched: dmrChunksFetched,
        dmr_requests_attempted: dmrRequestsAttempted,
        dmr_parameter_slices: dmrParameterSlices,
        dmr_parameter_failures: dmrParameterFailures,
        dmr_bad_windows: dmrFetchFailures,
        dmr_window_results: dmrWindowResults,
        offset,
        has_more: hasMore,
        next_offset:
          !autoContinue && continuationNpdesIds.length === 0 && hasMore
            ? offset + permits.length
            : null,
        target_npdes_ids: targetSet.size > 0 ? Array.from(targetSet) : null,
        run_tag: runTag,
        triggered_by: auth.userId || "system",
        stale_days: staleDays > 0 ? staleDays : null,
        stale_only: staleOnly,
        stale_permits_skipped: stalePermitsSkipped,
        coverage: coverageResult,
      },
    })
    .eq("id", syncLog.id);

  // -----------------------------------------------------------------------
  // 6. Audit log
  // -----------------------------------------------------------------------
  const { error: auditErr } = await supabase.from("audit_log").insert({
    user_id: auth.userId,
    organization_id: orgId,
    action: finalStatus === "failed" ? "external_sync_failed" : "external_sync_completed",
    module: "external_data",
    table_name: "external_sync_log",
    record_id: syncLog.id,
    description: JSON.stringify({
      source: "echo",
      facilities_synced: facilitiesSynced,
      dmrs_inserted: dmrsInserted,
      permits_total: rawPermitIds.size,
      permits_eligible: eligiblePermits.length,
      permits_skipped_pattern: permitsSkippedPatternSet.size,
      permits_skipped_invalid: permitsSkippedInvalidSet.size,
      permits_skipped_missing_org: permitsSkippedMissingOrgSet.size,
      overrides_applied: overridesApplied,
      facility_empty_responses: facilityEmptyResponses,
      dmr_empty_responses: dmrEmptyResponses,
      errors_count: errors.length,
      run_tag: runTag,
      triggered_by: auth.userId || "system",
      role: auth.role,
      coverage: coverageResult,
    }),
  });
  if (auditErr) console.error("Audit log insert failed:", auditErr.message);

  // -----------------------------------------------------------------------
  // 7. Trigger discrepancy detection
  // -----------------------------------------------------------------------
  try {
    const detectUrl = `${SUPABASE_URL}/functions/v1/detect-discrepancies`;
    const resp = await fetch(detectUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-internal-secret": SYNC_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        source: "echo",
        organization_id: orgId,
        sync_log_id: syncLog.id,
        triggered_by: auth.userId,
        target_npdes_ids: permits.map((permit) => permit.npdes_id),
      }),
    });
    if (!resp.ok) {
      console.error(`detect-discrepancies auto-trigger failed: ${resp.status} ${resp.statusText}`);
    }
  } catch (err) {
    console.error("Failed to trigger discrepancy detection:", err);
    // Non-fatal — sync data is still saved
  }

  console.log(`Sync complete: ${facilitiesSynced} facilities, ${dmrsInserted} DMRs, ${errors.length} errors`);

  // Report the truthful terminal status to the job_runs ledger row opened by
  // the cron wrapper. Intermediate batches succeed only after the next audited
  // job is dispatched; a terminal batch with uncovered permits is failed.
  const terminalCoverageFailure =
    !continuationDispatched &&
    batchPlan.remainingUnprocessedNpdesIds.length === 0 &&
    coverageResult.remaining_count > 0;
  const jobStatus =
    finalStatus === "failed" || continuationError || terminalCoverageFailure
      ? "failed"
      : "succeeded";
  await completeJobRun(supabase, jobRunId, jobStatus, {
    rowsScanned: facilitiesSynced,
    rowsAffected: dmrsInserted,
    errorDetail: jobStatus === "failed"
      ? continuationError
        ? `ECHO continuation dispatch failed: ${continuationError}`
        : `ECHO coverage incomplete; remaining=${coverageResult.remaining_count}; status=${finalStatus}`
      : errors.length > 0
        ? `${errors.length} errors; status=${finalStatus}`
        : null,
  });

  return new Response(
    JSON.stringify({
      success: jobStatus === "succeeded",
      syncLogId: syncLog.id,
      permitsSynced: facilitiesSynced,
      dmrsInserted,
      errors: errors.length > 0 ? errors : undefined,
      totalPermits: rawPermitIds.size,
      permits_total: rawPermitIds.size,
      permits_eligible: eligiblePermits.length,
      permits_skipped_pattern: permitsSkippedPatternSet.size,
      permits_skipped_invalid: permitsSkippedInvalidSet.size,
      permits_skipped_missing_org: permitsSkippedMissingOrgSet.size,
      overrides_applied: overridesApplied,
      facility_empty_responses: facilityEmptyResponses,
      dmr_empty_responses: dmrEmptyResponses,
      dmr_chunks_fetched: dmrChunksFetched,
      dmr_requests_attempted: dmrRequestsAttempted,
      dmr_parameter_slices: dmrParameterSlices || undefined,
      dmr_parameter_failures: dmrParameterFailures.length > 0 ? dmrParameterFailures : undefined,
      dmr_bad_windows: dmrFetchFailures.length > 0 ? dmrFetchFailures : undefined,
      dmr_window_results: dmrWindowResults.length > 0 ? dmrWindowResults : undefined,
      batchSize: permits.length,
      batchNumber,
      offset,
      hasMore,
      nextOffset:
        !autoContinue && continuationNpdesIds.length === 0 && hasMore
          ? offset + permits.length
          : null,
      target_npdes_ids: targetSet.size > 0 ? Array.from(targetSet) : undefined,
      run_tag: runTag ?? undefined,
      stale_days: staleDays > 0 ? staleDays : undefined,
      stale_only: staleOnly || undefined,
      stale_permits_skipped: stalePermitsSkipped > 0 ? stalePermitsSkipped : undefined,
      coverage: coverageResult,
    }),
    {
      status: jobStatus === "succeeded" ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

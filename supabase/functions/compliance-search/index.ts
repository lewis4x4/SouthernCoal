import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const CLAUDE_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESULTS = 50;
const ABSOLUTE_MAX_RESULTS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type QueryDomain =
  | "permits"
  | "exceedances"
  | "penalties"
  | "sampling"
  | "organizations"
  | "lab_results"
  | "dmr"
  | "consent_decree"
  | "enforcement";

interface ComplianceSearchRequest {
  query: string;
  context?: {
    stateFilter?: string;
    siteFilter?: string;
    dateRange?: { start: string; end: string };
  };
  maxResults?: number;
  reviewMode?: boolean;
}

interface UserContext {
  userId: string;
  organizationId: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Role-based max results + domain restrictions
// ---------------------------------------------------------------------------
const ROLE_MAX_RESULTS: Record<string, number> = {
  executive: 500,
  environmental_manager: 500,
  admin: 500,
  site_manager: 200,
  safety_manager: 200,
  field_sampler: 100,
  lab_tech: 100,
  read_only: 25,
};

const ROLE_DOMAIN_RESTRICTIONS: Record<string, QueryDomain[] | null> = {
  executive: null,
  environmental_manager: null,
  admin: null,
  site_manager: null,
  safety_manager: ["exceedances", "organizations", "sampling", "enforcement"],
  field_sampler: ["permits", "sampling", "organizations", "lab_results"],
  lab_tech: ["organizations", "lab_results"],
  read_only: null,
};

// ---------------------------------------------------------------------------
// Domain → Table allowlist
// ---------------------------------------------------------------------------
const DOMAIN_TABLE_ALLOWLIST: Record<QueryDomain, string[]> = {
  permits: [
    "npdes_permits", "outfalls", "permit_limits", "permit_limit_tables",
    "conditional_exemptions", "parameters", "receiving_waters",
  ],
  exceedances: [
    "exceedances", "corrective_actions", "outfalls", "npdes_permits",
    "parameters", "sites",
  ],
  penalties: [
    "stipulated_penalties", "exceedances", "organizations",
  ],
  sampling: [
    "sampling_schedules", "sampling_calendar", "outfalls", "parameters",
    "npdes_permits", "sites",
  ],
  organizations: [
    "organizations", "sites", "user_profiles", "states",
  ],
  lab_results: [
    "lab_results", "sampling_events", "data_imports",
    "parameters", "outfalls", "npdes_permits", "sites",
  ],
  dmr: [
    "dmr_submissions", "dmr_line_items",
    "outfalls", "npdes_permits", "parameters", "sites",
  ],
  consent_decree: [
    "consent_decree_obligations", "organizations", "user_profiles",
  ],
  enforcement: [
    "enforcement_actions", "compliance_audits",
    "organizations", "sites",
  ],
};

// ---------------------------------------------------------------------------
// Schema Contexts per domain
// ---------------------------------------------------------------------------
const SCHEMA_CONTEXTS: Record<QueryDomain, string> = {
  permits: `
## Permits & Limits Tables

### npdes_permits
- id: uuid PK
- organization_id: uuid FK → organizations
- site_id: uuid FK → sites
- permit_number: text (e.g., 'WV0097446', 'TN0069159')
- permit_type: enum ('individual', 'general')
- general_permit_number: text (KY general permits)
- coverage_letter_number: text (KY coverage letters)
- state_code: text FK → states ('AL','KY','TN','VA','WV')
- effective_date: date
- expiration_date: date
- administratively_continued: boolean
- status: enum ('active', 'expired', 'continued', 'terminated')
- permittee_name: text
- facility_name: text
- created_at, updated_at: timestamptz

### outfalls
- id: uuid PK
- permit_id: uuid FK → npdes_permits
- outfall_number: text (e.g., '001', '002', 'DLWOC1')
- outfall_type: text
- latitude, longitude: decimal
- is_representative: boolean
- is_active: boolean
- dsn: text (Discharge Serial Number)
- receiving_water_id: uuid FK → receiving_waters

### permit_limits
- id: uuid PK
- outfall_id: uuid FK → outfalls
- parameter_id: uuid FK → parameters
- limit_type: enum ('daily_max', 'daily_min', 'monthly_avg', 'pass_fail', 'report_only')
- limit_value: numeric
- limit_unit: text
- effective_date, expiration_date: date
- permit_limit_table_id: uuid FK → permit_limit_tables

### permit_limit_tables
- id: uuid PK
- permit_id: uuid FK → npdes_permits
- table_name: text (e.g., 'Active Mining Group A', 'Precipitation Exemption')

### conditional_exemptions
- id: uuid PK
- permit_id: uuid FK → npdes_permits
- exemption_type: text
- trigger_conditions: jsonb
- alternate_limits: jsonb

### parameters
- id: uuid PK
- parameter_name: text (e.g., 'Iron', 'pH', 'Total Suspended Solids')
- storet_code: text (e.g., '01045', '00400', '00530')
- fraction: text ('total', 'dissolved', 'total_recoverable')
- default_unit: text
`,

  exceedances: `
## Exceedance & Corrective Action Tables

### exceedances
- id: uuid PK
- organization_id: uuid FK → organizations
- site_id: uuid FK → sites
- outfall_id: uuid FK → outfalls
- parameter_id: uuid FK → parameters
- permit_limit_id: uuid FK → permit_limits
- lab_result_id: uuid FK → lab_results
- exceedance_date: date
- result_value: numeric
- limit_value: numeric
- limit_type: text
- severity: text ('minor', 'moderate', 'major', 'critical')
- cause_narrative: text
- corrective_action_narrative: text
- prevention_narrative: text
- exemption_claimed: boolean
- exemption_approved: boolean
- consent_decree_reported: boolean
- status: enum ('open', 'under_review', 'resolved', 'disputed')
- created_at, updated_at: timestamptz

### corrective_actions
- id: uuid PK
- organization_id: uuid FK → organizations
- source_type: text ('exceedance', 'enforcement', 'audit', 'inspection')
- source_id: uuid
- root_cause: text
- description: text
- assigned_to: uuid FK → user_profiles
- priority: enum ('low', 'medium', 'high', 'critical')
- due_date: date
- status: enum ('open', 'in_progress', 'completed', 'verified', 'closed')
- verified_by: uuid FK → user_profiles
- verified_date: date
`,

  penalties: `
## Penalty Tables

### stipulated_penalties
- id: uuid PK
- organization_id: uuid FK → organizations
- exceedance_id: uuid FK → exceedances
- consent_decree_paragraph: text
- violation_category: text
- daily_rate: numeric ($250-$4,500/day)
- days_in_violation: integer
- total_penalty: numeric (daily_rate x days)
- payment_status: enum ('pending', 'invoiced', 'paid', 'disputed')
- payment_date: date
- payment_amount: numeric
- quarterly_report_id: uuid FK → quarterly_reports
`,

  sampling: `
## Sampling Tables

### sampling_schedules
- id: uuid PK
- permit_id: uuid FK → npdes_permits
- outfall_id: uuid FK → outfalls
- parameter_id: uuid FK → parameters
- frequency_code: text ('2/month', '1/quarter', '1/year')
- sample_type: text ('grab', 'composite')
- min_days_between: integer
- seasonal_restriction: text
- condition_restriction: text

### sampling_calendar
- id: uuid PK
- schedule_id: uuid FK → sampling_schedules
- outfall_id: uuid FK → outfalls
- parameter_id: uuid FK → parameters
- due_date: date
- status: enum ('pending', 'completed', 'overdue', 'skipped')
- skip_reason: text
- sampling_event_id: uuid FK → sampling_events
`,

  organizations: `
## Organization Tables

### organizations
- id: uuid PK
- tenant_id: uuid FK → tenants
- parent_organization_id: uuid (self-referencing hierarchy)
- name: text
- legal_name: text
- address, city, state, zip: text
- status: enum ('active', 'inactive')

### sites
- id: uuid PK
- organization_id: uuid FK → organizations
- name: text
- state_code: text FK → states
- county: text
- smcra_number: text
- latitude, longitude: decimal
- status: enum ('active', 'reclamation', 'closed')

### user_profiles
- id: uuid PK (matches auth.users)
- organization_id: uuid FK → organizations
- full_name: text
- email: text
- phone: text

### states
- code: text PK ('AL','KY','TN','VA','WV')
- name: text
- regulatory_agency: text
`,

  lab_results: `
## Lab Results Tables

### lab_results
- id: uuid PK
- sampling_event_id: uuid FK → sampling_events
- parameter_id: uuid FK → parameters
- result_value: numeric (the measured value)
- result_unit: text (e.g., 'mg/L', 'ug/L', 's.u.')
- below_detection: boolean (true if value was below detection limit)
- detection_limit: numeric (the detection limit value)
- data_qualifier: text ('<' for below detection, '>' for above range, 'J' for estimated)
- analysis_date: date (when the lab analyzed the sample)
- lab_name: text (name of the analyzing laboratory)
- method: text (analytical method, e.g., 'EPA 200.7', 'SM 2540D')
- hold_time_compliant: boolean (true if analysis was within required hold time)
- import_batch_id: uuid FK → data_imports
- created_at, updated_at: timestamptz

### sampling_events
- id: uuid PK
- organization_id: uuid FK → organizations (USE THIS FOR ORG FILTER)
- site_id: uuid FK → sites
- outfall_id: uuid FK → outfalls
- sample_date: date
- sample_time: time
- sampled_by: text
- sample_type: text ('grab' or 'composite')
- weather_conditions: text
- precipitation_inches: numeric
- chain_of_custody_number: text
- field_notes: text

### data_imports
- id: uuid PK
- organization_id: uuid FK → organizations (USE THIS FOR ORG FILTER)
- site_id: uuid FK → sites
- import_type: text ('lab_edd', 'dmr_csv', 'monitoring_report', 'field_log')
- file_name: text
- file_hash: text (SHA-256 for deduplication)
- status: enum ('pending', 'processing', 'completed', 'failed', 'rolled_back')
- rows_total: integer
- rows_imported: integer
- rows_rejected: integer
- error_log: jsonb (array of {row, field, error} objects)
- imported_by: uuid FK → user_profiles
- created_at: timestamptz

### parameters (shared with permits domain)
- id: uuid PK
- parameter_name: text (e.g., 'Iron', 'pH', 'Total Suspended Solids')
- storet_code: text (e.g., '01045', '00400', '00530')
- fraction: text ('total', 'dissolved', 'total_recoverable')
- default_unit: text

IMPORTANT JOINS:
- lab_results → sampling_events (via sampling_event_id) → get organization_id, site_id, outfall_id
- lab_results → parameters (via parameter_id) → get parameter_name
- lab_results → data_imports (via import_batch_id) → get import status and file info
- sampling_events has direct organization_id → use this for tenant filtering
`,

  dmr: `
## DMR (Discharge Monitoring Report) Tables

### dmr_submissions
- id: uuid PK
- permit_id: uuid FK → npdes_permits
- period_start: date (first day of monitoring period)
- period_end: date (last day of monitoring period)
- reporting_frequency: text ('monthly', 'quarterly', 'annual')
- status: enum ('draft', 'review', 'approved', 'submitted')
- submission_system: text ('netdmr', 'e2dmr', 'mytdec', 'edmr')
- confirmation_number: text
- submitted_at: timestamptz
- submitted_by: uuid FK → user_profiles
- created_at, updated_at: timestamptz

### dmr_line_items
- id: uuid PK
- dmr_submission_id: uuid FK → dmr_submissions
- outfall_id: uuid FK → outfalls
- parameter_id: uuid FK → parameters
- monthly_avg: numeric (calculated monthly average)
- daily_max: numeric (maximum single-day value)
- daily_min: numeric (minimum single-day value)
- avg_qualifier: text ('<' if below detection, '>' if above range)
- max_qualifier: text
- min_qualifier: text
- sample_count: integer
- exceedance_count: integer
- nodi_code: text ('C' = No Discharge, '9' = Conditional, 'N' = No Data Available)
- sample_type: text ('GR' = Grab, 'CP' = Composite, 'EST' = Estimated)
- below_detection_method: text
- limit_value: numeric (the permit limit for comparison)
- limit_type: text ('daily_max', 'monthly_avg', etc.)

IMPORTANT JOINS:
- dmr_submissions → npdes_permits (via permit_id) → get permit_number, state_code
- dmr_line_items → dmr_submissions (via dmr_submission_id) → get period, status
- dmr_line_items → outfalls (via outfall_id) → get outfall_number
- dmr_line_items → parameters (via parameter_id) → get parameter_name
- For org filter: dmr_submissions → npdes_permits → sites.organization_id
`,

  consent_decree: `
## Consent Decree Tables

### consent_decree_obligations
- id: uuid PK
- organization_id: uuid FK → organizations (USE THIS FOR ORG FILTER)
- obligation_number: integer (sequential reference, e.g., 1-75)
- cd_paragraph: text (Consent Decree paragraph reference, e.g., '47.a', '52.b.iii')
- description: text (human-readable description of the obligation)
- obligation_type: enum ('one_time', 'recurring', 'ongoing', 'conditional')
- due_date: date (for one-time obligations)
- recurrence_rule: text (for recurring: 'quarterly', 'annually', 'monthly')
- status: enum ('pending', 'in_progress', 'completed', 'overdue', 'not_applicable')
- evidence_required: text (what documentation proves compliance)
- evidence_status: text ('not_started', 'partial', 'complete')
- assigned_to: uuid FK → user_profiles
- completed_at: timestamptz
- verified_by: uuid FK → user_profiles
- notes: text
- created_at, updated_at: timestamptz

IMPORTANT: This table has direct organization_id → use it for tenant filtering.
There are 75 seeded obligations from Case 7:16-cv-00462-GEC.
`,

  enforcement: `
## Enforcement Tables

### enforcement_actions
- id: uuid PK
- organization_id: uuid FK → organizations (USE THIS FOR ORG FILTER)
- site_id: uuid FK → sites
- action_type: text ('nov', 'cessation_order', 'consent_order', 'penalty_assessment', 'compliance_schedule', 'show_cause_order', 'administrative_order', 'civil_referral', 'criminal_referral', 'permit_revocation', 'bond_forfeiture', 'injunctive_relief', 'supplemental_environmental_project', 'other')
- issuing_agency: text (e.g., 'EPA', 'KYDEP', 'WVDEP', 'ADEM', 'TDEC', 'VADEQ', 'MSHA', 'OSMRE')
- action_date: date
- received_date: date
- description: text
- status: enum ('open', 'responded', 'resolved', 'appealed', 'withdrawn')
- penalty_amount: numeric (assessed penalty, if any)
- response_deadline: date
- response_filed: boolean
- resolution_date: date
- resolution_notes: text
- created_at, updated_at: timestamptz

### compliance_audits
- id: uuid PK
- organization_id: uuid FK → organizations (USE THIS FOR ORG FILTER)
- site_id: uuid FK → sites
- audit_type: text ('internal', 'third_party', 'regulatory_inspection', 'ems_audit')
- audit_date: date
- auditor: text (name or firm)
- scope: text (what the audit covered)
- findings_count: integer
- critical_findings_count: integer
- status: enum ('scheduled', 'in_progress', 'completed', 'findings_open', 'closed')
- report_file_id: uuid
- next_audit_date: date
- created_at, updated_at: timestamptz

IMPORTANT: Both tables have direct organization_id → use for tenant filtering.
`,
};

// ---------------------------------------------------------------------------
// Query Classification
// ---------------------------------------------------------------------------
function classifyQuery(query: string): QueryDomain[] {
  const q = query.toLowerCase();
  const domains: QueryDomain[] = [];

  if (/permit|limit|outfall|discharge|npdes|expir/.test(q)) domains.push("permits");
  if (/exceed|violat|over limit|out of compliance|breach/.test(q)) domains.push("exceedances");
  if (/penal|fine|stipulated|payment|exposure|cost/.test(q)) domains.push("penalties");
  if (/sampl|schedule|calendar|overdue|missed|frequency|due/.test(q)) domains.push("sampling");
  if (/site|facility|subsidiary|organization|mine|personnel|who/.test(q)) domains.push("organizations");
  if (/lab|result|sample result|edd|detection|hold time|analysis|analyt|concentration/.test(q)) domains.push("lab_results");
  if (/dmr|discharge monitoring|submission|filed|reported|nodi|no discharge|netdmr/.test(q)) domains.push("dmr");
  if (/consent decree|obligation|cd |decree|paragraph|stipulat/.test(q)) domains.push("consent_decree");
  if (/enforce|nov |notice of violation|audit|inspection|cessation|finding/.test(q)) domains.push("enforcement");

  return domains.length > 0 ? domains : ["organizations"];
}

function getAllowedTables(domains: QueryDomain[]): string[] {
  const tables = new Set<string>();
  for (const domain of domains) {
    for (const table of DOMAIN_TABLE_ALLOWLIST[domain] || []) {
      tables.add(table);
    }
  }
  return Array.from(tables);
}

function filterDomainsByRole(domains: QueryDomain[], role: string): QueryDomain[] {
  const restriction = ROLE_DOMAIN_RESTRICTIONS[role];
  if (!restriction) return domains;
  return domains.filter((d) => restriction.includes(d));
}

// ---------------------------------------------------------------------------
// SQL Safety Validation
// ---------------------------------------------------------------------------
function validateSQL(
  sql: string,
  allowedTables: string[],
): { safe: boolean; reason?: string } {
  const upper = sql.toUpperCase().trim();

  if (!upper.startsWith("SELECT")) {
    return { safe: false, reason: "Only SELECT queries are permitted" };
  }

  const blocked = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
    "GRANT", "REVOKE", "EXECUTE", "EXEC", "CALL", "DO ", "COPY",
    "pg_read_file", "pg_write_file", "pg_ls_dir", "pg_sleep",
    "lo_import", "lo_export", "dblink", "current_setting",
  ];

  for (const keyword of blocked) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return { safe: false, reason: `Blocked keyword: ${keyword}` };
    }
  }

  if (!sql.includes("organization_id")) {
    return { safe: false, reason: "Query must include organization_id filter for tenant isolation" };
  }

  if (!/LIMIT\s+\$?\d+/i.test(sql)) {
    return { safe: false, reason: "Query must include LIMIT clause" };
  }

  if (/\bauth\./i.test(sql)) {
    return { safe: false, reason: "Cannot query auth schema" };
  }

  if (/\baudit_log\b/i.test(sql)) {
    return { safe: false, reason: "Cannot query audit_log through search" };
  }

  const tablePattern = /\b(?:FROM|JOIN)\s+([a-z_]+)/gi;
  let match;
  while ((match = tablePattern.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();
    if (!allowedTables.includes(tableName)) {
      return { safe: false, reason: `Table '${tableName}' is not in the allowed set for this query domain` };
    }
  }

  const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
  if (joinCount > 2) {
    return { safe: false, reason: "Query exceeds maximum join depth of 3 tables" };
  }

  return { safe: true };
}

// ---------------------------------------------------------------------------
// Data Freshness
// ---------------------------------------------------------------------------
async function getDataFreshness(
  supabase: ReturnType<typeof createClient>,
  domains: QueryDomain[],
  orgId: string,
): Promise<string> {
  const dataDomains: QueryDomain[] = ["exceedances", "penalties", "sampling", "lab_results", "dmr"];
  const needsFreshness = domains.some((d) => dataDomains.includes(d));
  if (!needsFreshness) return "";

  const { data } = await supabase
    .from("data_imports")
    .select("created_at")
    .eq("organization_id", orgId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data?.created_at || "";
}

// ---------------------------------------------------------------------------
// Audit Logging (corrected column names)
// ---------------------------------------------------------------------------
async function auditLog(
  supabase: ReturnType<typeof createClient>,
  userContext: UserContext,
  request: ComplianceSearchRequest,
  queryId: string,
  details: Record<string, unknown>,
) {
  await supabase.from("audit_log").insert({
    user_id: userContext.userId,
    action: "compliance_search",
    module: "search",
    table_name: "compliance_search",
    record_id: queryId,
    old_values: null,
    new_values: details.resultCount != null
      ? { result_count: details.resultCount }
      : null,
    description: JSON.stringify({
      natural_language_query: request.query,
      generated_sql: details.generatedSql || null,
      sql_params: details.sqlParams || null,
      domains_searched: details.domainsSearched || null,
      tables_queried: details.tablesQueried || null,
      result_count: details.resultCount ?? null,
      execution_time_ms: details.executionTimeMs ?? null,
      validation_passed: details.validationFailed ? false : true,
      validation_reason: details.validationReason || null,
      sql_review_enabled: request.reviewMode || false,
      estimated_token_cost: details.estimatedCost ?? null,
      context_filters: request.context || null,
      error: details.error || null,
    }),
    created_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const queryId = crypto.randomUUID();

  try {
    // --- Step 1: Validate JWT + extract user context ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get user profile with role and org
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "User profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get role from user_role_assignments
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
      : "read_only";

    const userContext: UserContext = {
      userId: user.id,
      organizationId: profile.organization_id,
      role: userRole,
    };

    // --- Parse request body ---
    const request: ComplianceSearchRequest = await req.json();
    if (!request.query || typeof request.query !== "string" || request.query.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Query text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Step 2: Rate limit check ---
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userContext.userId)
      .eq("action", "compliance_search")
      .gte("created_at", windowStart);

    if ((recentCount || 0) >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded. Please wait a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } },
      );
    }

    // --- Step 3: Classify query + apply role domain restrictions ---
    let domains = classifyQuery(request.query);
    domains = filterDomainsByRole(domains, userContext.role);

    if (domains.length === 0) {
      await auditLog(supabase, userContext, request, queryId, {
        error: "Your role does not have access to the data needed for this query.",
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Your role does not have access to the data needed for this query.",
          suggestion: "Try asking about facilities, organizations, or your assigned sites.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allowedTables = getAllowedTables(domains);
    const schemaContext = domains
      .map((d) => SCHEMA_CONTEXTS[d])
      .filter(Boolean)
      .join("\n");

    // --- Step 4-5: Claude API call for SQL generation ---
    const roleMaxResults = ROLE_MAX_RESULTS[userContext.role] || DEFAULT_MAX_RESULTS;
    const maxResults = Math.min(
      request.maxResults || DEFAULT_MAX_RESULTS,
      roleMaxResults,
      ABSOLUTE_MAX_RESULTS,
    );

    const systemPrompt = `You are a SQL query generator for a PostgreSQL compliance monitoring database.

CRITICAL RULES:
1. Generate ONLY SELECT queries. Never INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML.
2. Use parameterized queries with $1, $2, etc. for all user-provided values.
3. Always include organization_id filter: WHERE organization_id = $1
4. For tables without direct organization_id, join through: outfalls → npdes_permits → sites.organization_id OR outfalls → npdes_permits.organization_id
5. LIMIT results to the requested max (default ${maxResults}).
6. Use explicit column names — never SELECT *.
7. Include human-readable column aliases.
8. For date filters, use ISO format comparisons.
9. For count/aggregate queries, always include the grouping context.

TABLE ALLOWLIST — You may ONLY query these tables:
${allowedTables.join(", ")}
Any reference to tables outside this list is FORBIDDEN. Return an error if the question requires tables not in this list.

JOIN DEPTH LIMIT: Maximum 3 tables per query. If a question requires more than 3 joins, return an error explaining the query is too complex and suggest the user narrow their question.

COMPLEX QUERY HANDLING:
If a question requires data from more than 3 tables, break it into the most useful single query that stays within the 3-table join limit. Explain in the description what additional context the user might need. Example: Instead of joining lab_results all the way to permit_limits, return the lab results with their values and note "Compare these values against permit limits for the relevant outfalls."

RESPONSE FORMAT (JSON only, no markdown fences, no explanation):
{
  "sql": "SELECT ... FROM ... WHERE organization_id = $1 AND ... LIMIT $2",
  "params": ["<org_id>", ${maxResults}],
  "description": "Brief description of what this query returns",
  "columns": ["column_alias_1", "column_alias_2"],
  "resultType": "table" | "count" | "single_value" | "summary",
  "tablesQueried": ["table1", "table2"],
  "filtersApplied": ["state_code = KY", "exceedance_date > 2025-10-01"]
}

If you cannot answer the question with the available tables, return:
{
  "error": "This question requires [lab_results/dmr/etc] data which is not available in the current search scope.",
  "suggestion": "Try asking about permits, exceedances, penalties, sampling schedules, or facilities."
}

USER CONTEXT:
- Organization ID: ${userContext.organizationId}
- Role: ${userContext.role}
- Max results: ${maxResults}
${request.context?.stateFilter ? `- State filter: ${request.context.stateFilter}` : ""}
${request.context?.dateRange ? `- Date range: ${request.context.dateRange.start} to ${request.context.dateRange.end}` : ""}

DATABASE SCHEMA:
${schemaContext}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

    let claudeResponse;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: request.query }],
        }),
        signal: controller.signal,
      });
      claudeResponse = await resp.json();
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      await auditLog(supabase, userContext, request, queryId, {
        error: isTimeout ? "Claude API timeout" : `Claude API error: ${err}`,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Search is temporarily unavailable. Please try again.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeout);

    // Estimate token cost
    const inputTokens = claudeResponse.usage?.input_tokens || 0;
    const outputTokens = claudeResponse.usage?.output_tokens || 0;
    const estimatedCost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    const responseText = claudeResponse.content?.[0]?.text?.replace(/```json\n?|```/g, "").trim();
    if (!responseText) {
      await auditLog(supabase, userContext, request, queryId, {
        error: "Empty Claude response",
        estimatedCost,
      });
      return new Response(
        JSON.stringify({ success: false, error: "I couldn't understand that query. Try rephrasing." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let generatedQuery;
    try {
      generatedQuery = JSON.parse(responseText);
    } catch {
      await auditLog(supabase, userContext, request, queryId, {
        error: "JSON parse failure",
        rawResponse: responseText.substring(0, 500),
        estimatedCost,
      });
      return new Response(
        JSON.stringify({ success: false, error: "I couldn't understand that query. Try rephrasing." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Handle Claude "can't answer" response
    if (generatedQuery.error) {
      await auditLog(supabase, userContext, request, queryId, {
        error: generatedQuery.error,
        suggestion: generatedQuery.suggestion,
        estimatedCost,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: generatedQuery.error,
          suggestion: generatedQuery.suggestion,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Step 6: SQL validation ---
    const validation = validateSQL(generatedQuery.sql, allowedTables);
    if (!validation.safe) {
      await auditLog(supabase, userContext, request, queryId, {
        generatedSql: generatedQuery.sql,
        validationFailed: true,
        validationReason: validation.reason,
        estimatedCost,
      });
      return new Response(
        JSON.stringify({ success: false, error: "I couldn't understand that query. Try rephrasing." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Step 7: Review mode ---
    if (request.reviewMode) {
      await auditLog(supabase, userContext, request, queryId, {
        generatedSql: generatedQuery.sql,
        domainsSearched: domains,
        estimatedCost,
      });
      return new Response(
        JSON.stringify({
          success: true,
          query: {
            original: request.query,
            sql: generatedQuery.sql,
            description: generatedQuery.description,
            tablesQueried: generatedQuery.tablesQueried || [],
            filtersApplied: generatedQuery.filtersApplied || [],
          },
          results: {
            data: [],
            count: 0,
            resultType: generatedQuery.resultType,
            columns: generatedQuery.columns,
          },
          metadata: {
            executionTimeMs: Date.now() - startTime,
            domainsSearched: domains,
            rlsEnforced: true,
            queryId,
            dataFreshness: "",
            estimatedTokenCost: estimatedCost,
            reviewMode: true,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Step 8: Execute query via user's JWT for RLS ---
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: results, error: queryError } = await userClient.rpc(
      "execute_readonly_query",
      { query_text: generatedQuery.sql, query_params: generatedQuery.params || [] },
    );

    if (queryError) {
      await auditLog(supabase, userContext, request, queryId, {
        generatedSql: generatedQuery.sql,
        error: queryError.message,
        estimatedCost,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `Query error: ${queryError.message}. Try narrowing your search.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Step 9: Data freshness ---
    const dataFreshness = await getDataFreshness(supabase, domains, userContext.organizationId);

    // --- Step 10: Audit log (success) ---
    const executionTimeMs = Date.now() - startTime;
    await auditLog(supabase, userContext, request, queryId, {
      generatedSql: generatedQuery.sql,
      sqlParams: generatedQuery.params,
      domainsSearched: domains,
      tablesQueried: generatedQuery.tablesQueried,
      resultCount: results?.length || 0,
      executionTimeMs,
      estimatedCost,
    });

    // --- Step 11: Return results ---
    return new Response(
      JSON.stringify({
        success: true,
        query: {
          original: request.query,
          sql: generatedQuery.sql,
          description: generatedQuery.description,
          tablesQueried: generatedQuery.tablesQueried || [],
          filtersApplied: generatedQuery.filtersApplied || [],
        },
        results: {
          data: results || [],
          count: results?.length || 0,
          resultType: generatedQuery.resultType,
          columns: generatedQuery.columns,
        },
        metadata: {
          executionTimeMs,
          domainsSearched: domains,
          rlsEnforced: true,
          queryId,
          dataFreshness,
          estimatedTokenCost: estimatedCost,
          reviewMode: false,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[compliance-search] Unhandled error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Search is temporarily unavailable." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

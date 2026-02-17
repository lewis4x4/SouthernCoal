import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * import-permit-limits Edge Function
 *
 * Moves parsed permit limit data from extracted_data JSONB → domain tables:
 * - Creates/finds npdes_permits for each permit number
 * - Creates/finds outfalls for each outfall number
 * - Upserts permit_limits with review_status='pending_review'
 * - Updates queue status to 'imported'
 * - Links all rows via import_batch_id for rollback support
 */

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";

// ---------------------------------------------------------------------------
// CORS Headers - restricted to known frontend origin
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// ---------------------------------------------------------------------------
// Types from parse-parameter-sheet extracted_data
// ---------------------------------------------------------------------------
interface ExtractedLimit {
  row_number: number;
  outfall_number: string;
  outfall_status: string;
  parameter_raw: string;
  parameter_id: string | null;
  parameter_canonical: string | null;
  limit_min: number | null;
  limit_avg: number | null;
  limit_max: number | null;
  is_range: boolean;
  range_min: number | null;
  range_max: number | null;
  unit: string;
  frequency: string;
  sample_type: string;
  is_report_only: boolean;
  is_not_constructed: boolean;
  extraction_confidence: number;
}

interface ExtractedOutfall {
  outfall_number: string;
  is_active: boolean;
  status_notes: string | null;
  limit_count: number;
}

interface ExtractedPermit {
  permit_number: string;
  tab_name: string;
  subsidiary_name: string | null;
  address: string | null;
  outfalls: ExtractedOutfall[];
  limits: ExtractedLimit[];
}

interface ExtractedParameterSheet {
  document_type: "parameter_sheet";
  file_format: "xlsx" | "xls";
  state_code: string;
  total_tabs: number;
  valid_permit_tabs: number;
  skipped_tabs: string[];
  permits: ExtractedPermit[];
  summary: {
    total_permits: number;
    total_outfalls: number;
    total_limits: number;
    unmatched_parameters: string[];
    not_constructed_outfalls: number;
    report_only_limits: number;
    matched_parameters: number;
    unmatched_parameter_count: number;
  };
  warnings: string[];
  validation_errors: Array<{
    tab: string;
    row: number;
    column: string;
    message: string;
  }>;
  limits_truncated: boolean;
}

// ---------------------------------------------------------------------------
// Auth verification with organization context
// ---------------------------------------------------------------------------
interface AuthResult {
  userId: string;
  organizationId: string;
  canImport: boolean;
}

// Roles allowed to import permit limits
const IMPORT_ALLOWED_ROLES = ["admin", "environmental_manager", "site_manager", "executive"];

async function verifyAuth(
  req: Request,
  supabase: SupabaseClient,
): Promise<AuthResult | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;

  // Get user's organization membership and role
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("organization_id, role_assignments(roles(name))")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    console.error("[import-permit-limits] User has no organization:", user.id);
    return null;
  }

  // Check if user has a role that allows import
  const userRoles: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roleAssignments = (profile as any).role_assignments;
  if (Array.isArray(roleAssignments)) {
    for (const assignment of roleAssignments) {
      if (assignment?.roles?.name) {
        userRoles.push(assignment.roles.name.toLowerCase());
      }
    }
  }

  const canImport = userRoles.some((role) =>
    IMPORT_ALLOWED_ROLES.includes(role)
  );

  return {
    userId: user.id,
    organizationId: profile.organization_id,
    canImport,
  };
}

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------
function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// State code to regulatory agency mapping
// ---------------------------------------------------------------------------
const STATE_AGENCIES: Record<string, string> = {
  WV: "WVDEP",
  KY: "KYDEP",
  TN: "TDEC",
  VA: "DMLR",
  AL: "ADEM",
};

// ---------------------------------------------------------------------------
// Limit type classification
// ---------------------------------------------------------------------------
function classifyLimitType(limit: ExtractedLimit): string {
  if (limit.is_report_only) return "report_only";
  if (limit.is_range) return "range";
  if (limit.limit_max !== null) return "daily_max";
  if (limit.limit_avg !== null) return "monthly_avg";
  if (limit.limit_min !== null) return "daily_min";
  return "numeric";
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  console.log("[import-permit-limits] Invoked at", new Date().toISOString());

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Verify JWT and get user's organization
  const auth = await verifyAuth(req, supabase);
  if (!auth) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
  const { userId, organizationId: userOrgId, canImport } = auth;

  // 1b. Verify user has role that allows import
  if (!canImport) {
    console.error("[import-permit-limits] User lacks import permission:", userId);
    return jsonResponse(
      { success: false, error: "Forbidden: insufficient permissions to import data" },
      403,
    );
  }

  // 2. Parse request body
  let queueId: string;
  try {
    const body = await req.json();
    queueId = body.queue_id;
    if (!queueId || typeof queueId !== "string") {
      throw new Error("queue_id is required");
    }
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid request: queue_id (string) required" },
      400,
    );
  }

  console.log("[import-permit-limits] Processing queue_id:", queueId, "by user:", userId);

  // 3. Fetch queue entry with extracted_data
  const { data: queueEntry, error: fetchError } = await supabase
    .from("file_processing_queue")
    .select(
      "id, file_name, file_category, status, organization_id, extracted_data, state_code",
    )
    .eq("id", queueId)
    .single();

  if (fetchError || !queueEntry) {
    return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
  }

  // 4. Validate status
  if (queueEntry.status !== "parsed") {
    return jsonResponse(
      {
        success: false,
        error: `Cannot import entry with status '${queueEntry.status}'. Expected 'parsed'.`,
      },
      409,
    );
  }

  // 5. Validate category
  if (queueEntry.file_category !== "npdes_permit") {
    return jsonResponse(
      {
        success: false,
        error: `import-permit-limits only handles npdes_permit files, not '${queueEntry.file_category}'`,
      },
      400,
    );
  }

  // 6. Validate extracted_data exists
  const extractedData = queueEntry.extracted_data as ExtractedParameterSheet | null;
  if (!extractedData || extractedData.document_type !== "parameter_sheet") {
    return jsonResponse(
      { success: false, error: "No valid parameter_sheet data found in extracted_data" },
      400,
    );
  }

  if (!extractedData.permits || extractedData.permits.length === 0) {
    return jsonResponse(
      { success: false, error: "No permits found in extracted_data" },
      400,
    );
  }

  const organizationId = queueEntry.organization_id;
  if (!organizationId) {
    return jsonResponse(
      { success: false, error: "Queue entry missing organization_id" },
      400,
    );
  }

  // 7. SECURITY: Verify user belongs to queue entry's organization
  if (organizationId !== userOrgId) {
    console.error(
      "[import-permit-limits] Org mismatch: user org", userOrgId,
      "!= queue org", organizationId
    );
    return jsonResponse(
      { success: false, error: "Access denied: queue entry belongs to different organization" },
      403,
    );
  }

  const stateCode = queueEntry.state_code || extractedData.state_code || "WV";
  const regulatoryAgency = STATE_AGENCIES[stateCode] || null;

  // Generate import batch ID for rollback support
  const importBatchId = crypto.randomUUID();

  console.log(
    "[import-permit-limits] Importing",
    extractedData.permits.length,
    "permits,",
    extractedData.summary.total_limits,
    "limits from",
    queueEntry.file_name,
  );

  try {
    let totalPermitsCreated = 0;
    let totalOutfallsCreated = 0;
    let totalLimitsCreated = 0;
    let skippedNoParameter = 0;
    const importedPermitIds: string[] = [];
    const importedOutfallIds: string[] = [];
    const importedLimitIds: string[] = [];

    // Process each permit in the extracted data
    for (const permit of extractedData.permits) {
      console.log("[import-permit-limits] Processing permit:", permit.permit_number);

      // 8. Find or create permit record
      let permitId: string;

      const { data: existingPermit, error: permitFetchError } = await supabase
        .from("npdes_permits")
        .select("id")
        .eq("permit_number", permit.permit_number)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (permitFetchError) {
        console.error("[import-permit-limits] Failed to check permit:", permitFetchError.message);
        throw new Error(`Failed to check permit ${permit.permit_number}: ${permitFetchError.message}`);
      }

      if (existingPermit) {
        permitId = existingPermit.id;
        console.log("[import-permit-limits] Found existing permit:", permitId);
      } else {
        // Create new permit
        const { data: newPermit, error: permitCreateError } = await supabase
          .from("npdes_permits")
          .insert({
            permit_number: permit.permit_number,
            organization_id: organizationId,
            state_code: stateCode,
            regulatory_agency: regulatoryAgency,
            permit_status: "active",
            // Subsidiary info from parameter sheet
            permittee_name: permit.subsidiary_name,
            facility_address: permit.address,
          })
          .select("id")
          .single();

        if (permitCreateError || !newPermit) {
          console.error("[import-permit-limits] Failed to create permit:", permitCreateError?.message);
          throw new Error(`Failed to create permit ${permit.permit_number}: ${permitCreateError?.message}`);
        }

        permitId = newPermit.id;
        totalPermitsCreated++;
        importedPermitIds.push(permitId);
        console.log("[import-permit-limits] Created new permit:", permitId);
      }

      // 9. Create outfalls for this permit
      const outfallIdMap = new Map<string, string>(); // outfall_number -> id

      for (const outfall of permit.outfalls) {
        // Check for existing outfall
        const { data: existingOutfall, error: outfallFetchError } = await supabase
          .from("outfalls")
          .select("id")
          .eq("permit_id", permitId)
          .eq("outfall_number", outfall.outfall_number)
          .maybeSingle();

        if (outfallFetchError) {
          console.warn("[import-permit-limits] Failed to check outfall:", outfallFetchError.message);
          continue;
        }

        if (existingOutfall) {
          outfallIdMap.set(outfall.outfall_number, existingOutfall.id);
        } else {
          // Create new outfall
          const { data: newOutfall, error: outfallCreateError } = await supabase
            .from("outfalls")
            .insert({
              permit_id: permitId,
              outfall_number: outfall.outfall_number,
              is_active: outfall.is_active,
              status_notes: outfall.status_notes,
            })
            .select("id")
            .single();

          if (outfallCreateError || !newOutfall) {
            console.warn("[import-permit-limits] Failed to create outfall:", outfallCreateError?.message);
            continue;
          }

          outfallIdMap.set(outfall.outfall_number, newOutfall.id);
          totalOutfallsCreated++;
          importedOutfallIds.push(newOutfall.id);
        }
      }

      // 10. Batch prepare limits for this permit
      const limitsToUpsert: Array<{
        permit_id: string;
        outfall_id: string;
        parameter_id: string;
        limit_type: string;
        limit_value: number | null;
        limit_min: number | null;
        limit_max: number | null;
        unit: string | null;
        statistical_base: string | null;
        monitoring_frequency: string | null;
        sample_type: string | null;
        is_active: boolean;
        review_status: string;
        extraction_source: string;
        extraction_confidence: number | null;
        import_batch_id: string;
      }> = [];

      for (const limit of permit.limits) {
        // Skip limits without parameter_id (unresolved parameters)
        if (!limit.parameter_id) {
          skippedNoParameter++;
          continue;
        }

        // Skip NOT CONSTRUCTED outfalls
        if (limit.is_not_constructed) {
          continue;
        }

        const outfallId = outfallIdMap.get(limit.outfall_number);
        if (!outfallId) {
          console.warn("[import-permit-limits] No outfall ID for:", limit.outfall_number);
          continue;
        }

        const limitType = classifyLimitType(limit);

        // Determine the primary limit value
        let limitValue: number | null = null;
        if (limit.is_range) {
          limitValue = null; // Range limits use limit_min/limit_max
        } else if (limit.limit_max !== null) {
          limitValue = limit.limit_max;
        } else if (limit.limit_avg !== null) {
          limitValue = limit.limit_avg;
        } else if (limit.limit_min !== null) {
          limitValue = limit.limit_min;
        }

        // Determine statistical base from context
        let statisticalBase: string | null = null;
        if (limit.limit_avg !== null) {
          statisticalBase = "average";
        } else if (limit.limit_max !== null) {
          statisticalBase = "maximum";
        } else if (limit.limit_min !== null) {
          statisticalBase = "minimum";
        }

        limitsToUpsert.push({
          permit_id: permitId,
          outfall_id: outfallId,
          parameter_id: limit.parameter_id,
          limit_type: limitType,
          limit_value: limitValue,
          limit_min: limit.is_range ? limit.range_min : limit.limit_min,
          limit_max: limit.is_range ? limit.range_max : limit.limit_max,
          unit: limit.unit || null,
          statistical_base: statisticalBase,
          monitoring_frequency: limit.frequency || null,
          sample_type: limit.sample_type || null,
          is_active: true,
          review_status: "pending_review",
          extraction_source: "ai_excel",
          extraction_confidence: limit.extraction_confidence,
          import_batch_id: importBatchId,
        });
      }

      // 11. Batch upsert limits for this permit
      if (limitsToUpsert.length > 0) {
        console.log("[import-permit-limits] Upserting", limitsToUpsert.length, "limits for permit", permit.permit_number);

        const { data: upsertedLimits, error: limitsError } = await supabase
          .from("permit_limits")
          .upsert(limitsToUpsert, {
            onConflict: "outfall_id,parameter_id,statistical_base,monitoring_frequency",
            ignoreDuplicates: false,
          })
          .select("id");

        if (limitsError) {
          console.error("[import-permit-limits] Limits upsert failed:", limitsError.message);
          throw new Error(`Limits upsert failed: ${limitsError.message}`);
        }

        const limitsCount = upsertedLimits?.length ?? 0;
        totalLimitsCreated += limitsCount;
        importedLimitIds.push(...(upsertedLimits ?? []).map((l: { id: string }) => l.id));

        console.log("[import-permit-limits] Upserted", limitsCount, "limits");
      }
    }

    // 12. Update queue status to 'imported'
    const now = new Date().toISOString();
    await supabase
      .from("file_processing_queue")
      .update({
        status: "imported",
        imported_at: now,
        updated_at: now,
        records_imported: totalLimitsCreated,
      })
      .eq("id", queueId);

    // 13. Audit log — CRITICAL: Consent Decree requires audit trail — retry on failure
    const auditPayload = {
      user_id: userId,
      organization_id: organizationId,
      action: "bulk_process",
      module: "import",
      table_name: "permit_limits",
      record_id: queueId,
      description: JSON.stringify({
        action_type: "permit_limits_imported",
        file_name: queueEntry.file_name,
        state_code: stateCode,
        permits_created: totalPermitsCreated,
        outfalls_created: totalOutfallsCreated,
        limits_created: totalLimitsCreated,
        skipped_no_parameter: skippedNoParameter,
        import_batch_id: importBatchId,
      }),
    };

    let auditSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: auditError } = await supabase.from("audit_log").insert(auditPayload);
      if (!auditError) {
        auditSuccess = true;
        break;
      }
      console.error(`[import-permit-limits] Audit log attempt ${attempt}/3 failed:`, auditError.message);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * attempt)); // Backoff: 500ms, 1000ms
      }
    }

    if (!auditSuccess) {
      // Fallback: Log to queue metadata for later reconciliation
      console.error("[import-permit-limits] CRITICAL: All audit log attempts failed — writing to queue metadata");
      await supabase
        .from("file_processing_queue")
        .update({
          metadata: {
            pending_audit_log: auditPayload,
            audit_log_failed_at: new Date().toISOString(),
          },
        })
        .eq("id", queueId);
    }

    console.log(
      "[import-permit-limits] Success:",
      queueEntry.file_name,
      "| Permits:", totalPermitsCreated,
      "| Outfalls:", totalOutfallsCreated,
      "| Limits:", totalLimitsCreated,
      "| Skipped (no param):", skippedNoParameter,
    );

    return jsonResponse({
      success: true,
      permits_created: totalPermitsCreated,
      outfalls_created: totalOutfallsCreated,
      limits_created: totalLimitsCreated,
      skipped_no_parameter: skippedNoParameter,
      import_batch_id: importBatchId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[import-permit-limits] Error:", message);

    // Mark queue as failed
    await supabase
      .from("file_processing_queue")
      .update({
        status: "failed",
        error_log: [`Import failed: ${message}`],
        updated_at: new Date().toISOString(),
      })
      .eq("id", queueId);

    return jsonResponse({ success: false, error: message }, 500);
  }
});

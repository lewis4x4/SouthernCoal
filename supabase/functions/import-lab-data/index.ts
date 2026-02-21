import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * import-lab-data Edge Function
 *
 * Moves parsed lab data from extracted_data JSONB → domain tables:
 * - Creates sampling_events for each unique outfall × date × time
 * - Creates lab_results for each parameter measurement
 * - Updates queue status to 'imported'
 * - Links all rows to data_imports record for rollback support
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
// Types from parse-lab-data-edd extracted_data
// ---------------------------------------------------------------------------
interface ParsedRecord {
  row_number: number;
  permittee_name: string;
  permit_number: string;
  site_name: string;
  site_state: string;
  site_county: string;
  lab_name: string;
  sampler: string;
  outfall_raw: string;
  outfall_matched: string | null;
  outfall_db_id: string | null;
  outfall_match_method: string | null;
  latitude: number | null;
  longitude: number | null;
  stream_name: string;
  sample_date: string | null;
  sample_time: string | null;
  analysis_date: string | null;
  parameter_raw: string;
  parameter_canonical: string;
  parameter_id: string | null;
  value: number | null;
  value_raw: string;
  unit: string;
  below_detection: boolean;
  data_qualifier: string | null;
  comments: string | null;
  hold_time_days: number | null;
  hold_time_compliant: boolean | null;
  is_duplicate: boolean;
}

interface ExtractedLabData {
  document_type: "lab_data_edd";
  records: ParsedRecord[];
  import_id: string | null;
  // ... other fields
}

// ---------------------------------------------------------------------------
// Auth verification with organization context
// ---------------------------------------------------------------------------
interface AuthResult {
  userId: string;
  organizationId: string;
  canImport: boolean;
}

// Roles allowed to import lab data
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
    console.error("[import-lab-data] User has no organization:", user.id);
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
// Group records by sampling event key
// ---------------------------------------------------------------------------
function groupByEvent(records: ParsedRecord[]): Map<string, ParsedRecord[]> {
  const groups = new Map<string, ParsedRecord[]>();

  for (const record of records) {
    // Skip records without outfall match or sample date
    if (!record.outfall_db_id || !record.sample_date) continue;

    // Skip duplicates flagged by parser
    if (record.is_duplicate) continue;

    // Use 00:00:00 as default to match database COALESCE index
    const normalizedTime = record.sample_time || "00:00:00";
    const key = `${record.outfall_db_id}|${record.sample_date}|${normalizedTime}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  console.log("[import-lab-data] Invoked at", new Date().toISOString());

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
    console.error("[import-lab-data] User lacks import permission:", userId);
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

  console.log("[import-lab-data] Processing queue_id:", queueId, "by user:", userId);

  // 3. Fetch queue entry with extracted_data
  const { data: queueEntry, error: fetchError } = await supabase
    .from("file_processing_queue")
    .select(
      "id, file_name, file_category, status, organization_id, extracted_data",
    )
    .eq("id", queueId)
    .single();

  if (fetchError || !queueEntry) {
    return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
  }

  // 4. Validate status + optimistic lock: atomically claim this entry
  if (queueEntry.status !== "parsed") {
    return jsonResponse(
      {
        success: false,
        error: `Cannot import entry with status '${queueEntry.status}'. Expected 'parsed'.`,
      },
      409,
    );
  }

  // Optimistic lock: attempt to set status to 'importing' only if still 'parsed'
  const { data: lockResult, error: lockError } = await supabase
    .from("file_processing_queue")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", queueId)
    .eq("status", "parsed")
    .select("id")
    .single();

  if (lockError || !lockResult) {
    return jsonResponse(
      {
        success: false,
        error: "Import already in progress for this entry (concurrent request detected)",
      },
      409,
    );
  }

  // 5. Validate category
  if (queueEntry.file_category !== "lab_data") {
    return jsonResponse(
      {
        success: false,
        error: `import-lab-data only handles lab_data files, not '${queueEntry.file_category}'`,
      },
      400,
    );
  }

  // 6. Validate extracted_data exists
  const extractedData = queueEntry.extracted_data as ExtractedLabData | null;
  if (!extractedData || !extractedData.records || extractedData.records.length === 0) {
    return jsonResponse(
      { success: false, error: "No parsed records found in extracted_data" },
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
      "[import-lab-data] Org mismatch: user org", userOrgId,
      "!= queue org", organizationId
    );
    return jsonResponse(
      { success: false, error: "Access denied: queue entry belongs to different organization" },
      403,
    );
  }

  const importId = extractedData.import_id;

  console.log(
    "[import-lab-data] Importing",
    extractedData.records.length,
    "records from",
    queueEntry.file_name,
  );

  try {
    // 8. Group records by sampling event
    const eventGroups = groupByEvent(extractedData.records);

    if (eventGroups.size === 0) {
      return jsonResponse(
        {
          success: false,
          error: "No valid records to import. Records may be missing outfall_db_id or sample_date.",
        },
        400,
      );
    }

    console.log("[import-lab-data] Grouped into", eventGroups.size, "sampling events");

    // 9. SECURITY: Validate all outfalls belong to user's organization
    const outfallIds = [...new Set(
      extractedData.records
        .map(r => r.outfall_db_id)
        .filter((id): id is string => !!id)
    )];

    if (outfallIds.length > 0) {
      // Query outfalls via their permits to verify org ownership
      const { data: validOutfalls, error: outfallError } = await supabase
        .from("outfalls")
        .select("id, npdes_permits!inner(organization_id)")
        .in("id", outfallIds);

      if (outfallError) {
        console.error("[import-lab-data] Failed to validate outfalls:", outfallError.message);
        return jsonResponse(
          { success: false, error: "Failed to validate outfall ownership" },
          500,
        );
      }

      // Check each outfall belongs to user's org
      const invalidOutfalls = validOutfalls?.filter(
        (o: { npdes_permits: { organization_id: string } }) =>
          o.npdes_permits?.organization_id !== userOrgId
      );

      if (invalidOutfalls && invalidOutfalls.length > 0) {
        console.error(
          "[import-lab-data] Cross-org outfall access attempt:",
          invalidOutfalls.map((o: { id: string }) => o.id)
        );
        return jsonResponse(
          { success: false, error: "Access denied: some outfalls belong to different organization" },
          403,
        );
      }

      // Verify all referenced outfalls exist
      const foundIds = new Set(validOutfalls?.map((o: { id: string }) => o.id) ?? []);
      const missingOutfalls = outfallIds.filter(id => !foundIds.has(id));
      if (missingOutfalls.length > 0) {
        console.error("[import-lab-data] Unknown outfall IDs:", missingOutfalls);
        return jsonResponse(
          { success: false, error: `Unknown outfall IDs: ${missingOutfalls.join(", ")}` },
          400,
        );
      }
    }

    let totalEventsCreated = 0;
    let totalResultsCreated = 0;
    let skippedNoParameter = 0;
    const importedEventIds: string[] = [];
    const importedResultIds: string[] = [];

    // 8. BATCH APPROACH: Prepare all events for upsert (reduces N queries to 2-3)
    console.log("[import-lab-data] Preparing batch upsert for", eventGroups.size, "events");

    // Step 1: Build events array for batch upsert
    const eventsToUpsert: Array<{
      outfall_id: string;
      sample_date: string;
      sample_time: string | null;
      lab_name: string | null;
      status: string;
      metadata: Record<string, unknown>;
    }> = [];

    const eventKeyMap = new Map<string, number>(); // Maps eventKey to index in eventsToUpsert

    for (const [eventKey, records] of eventGroups) {
      const [outfallId, sampleDate, sampleTime] = eventKey.split("|");
      const firstRecord = records[0];

      eventKeyMap.set(eventKey, eventsToUpsert.length);
      eventsToUpsert.push({
        outfall_id: outfallId,
        sample_date: sampleDate,
        // Store actual time or null; COALESCE index handles null → 00:00:00 conversion
        sample_time: sampleTime === "00:00:00" ? null : sampleTime || null,
        lab_name: firstRecord.lab_name || null,
        status: "imported",
        metadata: {
          import_id: importId,
          source_file_id: queueId,
          sampler: firstRecord.sampler || null,
          latitude: firstRecord.latitude,
          longitude: firstRecord.longitude,
          stream_name: firstRecord.stream_name || null,
        },
      });
    }

    // Step 2: Batch upsert all sampling_events (uses UNIQUE constraint)
    const { data: upsertedEvents, error: eventBatchError } = await supabase
      .from("sampling_events")
      .upsert(eventsToUpsert, {
        onConflict: "outfall_id,sample_date,sample_time",
        ignoreDuplicates: false,
      })
      .select("id, outfall_id, sample_date, sample_time");

    if (eventBatchError) {
      throw new Error(`Batch event upsert failed: ${eventBatchError.message}`);
    }

    // Step 3: Build lookup map from event key to database ID
    const eventIdMap = new Map<string, string>();
    for (const evt of upsertedEvents ?? []) {
      // Use 00:00:00 for null sample_time to match groupByEvent key generation
      const normalizedTime = evt.sample_time || "00:00:00";
      const key = `${evt.outfall_id}|${evt.sample_date}|${normalizedTime}`;
      eventIdMap.set(key, evt.id);
      importedEventIds.push(evt.id);
    }
    totalEventsCreated = upsertedEvents?.length ?? 0;

    console.log("[import-lab-data] Upserted", totalEventsCreated, "sampling_events");

    // Step 4: Prepare all lab_results for batch upsert
    const allResults: Array<{
      sampling_event_id: string;
      parameter_id: string;
      result_value: number | null;
      result_text: string | null;
      unit: string | null;
      is_non_detect: boolean;
      qualifier: string | null;
      analyzed_date: string | null;
      hold_time_met: boolean | null;
      import_id: string | null;
    }> = [];

    for (const [eventKey, records] of eventGroups) {
      const eventId = eventIdMap.get(eventKey);
      if (!eventId) {
        console.warn("[import-lab-data] Missing event ID for key:", eventKey);
        continue;
      }

      for (const record of records) {
        // Skip if no parameter_id (unresolved parameter)
        if (!record.parameter_id) {
          skippedNoParameter++;
          continue;
        }

        allResults.push({
          sampling_event_id: eventId,
          parameter_id: record.parameter_id,
          result_value: record.value,
          result_text: record.value_raw || null,
          unit: record.unit || null,
          is_non_detect: record.below_detection,
          qualifier: record.data_qualifier,
          analyzed_date: record.analysis_date,
          hold_time_met: record.hold_time_compliant,
          import_id: importId,
        });
      }
    }

    // Step 5: Batch upsert all lab_results (skip duplicates via ON CONFLICT)
    if (allResults.length > 0) {
      console.log("[import-lab-data] Batch inserting", allResults.length, "lab_results");

      const { data: insertedResults, error: resultBatchError } = await supabase
        .from("lab_results")
        .upsert(allResults, {
          onConflict: "sampling_event_id,parameter_id",
          ignoreDuplicates: true,
        })
        .select("id");

      if (resultBatchError) {
        throw new Error(`Batch result insert failed: ${resultBatchError.message}`);
      }

      totalResultsCreated = insertedResults?.length ?? 0;
      importedResultIds.push(...(insertedResults ?? []).map((r: { id: string }) => r.id));

      // Log skipped duplicates
      const skippedDupes = allResults.length - totalResultsCreated;
      if (skippedDupes > 0) {
        console.log("[import-lab-data] Skipped", skippedDupes, "duplicate lab_results");
      }
    }

    // 9. Update queue status to 'imported'
    const now = new Date().toISOString();
    await supabase
      .from("file_processing_queue")
      .update({
        status: "imported",
        imported_at: now,
        updated_at: now,
        records_imported: totalResultsCreated,
      })
      .eq("id", queueId);

    // 10. Update data_imports with counts and IDs
    if (importId) {
      await supabase
        .from("data_imports")
        .update({
          import_status: "imported",
          import_completed_at: now,
          record_count: totalResultsCreated,
          import_metadata: {
            sampling_event_count: totalEventsCreated,
            lab_result_count: totalResultsCreated,
            skipped_no_parameter: skippedNoParameter,
            imported_event_ids: importedEventIds.slice(0, 100), // Cap for JSONB size
            imported_result_ids: importedResultIds.slice(0, 100),
          },
        })
        .eq("id", importId);
    }

    // 12. Audit log — use 'bulk_process' action type which is in the CHECK constraint
    // CRITICAL: Consent Decree requires audit trail — retry on failure
    const auditPayload = {
      user_id: userId,
      organization_id: organizationId,
      action: "bulk_process",
      module: "import",
      table_name: "lab_results",
      record_id: queueId,
      description: JSON.stringify({
        action_type: "lab_data_imported",
        file_name: queueEntry.file_name,
        sampling_events_created: totalEventsCreated,
        lab_results_created: totalResultsCreated,
        skipped_no_parameter: skippedNoParameter,
        import_id: importId,
      }),
    };

    let auditSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: auditError } = await supabase.from("audit_log").insert(auditPayload);
      if (!auditError) {
        auditSuccess = true;
        break;
      }
      console.error(`[import-lab-data] Audit log attempt ${attempt}/3 failed:`, auditError.message);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * attempt)); // Backoff: 500ms, 1000ms
      }
    }

    if (!auditSuccess) {
      // Fallback: Log to queue metadata for later reconciliation
      console.error("[import-lab-data] CRITICAL: All audit log attempts failed — writing to queue metadata");
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
      "[import-lab-data] Success:",
      queueEntry.file_name,
      "| Events:", totalEventsCreated,
      "| Results:", totalResultsCreated,
      "| Skipped (no param):", skippedNoParameter,
    );

    return jsonResponse({
      success: true,
      events_created: totalEventsCreated,
      results_created: totalResultsCreated,
      skipped_no_parameter: skippedNoParameter,
      import_id: importId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[import-lab-data] Error:", message);

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

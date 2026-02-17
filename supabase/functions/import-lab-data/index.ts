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
// CORS Headers
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
// Auth verification
// ---------------------------------------------------------------------------
async function verifyAuth(
  req: Request,
  supabase: SupabaseClient,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
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

    const key = `${record.outfall_db_id}|${record.sample_date}|${record.sample_time ?? ""}`;

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

  // 1. Verify JWT
  const userId = await verifyAuth(req, supabase);
  if (!userId) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
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

  const importId = extractedData.import_id;

  console.log(
    "[import-lab-data] Importing",
    extractedData.records.length,
    "records from",
    queueEntry.file_name,
  );

  try {
    // 7. Group records by sampling event
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

    let totalEventsCreated = 0;
    let totalResultsCreated = 0;
    let skippedNoParameter = 0;
    const importedEventIds: string[] = [];
    const importedResultIds: string[] = [];

    // 8. Process each event group
    for (const [eventKey, records] of eventGroups) {
      const [outfallId, sampleDate, sampleTime] = eventKey.split("|");

      // Get first record for event metadata
      const firstRecord = records[0];

      // Upsert sampling_event
      const eventData = {
        organization_id: organizationId,
        outfall_id: outfallId,
        sample_date: sampleDate,
        sample_time: sampleTime || null,
        sampler_name: firstRecord.sampler || null,
        latitude: firstRecord.latitude,
        longitude: firstRecord.longitude,
        stream_name: firstRecord.stream_name || null,
        lab_name: firstRecord.lab_name || null,
        import_id: importId,
        source_file_id: queueId,
      };

      const { data: event, error: eventError } = await supabase
        .from("sampling_events")
        .upsert(eventData, {
          onConflict: "outfall_id,sample_date,sample_time",
          ignoreDuplicates: false,
        })
        .select("id")
        .single();

      if (eventError) {
        console.error("[import-lab-data] Failed to upsert sampling_event:", eventError.message);
        continue;
      }

      totalEventsCreated++;
      importedEventIds.push(event.id);

      // Insert lab_results for this event
      const resultsToInsert = [];
      for (const record of records) {
        // Skip if no parameter_id (unresolved parameter)
        if (!record.parameter_id) {
          skippedNoParameter++;
          continue;
        }

        resultsToInsert.push({
          sampling_event_id: event.id,
          parameter_id: record.parameter_id,
          result_value: record.value,
          unit: record.unit || null,
          below_detection: record.below_detection,
          qualifier: record.data_qualifier,
          analysis_date: record.analysis_date,
          hold_time_days: record.hold_time_days,
          hold_time_compliant: record.hold_time_compliant,
          import_id: importId,
          raw_parameter_name: record.parameter_raw,
          raw_value: record.value_raw,
          row_number: record.row_number,
        });
      }

      if (resultsToInsert.length > 0) {
        const { data: results, error: resultsError } = await supabase
          .from("lab_results")
          .upsert(resultsToInsert, {
            onConflict: "sampling_event_id,parameter_id",
            ignoreDuplicates: false,
          })
          .select("id");

        if (resultsError) {
          console.error("[import-lab-data] Failed to insert lab_results:", resultsError.message);
        } else if (results) {
          totalResultsCreated += results.length;
          importedResultIds.push(...results.map((r: { id: string }) => r.id));
        }
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

    // 11. Audit log
    await supabase.from("audit_log").insert({
      user_id: userId,
      organization_id: organizationId,
      action: "lab_data_imported",
      module: "import",
      entity_type: "file_processing_queue",
      entity_id: queueId,
      details: {
        file_name: queueEntry.file_name,
        sampling_events_created: totalEventsCreated,
        lab_results_created: totalResultsCreated,
        skipped_no_parameter: skippedNoParameter,
        import_id: importId,
      },
    });

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

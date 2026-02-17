/**
 * Shared queue status management functions for Edge Function parsers.
 * Handles file_processing_queue status transitions with Realtime updates.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const VALID_STATES = ["AL", "KY", "TN", "VA", "WV"];

/**
 * Mark queue entry as processing (triggers amber pulse in UI)
 */
export async function markProcessing(
  supabase: SupabaseClient,
  queueId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("file_processing_queue")
    .update({
      status: "processing",
      processing_started_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (error) {
    console.error("[queue-status] Failed to mark processing:", error.message);
  }
}

/**
 * Mark queue entry as parsed with extracted data
 */
export async function markParsed(
  supabase: SupabaseClient,
  queueId: string,
  extractedData: Record<string, unknown>,
  recordCount: number,
  currentStateCode: string | null,
  warnings: string[],
): Promise<void> {
  const now = new Date().toISOString();

  // Auto-fill state_code if all records share one state
  const states = (extractedData.states ?? []) as string[];
  const singleState = states.length === 1 ? states[0].toUpperCase() : null;
  const shouldFillState = !currentStateCode && singleState && VALID_STATES.includes(singleState);

  const updateData: Record<string, unknown> = {
    status: "parsed",
    extracted_data: extractedData,
    records_extracted: recordCount,
    processing_completed_at: now,
    updated_at: now,
  };

  if (warnings.length > 0) {
    updateData.error_log = warnings;
  }

  if (shouldFillState) {
    updateData.state_code = singleState;
    console.log("[queue-status] Auto-filled state_code:", singleState);
  }

  const { error } = await supabase
    .from("file_processing_queue")
    .update(updateData)
    .eq("id", queueId);

  if (error) {
    console.error("[queue-status] Failed to mark parsed:", error.message);
  }
}

/**
 * Mark queue entry as failed with error details
 */
export async function markFailed(
  supabase: SupabaseClient,
  queueId: string,
  errors: string[],
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("file_processing_queue")
    .update({
      status: "failed",
      error_log: errors,
      processing_completed_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (error) {
    console.error("[queue-status] Failed to mark failed:", error.message);
  }
}

/**
 * Mark queue entry as imported (data moved to domain tables)
 */
export async function markImported(
  supabase: SupabaseClient,
  queueId: string,
  importStats: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("file_processing_queue")
    .update({
      status: "imported",
      import_stats: importStats,
      imported_at: now,
      updated_at: now,
    })
    .eq("id", queueId);

  if (error) {
    console.error("[queue-status] Failed to mark imported:", error.message);
  }
}

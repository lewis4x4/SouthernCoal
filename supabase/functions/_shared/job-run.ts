import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Finalize a job_runs ledger row that a cron wrapper opened and dispatched to
 * this Edge Function. The wrapper marks the run 'dispatched'; the function that
 * actually did the work reports the truthful terminal status here.
 *
 * Fire-and-forget: never let ledger bookkeeping fail the real work. The
 * reconcile cron is the safety net if this call is lost.
 */
export async function completeJobRun(
  supabase: SupabaseClient,
  jobRunId: string | null | undefined,
  status: "succeeded" | "failed",
  opts: { rowsScanned?: number; rowsAffected?: number; errorDetail?: string | null } = {},
): Promise<void> {
  if (!jobRunId) return;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(jobRunId)) return;

  try {
    const { error } = await supabase.rpc("complete_job_run", {
      p_run_id: jobRunId,
      p_status: status,
      p_rows_scanned: opts.rowsScanned ?? null,
      p_rows_affected: opts.rowsAffected ?? null,
      p_error_detail: opts.errorDetail ?? null,
    });
    if (error) console.error(`[job-run] complete_job_run failed: ${error.message}`);
  } catch (err) {
    console.error("[job-run] complete_job_run threw:", err);
  }
}

/** Extract a job_run_id from a parsed request body, if present and a string. */
export function readJobRunId(body: unknown): string | null {
  if (body && typeof body === "object" && "job_run_id" in body) {
    const v = (body as Record<string, unknown>).job_run_id;
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

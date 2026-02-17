import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMBEDDING_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

const DELAY_BETWEEN_DOCS_MS = 1_500;

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Auth: internal secret only
    const internalHeader = req.headers.get("X-Internal-Secret");
    if (
      !internalHeader ||
      internalHeader !== EMBEDDING_INTERNAL_SECRET ||
      EMBEDDING_INTERNAL_SECRET.length === 0
    ) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse body
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body = defaults
    }

    const batchSize = Math.min((body.batch_size as number) ?? 10, 50);
    const afterId = (body.after_id as string) ?? null;
    const dryRun = (body.dry_run as boolean) ?? false;
    const category = (body.category as string) ?? null;
    const stateCode = (body.state_code as string) ?? null;

    // -----------------------------------------------------------------------
    // Cursor-based fetch: status='parsed' entries ordered by id ASC.
    // generate-embeddings marks success as 'embedded' and failures as
    // 'embedding_failed', so we never revisit completed or quarantined docs.
    // -----------------------------------------------------------------------
    let query = supabase
      .from("file_processing_queue")
      .select("id, file_name, file_category, state_code")
      .eq("status", "parsed")
      .order("id", { ascending: true })
      .limit(batchSize);

    if (afterId) {
      query = query.gt("id", afterId);
    }
    if (category) {
      query = query.eq("file_category", category);
    }
    if (stateCode) {
      query = query.eq("state_code", stateCode);
    }

    const { data: batch, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ success: false, error: `Fetch failed: ${fetchError.message}` }),
        { status: 500, headers },
      );
    }

    // Remaining count (single COUNT query, not N+1)
    const { count: remaining } = await supabase
      .from("file_processing_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "parsed");

    if (!batch || batch.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No parsed entries remaining",
          processed: 0,
          succeeded: 0,
          failed: 0,
          quarantined: 0,
          total_chunks: 0,
          remaining: remaining ?? 0,
          cursor: afterId,
          has_more: false,
        }),
        { status: 200, headers },
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          batch_size: batch.length,
          remaining: remaining ?? 0,
          entries: batch.map((e) => ({
            id: e.id,
            file_name: e.file_name,
            category: e.file_category,
          })),
        }),
        { status: 200, headers },
      );
    }

    // -----------------------------------------------------------------------
    // Process batch — call generate-embeddings per doc with retry
    // -----------------------------------------------------------------------
    const results: Array<{
      id: string;
      file_name: string;
      category: string;
      success: boolean;
      error?: string;
      error_code?: number;
      chunkCount?: number;
      quarantined?: boolean;
      latency_ms?: number;
    }> = [];

    let lastProcessedId = afterId;

    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i]!;
      lastProcessedId = entry.id;
      const startMs = Date.now();

      let success = false;
      let lastError = "";
      let lastStatus = 0;
      let chunkCount = 0;

      // Retry: up to 3 attempts with exponential backoff
      // Only retry 429/500/502/503/504. Don't retry 400/401/403/409/546.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(
            `${SUPABASE_URL}/functions/v1/generate-embeddings`,
            {
              method: "POST",
              headers: {
                "X-Internal-Secret": EMBEDDING_INTERNAL_SECRET,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ queue_id: entry.id }),
            },
          );

          lastStatus = response.status;
          const result = await response.json();

          if (response.ok && result.success) {
            success = true;
            chunkCount = result.chunkCount ?? 0;
            break;
          }

          lastError = result.error ?? result.message ?? `HTTP ${response.status}`;

          // Non-transient: don't retry
          if (![429, 500, 502, 503, 504].includes(response.status)) {
            break;
          }

          // Exponential backoff: 1s → 2s → 4s + jitter
          const backoff = 1000 * Math.pow(2, attempt) + Math.random() * 500;
          console.log(`[backfill] Retry ${attempt + 1} for ${entry.file_name} in ${Math.round(backoff)}ms`);
          await new Promise((r) => setTimeout(r, backoff));
        } catch (err) {
          lastError = (err as Error).message;
          lastStatus = 0;
          break;
        }
      }

      const latencyMs = Date.now() - startMs;

      // Quarantine non-retryable failures so they don't block future runs
      // generate-embeddings already marks 'embedded' on success
      const quarantined = !success && [400, 409, 546].includes(lastStatus);
      if (quarantined) {
        await supabase
          .from("file_processing_queue")
          .update({
            status: "embedding_failed",
            error_log: `${lastError} (HTTP ${lastStatus})`,
          })
          .eq("id", entry.id);
      }

      results.push({
        id: entry.id,
        file_name: entry.file_name,
        category: entry.file_category,
        success,
        error: success ? undefined : lastError,
        error_code: success ? undefined : lastStatus,
        chunkCount: success ? chunkCount : undefined,
        quarantined: quarantined || undefined,
        latency_ms: latencyMs,
      });

      console.log(
        `[backfill] ${i + 1}/${batch.length} ${entry.file_name}: ` +
        `${success ? `OK (${chunkCount} chunks)` : `FAIL ${lastStatus} ${quarantined ? "(quarantined)" : ""}`} ` +
        `${latencyMs}ms`,
      );

      // Delay between docs: base + jitter (±250ms)
      if (i < batch.length - 1) {
        const jitter = Math.random() * 500 - 250;
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_DOCS_MS + jitter));
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const quarantinedCount = results.filter((r) => r.quarantined).length;
    const totalChunks = results.reduce((sum, r) => sum + (r.chunkCount ?? 0), 0);
    const avgLatency = Math.round(results.reduce((sum, r) => sum + (r.latency_ms ?? 0), 0) / results.length);

    // Remaining after this batch (subtract succeeded + quarantined)
    const remainingAfter = Math.max(0, (remaining ?? 0) - succeeded - quarantinedCount);

    return new Response(
      JSON.stringify({
        success: true,
        processed: batch.length,
        succeeded,
        failed,
        quarantined: quarantinedCount,
        total_chunks: totalChunks,
        avg_latency_ms: avgLatency,
        remaining: remainingAfter,
        cursor: lastProcessedId,
        has_more: remainingAfter > 0,
        results,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("backfill-embeddings error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers },
    );
  }
});

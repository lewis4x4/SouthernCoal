import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EMBEDDING_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

const DELAY_BETWEEN_DOCS_MS = 2_000; // 1 doc per 2 seconds (Claude API rate limit)

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Auth: internal secret only (no JWT — this is a server-side backfill)
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

    // Parse optional filters
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // No body = process all
    }

    const batchSize = (body.batch_size as number) ?? 50;
    const dryRun = (body.dry_run as boolean) ?? false;

    // Fetch all parsed queue entries — paginated to avoid Supabase 1,000 row limit
    const PAGE_SIZE = 1000;
    let allEntries: Array<{
      id: string;
      file_name: string;
      file_category: string;
      state_code: string | null;
      status: string;
      document_id: string | null;
    }> = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from("file_processing_queue")
        .select("id, file_name, file_category, state_code, status, document_id")
        .eq("status", "parsed")
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (body.category) {
        query = query.eq("file_category", body.category as string);
      }
      if (body.state_code) {
        query = query.eq("state_code", body.state_code as string);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        return new Response(
          JSON.stringify({ success: false, error: `Fetch failed: ${fetchError.message}` }),
          { status: 500, headers },
        );
      }

      if (data) {
        allEntries = allEntries.concat(data);
        hasMore = data.length === PAGE_SIZE;
        from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    const entries = allEntries;

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No parsed entries to backfill", total: 0 }),
        { status: 200, headers },
      );
    }

    // Filter out entries that already have chunks
    const entriesToProcess: typeof entries = [];
    for (const entry of entries) {
      // Check by document_id if available, otherwise by queue entry id
      const chunkQuery = entry.document_id
        ? supabase.from("document_chunks").select("id", { count: "exact", head: true }).eq("document_id", entry.document_id)
        : supabase.from("document_chunks").select("id", { count: "exact", head: true }).eq("queue_entry_id", entry.id);

      const { count } = await chunkQuery;

      if (!count || count === 0) {
        entriesToProcess.push(entry);
      }
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          total_parsed: entries.length,
          needs_embedding: entriesToProcess.length,
          entries: entriesToProcess.map((e) => ({
            id: e.id,
            file_name: e.file_name,
            category: e.file_category,
          })),
        }),
        { status: 200, headers },
      );
    }

    // Process in batches
    const batch = entriesToProcess.slice(0, batchSize);
    const results: Array<{ id: string; file_name: string; success: boolean; error?: string; chunkCount?: number }> = [];

    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i]!;
      console.log(`[backfill] Processing ${i + 1}/${batch.length}: ${entry.file_name}`);

      try {
        // Call generate-embeddings for this entry
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

        const result = await response.json();

        if (response.ok && result.success) {
          results.push({
            id: entry.id,
            file_name: entry.file_name,
            success: true,
            chunkCount: result.chunkCount,
          });
        } else {
          results.push({
            id: entry.id,
            file_name: entry.file_name,
            success: false,
            error: result.error ?? `HTTP ${response.status}`,
          });
        }
      } catch (err) {
        results.push({
          id: entry.id,
          file_name: entry.file_name,
          success: false,
          error: (err as Error).message,
        });
      }

      // Rate limit delay (skip after last item)
      if (i < batch.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_DOCS_MS));
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalChunks = results.reduce((sum, r) => sum + (r.chunkCount ?? 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        total_parsed: entries.length,
        needs_embedding: entriesToProcess.length,
        processed: batch.length,
        succeeded,
        failed,
        total_chunks: totalChunks,
        remaining: entriesToProcess.length - batch.length,
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

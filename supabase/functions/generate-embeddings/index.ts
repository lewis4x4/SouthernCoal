import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const EMBEDDING_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

const CLAUDE_TIMEOUT_MS = 180_000;
const MAX_CHUNK_CHARS = 1_600;
const CHUNK_OVERLAP = 200;

// Byte budget for serialized text BEFORE it reaches the chunker.
// Capped to MAX_CHUNK_CHARS so lab_data always produces exactly 1 content chunk.
// gte-small in Edge Runtime can handle 2 chunks (metadata + 1 content) but
// OOMs at 3+ due to cumulative inference memory.
const SUMMARY_BYTE_BUDGET = 1_500;
// Threshold: extracted_data JSON above this size gets the summary serializer
const LARGE_DOC_THRESHOLD = 5_000; // 5KB — conservative to stay within worker limits

// Hard cap on chunks per invocation. gte-small in Edge Runtime OOMs at 3+.
// Override only via env var (not request body) to prevent accidental overload.
const MAX_CHUNKS_PER_DOC = parseInt(Deno.env.get("MAX_CHUNKS_PER_DOC") ?? "2", 10);

const VERSION = "2026-02-11T01:00";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface QueueRow {
  id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_category: string;
  state_code: string | null;
  status: string;
  uploaded_by: string | null;
  document_id: string | null;
  extracted_data: Record<string, unknown> | null;
}

interface PageText {
  page: number;
  text: string;
}

interface Chunk {
  index: number;
  text: string;
  chars: number;
  sourcePage: number;
  sourceSection: string | null;
}

// ---------------------------------------------------------------------------
// Auth — dual path: internal secret OR JWT
// ---------------------------------------------------------------------------
async function validateAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<{ authorized: boolean; userId: string | null; orgId: string | null }> {
  // Path 1: Internal secret (backfill, automation)
  const internalHeader = req.headers.get("X-Internal-Secret");
  if (
    internalHeader &&
    internalHeader === EMBEDDING_INTERNAL_SECRET &&
    EMBEDDING_INTERNAL_SECRET.length > 0
  ) {
    return { authorized: true, userId: null, orgId: null };
  }

  // Path 2: User JWT (frontend trigger)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { authorized: false, userId: null, orgId: null };
  }
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { authorized: false, userId: null, orgId: null };
  }

  // Resolve org from user_profiles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  return {
    authorized: true,
    userId: user.id,
    orgId: profile?.organization_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Organization resolution — 3-step fallback
// ---------------------------------------------------------------------------
async function resolveOrgId(
  supabase: ReturnType<typeof createClient>,
  authOrgId: string | null,
  queueEntry: { uploaded_by: string | null; document_id: string | null },
): Promise<string | null> {
  if (authOrgId) return authOrgId;

  if (queueEntry.uploaded_by) {
    const { data } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", queueEntry.uploaded_by)
      .single();
    if (data?.organization_id) return data.organization_id;
  }

  if (queueEntry.document_id) {
    const { data } = await supabase
      .from("documents")
      .select("organization_id")
      .eq("id", queueEntry.document_id)
      .single();
    if (data?.organization_id) return data.organization_id;
  }

  return null;
}

// ---------------------------------------------------------------------------
// PDF text extraction via Claude API — page-aware
// ---------------------------------------------------------------------------
async function extractPdfText(pdfUrl: string): Promise<PageText[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "url", url: pdfUrl },
              },
              {
                type: "text",
                text: `Extract ALL text from this PDF document.

Return a JSON array where each element represents one page:
[
  { "page": 1, "text": "full text content of page 1..." },
  { "page": 2, "text": "full text content of page 2..." }
]

RULES:
- Include ALL text — headers, footers, tables, conditions, notes, everything
- Preserve paragraph structure (use newlines)
- For tables, render as readable text rows
- Page numbers must match the actual PDF page numbers
- Do not summarize or skip any content
- Return ONLY the JSON array, no markdown fences or explanation`,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(`Claude API error: ${result.error?.message ?? response.status}`);
    }

    const textContent = result.content?.find(
      (b: { type: string }) => b.type === "text",
    );
    if (!textContent?.text) {
      throw new Error("No text in Claude response");
    }

    let jsonText = textContent.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const pages: PageText[] = JSON.parse(jsonText);
    return pages.filter((p) => p.text && p.text.trim().length > 0);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Serializers — routed by doc type + size
// ---------------------------------------------------------------------------

/**
 * Full-fidelity serializer for small docs (<100KB extracted_data).
 * Serializes metadata, parameters, and up to 50 sample records.
 */
function serializeFullFidelity(extracted: Record<string, unknown>): string {
  const lines: string[] = [];

  if (extracted.document_type) lines.push(`Document Type: ${extracted.document_type}`);
  if (extracted.permit_numbers) lines.push(`Permits: ${(extracted.permit_numbers as string[]).join(", ")}`);
  if (extracted.permit_number) lines.push(`Permit: ${extracted.permit_number}`);
  if (extracted.states) lines.push(`States: ${(extracted.states as string[]).join(", ")}`);
  if (extracted.date_range) {
    const dr = extracted.date_range as { earliest?: string; latest?: string };
    lines.push(`Date Range: ${dr.earliest ?? "?"} to ${dr.latest ?? "?"}`);
  }
  if (extracted.summary) lines.push(`\nSummary: ${extracted.summary}`);

  const params = extracted.parameter_summary as Array<{ canonical_name: string; sample_count: number }> | undefined;
  if (params?.length) {
    lines.push("\nParameters:");
    for (const p of params) {
      lines.push(`  ${p.canonical_name}: ${p.sample_count} samples`);
    }
  }

  const records = extracted.records as Array<Record<string, unknown>> | undefined;
  if (records?.length) {
    lines.push(`\nData Records (${records.length} total):`);
    const sample = records.slice(0, 50);
    for (const r of sample) {
      const parts = Object.entries(r)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      lines.push(`  ${parts}`);
    }
    if (records.length > 50) {
      lines.push(`  ... and ${records.length - 50} more records`);
    }
  }

  return lines.join("\n");
}

/**
 * Byte-budgeted summary serializer for large docs (lab data, etc.).
 * Produces a searchable summary: metadata + parameters + sample records,
 * hard-capped at byteBudget chars BEFORE reaching the chunker.
 */
function serializeSummary(extracted: Record<string, unknown>, byteBudget: number): string {
  let used = 0;

  function addLine(line: string): string | null {
    if (used + line.length + 1 > byteBudget) return null;
    used += line.length + 1;
    return line;
  }

  const lines: string[] = [];

  // Always include: doc type, permits, states, date range, summary
  const header: Array<[string, unknown]> = [
    ["Document Type", extracted.document_type],
    ["Permits", extracted.permit_numbers ? (extracted.permit_numbers as string[]).join(", ") : extracted.permit_number],
    ["States", extracted.states ? (extracted.states as string[]).join(", ") : null],
  ];
  for (const [label, val] of header) {
    if (val) {
      const l = addLine(`${label}: ${val}`);
      if (l) lines.push(l);
    }
  }

  if (extracted.date_range) {
    const dr = extracted.date_range as { earliest?: string; latest?: string };
    const l = addLine(`Date Range: ${dr.earliest ?? "?"} to ${dr.latest ?? "?"}`);
    if (l) lines.push(l);
  }

  if (extracted.total_rows) {
    const l = addLine(`Total Data Rows: ${extracted.total_rows}`);
    if (l) lines.push(l);
  }

  if (extracted.summary) {
    const l = addLine(`\nSummary: ${extracted.summary}`);
    if (l) lines.push(l);
  }

  // Parameter summary — high search value, low byte cost
  const params = extracted.parameter_summary as Array<{ canonical_name: string; sample_count: number }> | undefined;
  if (params?.length) {
    const paramHeader = addLine("\nParameters Monitored:");
    if (paramHeader) {
      lines.push(paramHeader);
      for (const p of params) {
        const l = addLine(`  ${p.canonical_name}: ${p.sample_count} samples`);
        if (!l) break; // Budget exhausted
        lines.push(l);
      }
    }
  }

  // Sample records — only if budget remains, add one at a time
  const records = extracted.records as Array<Record<string, unknown>> | undefined;
  if (records?.length && used < byteBudget * 0.8) {
    const recHeader = addLine(`\nSample Records (${records.length} total):`);
    if (recHeader) {
      lines.push(recHeader);
      for (const r of records) {
        const parts = Object.entries(r)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        const l = addLine(`  ${parts}`);
        if (!l) {
          lines.push(`  ... (${records.length} records total, budget-capped)`);
          break;
        }
        lines.push(l);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Route to the right serializer based on doc type and extracted_data size.
 * Returns capped text that is safe to feed to the chunker.
 */
function serializeExtractedData(
  extracted: Record<string, unknown>,
  category: string,
): PageText[] {
  const jsonSize = JSON.stringify(extracted).length;
  const isLargeDoc = jsonSize > LARGE_DOC_THRESHOLD;
  const isLabData = category === "lab_data";

  let text: string;
  if (isLabData || isLargeDoc) {
    // Large lab data: byte-budgeted summary only
    text = serializeSummary(extracted, SUMMARY_BYTE_BUDGET);
    console.log(`[embed] ${category}: summary serializer (json=${jsonSize}, text=${text.length}, budget=${SUMMARY_BYTE_BUDGET})`);
  } else {
    // Small docs: full fidelity
    text = serializeFullFidelity(extracted);
    console.log(`[embed] ${category}: full serializer (json=${jsonSize}, text=${text.length})`);
  }

  return [{ page: 0, text }];
}

// ---------------------------------------------------------------------------
// Metadata header chunk from extracted_data
// ---------------------------------------------------------------------------
function buildMetadataChunk(queueEntry: QueueRow): string {
  const extracted = queueEntry.extracted_data;
  const lines: string[] = [];

  lines.push(`File: ${queueEntry.file_name}`);
  lines.push(`Category: ${queueEntry.file_category}`);
  if (queueEntry.state_code) lines.push(`State: ${queueEntry.state_code}`);

  if (extracted) {
    if (extracted.permit_number) lines.push(`Permit: ${extracted.permit_number}`);
    if (extracted.document_type) lines.push(`Type: ${extracted.document_type}`);
    if (extracted.state) lines.push(`State: ${extracted.state}`);
    if (extracted.effective_date) lines.push(`Effective: ${extracted.effective_date}`);
    if (extracted.expiration_date) lines.push(`Expires: ${extracted.expiration_date}`);
    if (extracted.summary) lines.push(`Summary: ${extracted.summary}`);
    if (extracted.outfall_count) lines.push(`Outfalls: ${extracted.outfall_count}`);
    if (extracted.limit_count) lines.push(`Limits: ${extracted.limit_count}`);
    if (extracted.permit_numbers) {
      lines.push(`Permits: ${(extracted.permit_numbers as string[]).join(", ")}`);
    }
    if (extracted.total_rows) lines.push(`Total Rows: ${extracted.total_rows}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Character-based chunking — respects page boundaries
// ---------------------------------------------------------------------------
function chunkPageText(pages: PageText[]): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 1; // 0 is reserved for metadata header

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;

    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        index: chunkIndex++,
        text,
        chars: text.length,
        sourcePage: page.page,
        sourceSection: null,
      });
      continue;
    }

    let offset = 0;
    while (offset < text.length) {
      let end = Math.min(offset + MAX_CHUNK_CHARS, text.length);

      if (end < text.length) {
        const paraBreak = text.lastIndexOf("\n\n", end);
        if (paraBreak > offset + MAX_CHUNK_CHARS / 2) {
          end = paraBreak + 2;
        } else {
          const sentBreak = text.lastIndexOf(". ", end);
          if (sentBreak > offset + MAX_CHUNK_CHARS / 2) {
            end = sentBreak + 2;
          } else {
            const wordBreak = text.lastIndexOf(" ", end);
            if (wordBreak > offset + MAX_CHUNK_CHARS / 2) {
              end = wordBreak + 1;
            }
          }
        }
      }

      const chunkText = text.slice(offset, end).trim();
      if (chunkText) {
        chunks.push({
          index: chunkIndex++,
          text: chunkText,
          chars: chunkText.length,
          sourcePage: page.page,
          sourceSection: null,
        });
      }

      offset = end - CHUNK_OVERLAP;
      if (offset >= text.length) break;
      if (offset <= (end - MAX_CHUNK_CHARS)) offset = end;
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding generation via Supabase AI (gte-small)
// Session created once per invocation and reused across chunks.
// ---------------------------------------------------------------------------
// @ts-expect-error — Supabase.ai is available in Edge Runtime
let aiSession: InstanceType<typeof Supabase.ai.Session> | null = null;

function getAiSession() {
  if (!aiSession) {
    // @ts-expect-error — Supabase.ai is available in Edge Runtime
    aiSession = new Supabase.ai.Session("gte-small");
  }
  return aiSession;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const session = getAiSession();
  const embedding = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(embedding);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Validate auth
    const auth = await validateAuth(req, supabase);
    if (!auth.authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers,
      });
    }

    // 2. Parse request
    const { queue_id } = await req.json();
    if (!queue_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing queue_id" }),
        { status: 400, headers },
      );
    }

    console.log(`[embed] v=${VERSION} stage=start queue_id=${queue_id}`);

    // 3. Fetch queue entry (without extracted_data — loaded separately to
    //    avoid WORKER_LIMIT on large lab data files with 3.5MB+ JSON)
    const { data: queueEntry, error: fetchError } = await supabase
      .from("file_processing_queue")
      .select(
        "id, storage_bucket, storage_path, file_name, file_category, state_code, status, uploaded_by, document_id",
      )
      .eq("id", queue_id)
      .single();

    if (fetchError || !queueEntry) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Queue entry not found: ${queue_id}`,
          details: fetchError?.message ?? null,
          hint: fetchError?.hint ?? null,
          code: fetchError?.code ?? null,
        }),
        { status: 404, headers },
      );
    }

    console.log(`[embed] stage=load_queue file=${queueEntry.file_name} category=${queueEntry.file_category}`);

    // 3b. Load extracted_data via RPC (truncates records array for large docs)
    const { data: extractedData } = await supabase.rpc(
      "get_embedding_extracted_data",
      { p_queue_id: queue_id, p_max_records: 20 },
    );
    const extractedBytes = extractedData ? JSON.stringify(extractedData).length : 0;
    console.log(`[embed] stage=load_extracted size_bytes=${extractedBytes}`);
    const entry: QueueRow = {
      ...queueEntry,
      extracted_data: (extractedData as Record<string, unknown>) ?? null,
    };

    // 4. Guard: only parsed or embedded (re-embed) entries
    if (entry.status !== "parsed" && entry.status !== "embedded") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot generate embeddings for entry with status '${entry.status}'. Expected 'parsed' or 'embedded'.`,
        }),
        { status: 409, headers },
      );
    }

    // 5. Resolve organization_id
    const orgId = await resolveOrgId(supabase, auth.orgId, entry);
    if (!orgId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Cannot resolve organization_id for this document. Check uploaded_by user profile.",
        }),
        { status: 400, headers },
      );
    }

    // 6. Delete existing chunks for idempotency
    if (entry.document_id) {
      await supabase
        .from("document_chunks")
        .delete()
        .eq("document_id", entry.document_id);
    } else {
      await supabase
        .from("document_chunks")
        .delete()
        .eq("queue_entry_id", entry.id);
    }

    // 7. Extract text — route by source type
    const isBackfill = !auth.userId;
    let pages: PageText[] = [];
    const isPdf =
      entry.file_name.toLowerCase().endsWith(".pdf") ||
      entry.file_category === "npdes_permit";

    if (isPdf && !isBackfill) {
      // Full PDF extraction via Claude — only for frontend-triggered calls
      const { data: urlData, error: urlError } = await supabase.storage
        .from(entry.storage_bucket)
        .createSignedUrl(entry.storage_path, 300);

      if (urlError || !urlData?.signedUrl) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to get signed URL: ${urlError?.message}` }),
          { status: 500, headers },
        );
      }

      try {
        pages = await extractPdfText(urlData.signedUrl);
      } catch (extractErr) {
        console.warn("PDF text extraction failed, falling back to extracted_data:", extractErr);
        if (entry.extracted_data) {
          pages = serializeExtractedData(entry.extracted_data, entry.file_category);
        }
      }
    } else if (entry.extracted_data) {
      // Backfill + spreadsheets: routed serializer (full vs summary)
      pages = serializeExtractedData(entry.extracted_data, entry.file_category);
    }

    if (pages.length === 0 && !entry.extracted_data) {
      return new Response(
        JSON.stringify({ success: false, error: "No text extractable from document" }),
        { status: 400, headers },
      );
    }

    // 8. Build chunks — text is already capped by the serializer
    const metadataText = buildMetadataChunk(entry);
    let allChunks: Chunk[] = [
      {
        index: 0,
        text: metadataText,
        chars: metadataText.length,
        sourcePage: 0,
        sourceSection: "metadata",
      },
    ];

    if (pages.length > 0) {
      allChunks.push(...chunkPageText(pages));
    }

    // Hard cap: enforce MAX_CHUNKS_PER_DOC to prevent gte-small OOM
    const preCapCount = allChunks.length;
    const truncatedForEmbedding = preCapCount > MAX_CHUNKS_PER_DOC;
    if (truncatedForEmbedding) {
      allChunks = allChunks.slice(0, MAX_CHUNKS_PER_DOC);
      console.log(`[embed] stage=cap precap=${preCapCount} postcap=${allChunks.length} max=${MAX_CHUNKS_PER_DOC}`);
    }

    // Diagnostic: log what we're about to embed
    const totalTextBytes = allChunks.reduce((sum, c) => sum + c.chars, 0);
    console.log(`[embed] stage=chunk chunks=${allChunks.length} text_bytes=${totalTextBytes}${truncatedForEmbedding ? ` (capped from ${preCapCount})` : ""}`);

    // 9. Generate embeddings
    console.log(`[embed] stage=embed provider=gte-small chunks=${allChunks.length}`);
    const chunkRows: Array<Record<string, unknown>> = [];
    for (const chunk of allChunks) {
      try {
        console.log(`[embed] stage=embed_chunk idx=${chunk.index} chars=${chunk.chars}`);
        const embedding = await generateEmbedding(chunk.text);
        chunkRows.push({
          document_id: entry.document_id,
          queue_entry_id: entry.id,
          organization_id: orgId,
          chunk_index: chunk.index,
          chunk_text: chunk.text,
          chunk_chars: chunk.chars,
          source_page: chunk.sourcePage,
          source_section: chunk.sourceSection,
          document_type: entry.file_category,
          state_code: entry.state_code,
          permit_number:
            (entry.extracted_data?.permit_number as string) ?? null,
          file_name: entry.file_name,
          embedding: JSON.stringify(embedding),
        });
      } catch (embErr) {
        console.warn(`[embed] Chunk ${chunk.index} failed (${chunk.chars} chars):`, embErr);
      }
    }

    if (chunkRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "All embeddings failed",
          diagnostics: {
            doc_id: entry.id,
            doc_type: entry.file_category,
            chunks_attempted: allChunks.length,
            text_bytes: totalTextBytes,
          },
        }),
        { status: 500, headers },
      );
    }

    // 10. Batch insert chunks
    const { error: insertError } = await supabase
      .from("document_chunks")
      .upsert(chunkRows, { onConflict: "document_id,chunk_index" });

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: `Chunk insert failed: ${insertError.message}` }),
        { status: 500, headers },
      );
    }

    // 10b. Mark queue entry as embedded so backfill cursor can skip it
    await supabase
      .from("file_processing_queue")
      .update({ status: "embedded" })
      .eq("id", entry.id);

    // 11. Audit log (frontend-triggered only)
    if (auth.userId) {
      await supabase.from("audit_log").insert({
        user_id: auth.userId,
        action: "generate_embedding",
        module: "document_search",
        table_name: "document_chunks",
        record_id: entry.document_id,
        description: JSON.stringify({
          queue_id: entry.id,
          document_id: entry.document_id,
          chunk_count: chunkRows.length,
          page_count: pages.length,
          org_id: orgId,
        }),
      });
    }

    // 12. Success
    const pageCount = new Set(pages.map((p) => p.page)).size;
    console.log(`[embed] stage=done chunks=${chunkRows.length} pages=${pageCount}${truncatedForEmbedding ? ` truncated_from=${preCapCount}` : ""}`);
    return new Response(
      JSON.stringify({
        success: true,
        version: VERSION,
        documentId: entry.document_id,
        chunkCount: chunkRows.length,
        pageCount,
        truncated_for_embedding: truncatedForEmbedding || undefined,
        precap_chunk_count: truncatedForEmbedding ? preCapCount : undefined,
        max_chunks_per_doc: MAX_CHUNKS_PER_DOC,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("generate-embeddings error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Embedding generation failed. Please try again or contact support.",
      }),
      { status: 500, headers },
    );
  }
});

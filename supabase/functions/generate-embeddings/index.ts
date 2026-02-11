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
  // 1. From authenticated user
  if (authOrgId) return authOrgId;

  // 3. From uploader's profile
  if (queueEntry.uploaded_by) {
    const { data } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", queueEntry.uploaded_by)
      .single();
    if (data?.organization_id) return data.organization_id;
  }

  // 4. From linked document
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

    // Parse JSON from response — strip markdown fences if present
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
// Spreadsheet text serialization (for lab data / CSV files)
// ---------------------------------------------------------------------------
function serializeExtractedData(extracted: Record<string, unknown>): PageText[] {
  const lines: string[] = [];

  // Build readable text from extracted_data fields
  if (extracted.document_type) lines.push(`Document Type: ${extracted.document_type}`);
  if (extracted.permit_numbers) lines.push(`Permits: ${(extracted.permit_numbers as string[]).join(", ")}`);
  if (extracted.states) lines.push(`States: ${(extracted.states as string[]).join(", ")}`);
  if (extracted.date_range) {
    const dr = extracted.date_range as { earliest?: string; latest?: string };
    lines.push(`Date Range: ${dr.earliest ?? "?"} to ${dr.latest ?? "?"}`);
  }
  if (extracted.summary) lines.push(`\nSummary: ${extracted.summary}`);

  // Serialize parameter summary
  const params = extracted.parameter_summary as Array<{ canonical_name: string; sample_count: number }> | undefined;
  if (params?.length) {
    lines.push("\nParameters:");
    for (const p of params) {
      lines.push(`  ${p.canonical_name}: ${p.sample_count} samples`);
    }
  }

  // Serialize records (first 50)
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

  return [{ page: 0, text: lines.join("\n") }];
}

// ---------------------------------------------------------------------------
// Metadata header chunk from extracted_data
// ---------------------------------------------------------------------------
function buildMetadataChunk(
  queueEntry: QueueRow,
): string {
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

    // For lab data
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
      // Fits in one chunk
      chunks.push({
        index: chunkIndex++,
        text,
        chars: text.length,
        sourcePage: page.page,
        sourceSection: null,
      });
      continue;
    }

    // Split within page
    let offset = 0;
    while (offset < text.length) {
      let end = Math.min(offset + MAX_CHUNK_CHARS, text.length);

      // If not at end, find a good split point
      if (end < text.length) {
        // Try paragraph boundary
        const paraBreak = text.lastIndexOf("\n\n", end);
        if (paraBreak > offset + MAX_CHUNK_CHARS / 2) {
          end = paraBreak + 2;
        } else {
          // Try sentence boundary
          const sentBreak = text.lastIndexOf(". ", end);
          if (sentBreak > offset + MAX_CHUNK_CHARS / 2) {
            end = sentBreak + 2;
          } else {
            // Try word boundary
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

      // Move forward with overlap
      offset = end - CHUNK_OVERLAP;
      if (offset >= text.length) break;
      // Ensure we make progress
      if (offset <= (end - MAX_CHUNK_CHARS)) offset = end;
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding generation via Supabase AI (gte-small)
// ---------------------------------------------------------------------------
async function generateEmbedding(
  text: string,
): Promise<number[]> {
  // Use Supabase Edge Runtime's built-in AI session
  // @ts-ignore — Supabase.ai is available in Edge Runtime
  const session = new Supabase.ai.Session("gte-small");
  const embedding = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(embedding);
}

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
    // Service-role client for all DB operations
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

    // 3. Fetch queue entry
    const { data: queueEntry, error: fetchError } = await supabase
      .from("file_processing_queue")
      .select(
        "id, storage_bucket, storage_path, file_name, file_category, state_code, status, uploaded_by, document_id, extracted_data",
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

    // 4. Guard: only parsed entries
    if (queueEntry.status !== "parsed") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot generate embeddings for entry with status '${queueEntry.status}'. Expected 'parsed'.`,
        }),
        { status: 409, headers },
      );
    }

    // 5. Resolve organization_id
    const orgId = await resolveOrgId(supabase, auth.orgId, queueEntry);
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
    if (queueEntry.document_id) {
      await supabase
        .from("document_chunks")
        .delete()
        .eq("document_id", queueEntry.document_id);
    }

    // 7. Extract text — PDF vs spreadsheet
    // Internal secret calls (backfill) skip Claude PDF extraction to stay within
    // Edge Function timeout. extracted_data from the parse step is used instead.
    const isBackfill = !auth.userId;
    let pages: PageText[] = [];
    const isPdf =
      queueEntry.file_name.toLowerCase().endsWith(".pdf") ||
      queueEntry.file_category === "npdes_permit";
    const isSpreadsheet =
      queueEntry.file_category === "lab_data" ||
      /\.(csv|xlsx|xls|tsv)$/i.test(queueEntry.file_name);

    if (isPdf && !isBackfill) {
      // Full PDF extraction via Claude — only for frontend-triggered calls
      const { data: urlData, error: urlError } = await supabase.storage
        .from(queueEntry.storage_bucket)
        .createSignedUrl(queueEntry.storage_path, 300);

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
        if (queueEntry.extracted_data) {
          pages = serializeExtractedData(queueEntry.extracted_data);
        }
      }
    } else if (queueEntry.extracted_data) {
      // Backfill PDFs, spreadsheets, and other types — use extracted_data
      pages = serializeExtractedData(queueEntry.extracted_data);
    }

    if (pages.length === 0 && !queueEntry.extracted_data) {
      return new Response(
        JSON.stringify({ success: false, error: "No text extractable from document" }),
        { status: 400, headers },
      );
    }

    // 8. Build chunks
    // Metadata header chunk (index 0)
    const metadataText = buildMetadataChunk(queueEntry);
    const allChunks: Chunk[] = [
      {
        index: 0,
        text: metadataText,
        chars: metadataText.length,
        sourcePage: 0,
        sourceSection: "metadata",
      },
    ];

    // Page content chunks
    if (pages.length > 0) {
      allChunks.push(...chunkPageText(pages));
    }

    // 9. Generate embeddings for all chunks
    const chunkRows: Array<Record<string, unknown>> = [];
    for (const chunk of allChunks) {
      try {
        const embedding = await generateEmbedding(chunk.text);
        chunkRows.push({
          document_id: queueEntry.document_id,
          queue_entry_id: queueEntry.id,
          organization_id: orgId,
          chunk_index: chunk.index,
          chunk_text: chunk.text,
          chunk_chars: chunk.chars,
          source_page: chunk.sourcePage,
          source_section: chunk.sourceSection,
          document_type: queueEntry.file_category,
          state_code: queueEntry.state_code,
          permit_number:
            (queueEntry.extracted_data?.permit_number as string) ?? null,
          file_name: queueEntry.file_name,
          embedding: JSON.stringify(embedding),
        });
      } catch (embErr) {
        console.warn(`Skipping chunk ${chunk.index}: embedding failed:`, embErr);
      }
    }

    if (chunkRows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "All embeddings failed" }),
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

    // 11. Audit log
    if (auth.userId) {
      await supabase.from("audit_log").insert({
        user_id: auth.userId,
        action: "generate_embedding",
        module: "document_search",
        table_name: "document_chunks",
        record_id: queueEntry.document_id,
        description: JSON.stringify({
          queue_id: queueEntry.id,
          document_id: queueEntry.document_id,
          chunk_count: chunkRows.length,
          page_count: pages.length,
          org_id: orgId,
        }),
      });
    }

    // 12. Success
    const pageCount = new Set(pages.map((p) => p.page)).size;
    return new Response(
      JSON.stringify({
        success: true,
        documentId: queueEntry.document_id,
        chunkCount: chunkRows.length,
        pageCount,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("generate-embeddings error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers },
    );
  }
});

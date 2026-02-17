import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CLAUDE_TIMEOUT_MS = 60_000; // 60 seconds for vision processing
// Send ALL tasks to Claude - we need comprehensive matching for compliance tracking

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ProcessRequest {
  handoff_input_id: string;
  attachment_path?: string;
  raw_content?: string;
  file_mime_type?: string;
  // Source metadata for audit trail
  source_type?: string;       // email, text, call, document, paste, file
  source_from?: string;       // Who sent the handoff (e.g., "Tom at SCC")
  source_date?: string;       // Date of original communication
  source_reference?: string;  // Email subject, file name, etc.
  organization_id?: string;   // For org-scoped processing
}

interface TaskMatch {
  task_id: string;
  task_number: string;
  task_title: string;
  match_confidence: number;
  proposed_status?: string;
  proposed_notes?: string;
  matched_text: string;
  requires_review: boolean;
  reasoning?: string;
}

interface ProcessResponse {
  success: boolean;
  handoff_id?: string;
  extracted_text: string;
  task_matches: TaskMatch[];
  unmatched_items: string[];
  extraction_confidence: number;
  ai_reasoning?: string;
  processing_time_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Vision Extraction Prompt
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Generate Human-Readable Handoff ID
// ---------------------------------------------------------------------------
async function generateHandoffId(supabase: ReturnType<typeof createClient>): Promise<string> {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const prefix = `HO-${today}`;

  // Get count of handoffs created today to generate sequence number
  const { count } = await supabase
    .from("handoff_history")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`)
    .lt("created_at", `${today}T23:59:59Z`);

  const sequence = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}-${sequence}`;
}

// ---------------------------------------------------------------------------
// Vision Extraction Prompt
// ---------------------------------------------------------------------------
const VISION_EXTRACTION_PROMPT = `Extract ALL text from this image/document. Focus on:
- Task IDs or numbers (format: X.XX or X.XX.X like 1.29, 2.3.1)
- Status updates (completed, blocked, in progress, done, waiting)
- Dates and deadlines
- Names of people or companies
- Action items or decisions made
- File names or permit numbers mentioned
- Any references to roadmap tasks, milestones, or deliverables

Return the extracted text in a structured, readable format. Preserve the original wording for accuracy.`;

// ---------------------------------------------------------------------------
// Task Matching Prompt
// ---------------------------------------------------------------------------
function buildTaskMatchingPrompt(extractedText: string, tasksJson: string, sourceFrom?: string, sourceDate?: string): string {
  const sourceContext = sourceFrom ? `\nSOURCE: ${sourceFrom}${sourceDate ? ` (${sourceDate})` : ''}` : '';

  return `You are a task matching assistant for an NPDES compliance monitoring system under federal Clean Water Act Consent Decree oversight. Given extracted text from a handoff document and a list of roadmap tasks, identify which tasks are being referenced and what updates should be made.

EXTRACTED TEXT:${sourceContext}
${extractedText}

ROADMAP TASKS (JSON):
${tasksJson}

MATCHING RULES (Priority Order):
1. EXPLICIT REFERENCES: Look for task numbers like "Task 1.29", "1.29", "task 2.3.1" — these are HIGH confidence (0.95+)
2. STATUS KEYWORDS: "completed", "done", "finished" → completed; "blocked", "waiting on", "stuck" → blocked; "working on", "in progress", "started" → in_progress
3. SEMANTIC MATCHING: Match by content similarity to task descriptions — only if confidence > 0.7
4. FILE/DATA REFERENCES: Mentions of files, reports, spreadsheets, or data likely relate to data import/parser tasks
5. PERMIT/OUTFALL REFERENCES: Specific permit numbers (WVxxxxxxx) or outfall IDs match permit limit/configuration tasks
6. PERSON CONTEXT: Messages from "Tom" relate to SCC operations; "Bill Johnson" relates to VA permits; regulatory agency names relate to compliance tasks
7. EVIDENCE PRESERVATION: Extract exact quotes that support the match for audit trail

COMPLIANCE CONTEXT:
- This is litigation-grade software — all matches must be defensible
- Prefer false negatives over false positives
- Always include matched_text verbatim from source
- Flag any regulatory deadlines, permit numbers, or enforcement mentions

For each task match found, return a JSON array with objects containing:
- task_id: UUID of the matched task
- task_number: Task number string (e.g., "1.29")
- task_title: Task title for display
- match_confidence: 0-1 confidence score (1.0 = explicit mention, 0.7-0.9 = strong semantic, <0.7 = exclude)
- proposed_status: new status if mentioned (pending/in_progress/completed/blocked) — only if clearly stated
- proposed_notes: any notes to add based on the content — preserve evidence
- matched_text: the EXACT source text that led to this match (verbatim quote)
- reasoning: brief explanation of why this matches

ALSO RETURN any content that looks task-related but couldn't be matched:
Add an "unmatched_items" array with strings describing items that might need new tasks or manual review.

Return ONLY valid JSON object with two keys: "matches" (array) and "unmatched_items" (array).

Example:
{
  "matches": [
    {
      "task_id": "uuid-here",
      "task_number": "1.29",
      "task_title": "Get sample DMR submission from each state",
      "match_confidence": 0.95,
      "proposed_status": "completed",
      "proposed_notes": "Tom confirmed TN files received via email 2026-02-15",
      "matched_text": "I sent you the TN quarterly reports you asked for",
      "reasoning": "Explicit confirmation of TN DMR samples being sent"
    }
  ],
  "unmatched_items": [
    "Reference to 'new selenium testing protocol' - may need new task",
    "Mention of 'March 15 deadline' - unclear which task"
  ]
}

If no matches found, return: {"matches": [], "unmatched_items": []}`;
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  // Initialize Supabase client with service role
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );

  if (authError || !user) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Parse request body
  let body: ProcessRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[process-handoff] User ${user.id} processing handoff ${body.handoff_input_id}`);

  try {
    let extractedText = body.raw_content || "";

    // Step 1: Extract text from attachment using Claude Vision
    if (body.attachment_path) {
      console.log(`[process-handoff] Downloading attachment: ${body.attachment_path}`);

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("handoff-attachments")
        .download(body.attachment_path);

      if (downloadError) {
        throw new Error(`File download failed: ${downloadError.message}`);
      }

      // Convert to base64
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = encodeBase64(new Uint8Array(arrayBuffer));

      // Determine media type
      const mediaType = body.file_mime_type || "image/png";
      // Handle PDF differently - Claude can process PDFs as documents
      const isPdf = mediaType === "application/pdf";

      console.log(`[process-handoff] Calling Claude Vision for ${isPdf ? "PDF" : "image"} extraction`);

      // Call Claude Vision API
      const visionResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{
            role: "user",
            content: isPdf
              ? [
                  {
                    type: "document",
                    source: {
                      type: "base64",
                      media_type: "application/pdf",
                      data: base64,
                    },
                  },
                  { type: "text", text: VISION_EXTRACTION_PROMPT },
                ]
              : [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                      data: base64,
                    },
                  },
                  { type: "text", text: VISION_EXTRACTION_PROMPT },
                ],
          }],
        }),
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
      });

      if (!visionResponse.ok) {
        const errorText = await visionResponse.text();
        throw new Error(`Claude Vision API failed: ${errorText}`);
      }

      const visionData = await visionResponse.json();
      extractedText = visionData.content?.[0]?.type === "text"
        ? visionData.content[0].text
        : "";

      console.log(`[process-handoff] Extracted ${extractedText.length} characters from attachment`);
    }

    // Step 2: Fetch ALL roadmap tasks for comprehensive matching
    const { data: tasks, error: tasksError } = await supabase
      .from("roadmap_tasks")
      .select("id, task_number, title, description, status, category, phase, section")
      .order("task_number");

    if (tasksError) {
      throw new Error(`Tasks fetch failed: ${tasksError.message}`);
    }

    console.log(`[process-handoff] Fetched ${tasks?.length ?? 0} tasks for matching`);

    // Step 3: Use Claude to match extracted text to tasks
    let taskMatches: TaskMatch[] = [];

    let unmatchedItems: string[] = [];

    if (extractedText.trim().length > 0 && tasks && tasks.length > 0) {
      const tasksJson = JSON.stringify(
        tasks.map((t) => ({
          id: t.id,
          task_number: t.task_number,
          title: t.title,
          description: t.description?.substring(0, 300), // Include more context
          status: t.status,
          phase: t.phase,
          section: t.section,
        })),
        null,
        2
      );

      console.log(`[process-handoff] Calling Claude for task matching (${tasks.length} tasks)`);

      const matchResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192, // Increased for larger response with all tasks
          messages: [{
            role: "user",
            content: buildTaskMatchingPrompt(extractedText, tasksJson, body.source_from, body.source_date),
          }],
        }),
        signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
      });

      if (!matchResponse.ok) {
        console.error(`[process-handoff] Claude matching failed: ${await matchResponse.text()}`);
        // Continue without matches rather than failing completely
      } else {
        const matchData = await matchResponse.json();
        const matchText = matchData.content?.[0]?.type === "text"
          ? matchData.content[0].text
          : '{"matches": [], "unmatched_items": []}';

        // Parse matches, handling potential JSON formatting
        try {
          const cleaned = matchText
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
          const parsed = JSON.parse(cleaned);

          // Handle new response format with matches and unmatched_items
          const matches = parsed.matches ?? parsed; // Fallback for old format
          taskMatches = (Array.isArray(matches) ? matches : []).map((m: TaskMatch) => ({
            ...m,
            requires_review: m.match_confidence < 0.8,
          }));
          unmatchedItems = parsed.unmatched_items ?? [];

          console.log(`[process-handoff] Found ${taskMatches.length} task matches, ${unmatchedItems.length} unmatched items`);
        } catch {
          console.error(`[process-handoff] Failed to parse match response: ${matchText}`);
        }
      }
    }

    // Step 4: Get user's organization ID
    const orgId = body.organization_id;
    let resolvedOrgId = orgId;

    if (!resolvedOrgId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      resolvedOrgId = profile?.organization_id;
    }

    // Step 5: Generate human-readable handoff ID
    const handoffId = await generateHandoffId(supabase);
    console.log(`[process-handoff] Generated handoff ID: ${handoffId}`);

    // Step 6: Insert handoff history record with full metadata
    const { data: historyRecord, error: insertError } = await supabase
      .from("handoff_history")
      .insert({
        user_id: user.id,
        organization_id: resolvedOrgId,
        handoff_id: handoffId,
        input_source_type: body.source_type || (body.attachment_path ? "file" : "text"),
        raw_content: body.raw_content,
        attachment_path: body.attachment_path,
        file_mime_type: body.file_mime_type,
        extracted_text: extractedText,
        task_matches: taskMatches,
        unmatched_items: unmatchedItems,
        match_count: taskMatches.length,
        extraction_confidence: taskMatches.length > 0
          ? taskMatches.reduce((sum, m) => sum + m.match_confidence, 0) / taskMatches.length
          : 0,
        processing_time_ms: Date.now() - startTime,
        status: "pending_review",
        // Source metadata for audit trail
        source_from: body.source_from,
        source_reference: body.source_reference,
        source_date: body.source_date,
        // Store full AI response for debugging
        ai_extraction: {
          model: "claude-sonnet-4-20250514",
          extracted_text_length: extractedText.length,
          tasks_evaluated: tasks?.length ?? 0,
          processing_time_ms: Date.now() - startTime,
        },
        // Initialize proposed_updates from task_matches
        proposed_updates: taskMatches.map((m) => ({
          task_id: m.task_id,
          task_number: m.task_number,
          proposed_status: m.proposed_status,
          proposed_notes: m.proposed_notes,
          confidence: m.match_confidence,
        })),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`History insert failed: ${insertError.message}`);
    }

    console.log(`[process-handoff] Created handoff history record: ${handoffId} (${historyRecord.id})`);

    // Step 7: Audit log with enhanced details
    await supabase.from("audit_log").insert({
      action: "handoff_processed",
      user_id: user.id,
      details: {
        handoff_id: handoffId,
        record_id: historyRecord.id,
        match_count: taskMatches.length,
        unmatched_count: unmatchedItems.length,
        has_attachment: !!body.attachment_path,
        source_type: body.source_type,
        source_from: body.source_from,
        processing_time_ms: Date.now() - startTime,
      },
    });

    const response: ProcessResponse = {
      success: true,
      handoff_id: handoffId, // Return human-readable ID
      extracted_text: extractedText,
      task_matches: taskMatches,
      unmatched_items: unmatchedItems,
      extraction_confidence: taskMatches.length > 0
        ? taskMatches.reduce((sum, m) => sum + m.match_confidence, 0) / taskMatches.length
        : 0,
      processing_time_ms: Date.now() - startTime,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[process-handoff] Error:", error);

    const response: ProcessResponse = {
      success: false,
      extracted_text: "",
      task_matches: [],
      unmatched_items: [],
      extraction_confidence: 0,
      processing_time_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

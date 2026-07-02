import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isPrivilegedOrAnonymousJwt } from "../_shared/auth.ts";
import { markFailed, markImported, markProcessing } from "../_shared/queue-status.ts";
import type { SamplingMatrixExtracted, SamplingMatrixRow } from "../_shared/sampling-matrix-parse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const IMPORT_ALLOWED_ROLES = ["admin", "environmental_manager", "site_manager", "executive"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyAuth(req: Request, supabase: SupabaseClient): Promise<{
  userId: string;
  organizationId: string;
  canImport: boolean;
} | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  if (isPrivilegedOrAnonymousJwt(token)) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id, role_assignments(roles(name))")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) return null;

  const roles: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const assignment of (profile as any).role_assignments ?? []) {
    if (assignment?.roles?.name) roles.push(String(assignment.roles.name).toLowerCase());
  }

  return {
    userId: user.id,
    organizationId: profile.organization_id,
    canImport: roles.some((role) => IMPORT_ALLOWED_ROLES.includes(role)),
  };
}

function isImportableRow(row: SamplingMatrixRow): row is SamplingMatrixRow & {
  permit_id: string;
  outfall_id: string;
  parameter_id: string;
  frequency_code: string;
} {
  return Boolean(row.permit_id && row.outfall_id && row.parameter_id && row.frequency_code);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await verifyAuth(req, supabase);
  if (!auth?.canImport) return jsonResponse({ success: false, error: "Unauthorized" }, 401);

  let queueId = "";
  try {
    const body = await req.json();
    queueId = body.queue_id;
    if (!queueId) return jsonResponse({ success: false, error: "queue_id required" }, 400);

    const { data: entry, error: fetchError } = await supabase
      .from("file_processing_queue")
      .select("*")
      .eq("id", queueId)
      .single();

    if (fetchError || !entry) {
      return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
    }
    if (entry.organization_id !== auth.organizationId) {
      return jsonResponse({ success: false, error: "Access denied" }, 403);
    }
    if (entry.status !== "parsed") {
      return jsonResponse({ success: false, error: "File must be parsed before import" }, 409);
    }

    const extracted = entry.extracted_data as SamplingMatrixExtracted | null;
    if (!extracted || extracted.document_type !== "sampling_matrix") {
      return jsonResponse({ success: false, error: "Missing sampling matrix extraction payload" }, 400);
    }

    await markProcessing(supabase, queueId);

    const importable = extracted.rows.filter(isImportableRow);
    if (importable.length === 0) {
      await supabase
        .from("file_processing_queue")
        .update({ status: "parsed", updated_at: new Date().toISOString() })
        .eq("id", queueId);
      return jsonResponse({
        success: false,
        error: "No importable rows — all rows unresolved against domain tables.",
        skipped_rows: extracted.summary.total_rows,
      }, 422);
    }

    const importBatchId = crypto.randomUUID();
    let schedulesUpserted = 0;
    let schedulesSkipped = 0;

    for (const row of importable) {
      const { error: upsertError } = await supabase
        .from("sampling_schedules")
        .upsert(
          {
            organization_id: auth.organizationId,
            permit_id: row.permit_id,
            outfall_id: row.outfall_id,
            parameter_id: row.parameter_id,
            frequency_code: row.frequency_code,
            frequency_description: row.frequency_description,
            sample_type: row.sample_type,
            period_type: row.period_type,
            instructions: row.instructions,
            is_active: true,
            source: "matrix_upload",
          },
          {
            onConflict: "organization_id,permit_id,outfall_id,parameter_id,frequency_code,sample_type,source",
            ignoreDuplicates: false,
          },
        );

      if (upsertError) {
        console.error("[import-sampling-matrix] upsert failed:", upsertError.message);
        schedulesSkipped += 1;
      } else {
        schedulesUpserted += 1;
      }
    }

    const importStats = {
      import_batch_id: importBatchId,
      schedules_upserted: schedulesUpserted,
      schedules_skipped: schedulesSkipped,
      rows_importable: importable.length,
      rows_total: extracted.summary.total_rows,
      draft_label: extracted.draft_label,
    };

    await markImported(supabase, queueId, importStats);

    return jsonResponse({
      success: true,
      import_id: importBatchId,
      schedules_upserted: schedulesUpserted,
      schedules_skipped: schedulesSkipped,
      rows_importable: importable.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (queueId) await markFailed(supabase, queueId, [message.slice(0, 800)]);
    return jsonResponse({ success: false, error: message.slice(0, 800) }, 500);
  }
});

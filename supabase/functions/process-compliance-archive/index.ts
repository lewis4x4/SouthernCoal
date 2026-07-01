import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivilegedOrAnonymousJwt } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("FRONTEND_URL") ?? (
  (Deno.env.get("SUPABASE_URL") ?? "").includes("localhost") ? "http://localhost:5173" : ""
);

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARCHIVE_CATEGORIES = new Set([
  "field_inspection",
  "quarterly_report",
  "audit_report",
  "enforcement",
]);

const PROCESS_ALLOWED_ROLES = ["admin", "environmental_manager", "site_manager", "executive"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyAuth(req: Request, supabase: SupabaseClient): Promise<{
  userId: string; organizationId: string; canProcess: boolean;
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
  for (const a of (profile as any).role_assignments ?? []) {
    if (a?.roles?.name) roles.push(String(a.roles.name).toLowerCase());
  }

  return {
    userId: user.id,
    organizationId: profile.organization_id,
    canProcess: roles.some((r) => PROCESS_ALLOWED_ROLES.includes(r)),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await verifyAuth(req, supabase);
  if (!auth?.canProcess) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  let body: { queue_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const queueId = body.queue_id;
  if (!queueId) return jsonResponse({ success: false, error: "queue_id required" }, 400);

  const { data: entry, error: fetchError } = await supabase
    .from("file_processing_queue")
    .select("id, file_name, file_category, status, organization_id, state_code, storage_bucket, storage_path")
    .eq("id", queueId)
    .single();

  if (fetchError || !entry) {
    return jsonResponse({ success: false, error: "Queue entry not found" }, 404);
  }

  if (entry.organization_id !== auth.organizationId) {
    return jsonResponse({ success: false, error: "Access denied" }, 403);
  }

  if (!ARCHIVE_CATEGORIES.has(entry.file_category)) {
    return jsonResponse({
      success: false,
      error: `Category '${entry.file_category}' is not an archive document category`,
    }, 400);
  }

  if (!["queued", "uploaded", "failed"].includes(entry.status)) {
    return jsonResponse({
      success: false,
      error: `Cannot process entry with status '${entry.status}'`,
    }, 409);
  }

  const now = new Date().toISOString();
  const extractedData = {
    document_type: "compliance_archive",
    archive_category: entry.file_category,
    file_name: entry.file_name,
    state: entry.state_code,
    storage_bucket: entry.storage_bucket,
    storage_path: entry.storage_path,
    indexed_at: now,
    summary: `Compliance archive document (${entry.file_category}) ready for search indexing.`,
  };

  const { error: updateError } = await supabase
    .from("file_processing_queue")
    .update({
      status: "parsed",
      extracted_data: extractedData,
      records_extracted: 0,
      processing_started_at: now,
      processing_completed_at: now,
      updated_at: now,
      error_log: null,
    })
    .eq("id", queueId);

  if (updateError) {
    return jsonResponse({ success: false, error: updateError.message }, 500);
  }

  await supabase.from("audit_log").insert({
    user_id: auth.userId,
    organization_id: auth.organizationId,
    action: "bulk_process",
    module: "upload_dashboard",
    table_name: "file_processing_queue",
    record_id: queueId,
    description: JSON.stringify({
      action_type: "compliance_archive_processed",
      file_name: entry.file_name,
      file_category: entry.file_category,
    }),
  });

  return jsonResponse({
    success: true,
    queue_id: queueId,
    document_type: "compliance_archive",
    status: "parsed",
  });
});

// =============================================================================
// report-status — Report Status Polling Edge Function for SCC CMS
// Returns job status + signed download URL for completed reports.
// Called by useReportGeneration.ts polling loop.
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ── Constants ────────────────────────────────────────────────────────────────
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
const ALLOWED_ORIGIN = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
const SIGNED_URL_EXPIRY = 3600; // 1 hour

// ── CORS (GET allowed for polling) ───────────────────────────────────────────
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Server misconfiguration" }, 503);
  }
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Authenticate
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const {
    data: { user },
    error: authError,
  } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // Get user's org
  const { data: profile } = await sb
    .from("user_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile) return json({ error: "User profile not found" }, 401);
  const userOrgId = profile.organization_id as string;

  // 2. Parse job_id from query string
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id");
  if (!jobId) return json({ error: "job_id query parameter required" }, 400);

  // 3. Fetch job (service role bypasses RLS)
  const { data: job, error: fetchError } = await sb
    .from("generated_reports")
    .select(
      `id, organization_id, status, format, file_path_csv, file_path_pdf,
       file_size_bytes, row_count, data_quality_flags, error_message,
       created_at, completed_at`,
    )
    .eq("id", jobId)
    .single();

  if (fetchError || !job) {
    return json({ error: "Report job not found" }, 404);
  }

  // 4. Verify org access (service role bypassed RLS, so manual check)
  if ((job.organization_id as string) !== userOrgId) {
    return json({ error: "Access denied" }, 403);
  }

  // 5. Build response
  const status = job.status as string;
  const response: Record<string, unknown> = {
    status,
    row_count: job.row_count,
    data_quality_flags: job.data_quality_flags,
    error_message: job.error_message,
    completed_at: job.completed_at,
  };

  // 6. Generate signed download URL for completed reports
  if (status === "complete") {
    const filePath =
      (job.file_path_csv as string) ?? (job.file_path_pdf as string);
    if (filePath) {
      const { data: signedData, error: signedError } = await sb.storage
        .from("generated-reports")
        .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

      if (signedError || !signedData?.signedUrl) {
        console.error(
          "[report-status] Signed URL error:",
          signedError?.message,
        );
        // Return status without URL — frontend can retry
        response.download_url = null;
        response.download_error = "Failed to generate download link";
      } else {
        response.download_url = signedData.signedUrl;
      }
    }
  }

  return json(response);
});

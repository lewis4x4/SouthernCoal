import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
/** SPA origin for deep links in transactional email (same secret as other Edge Functions). */
const _frontendEnv = Deno.env.get("FRONTEND_URL");
const FRONTEND_URL = (_frontendEnv ?? (
  (Deno.env.get("SUPABASE_URL") ?? "").includes("localhost") ? "http://localhost:5173" : ""
)).replace(/\/$/, "");

const TIER_LABELS: Record<string, string> = {
  tier_1: "Tier 1 Alert",
  tier_2: "Tier 2 Warning",
  tier_3: "TIER 3 CRITICAL",
};

interface RequestBody {
  obligation_id: string;
  obligation_name: string;
  days_late: number;
  penalty_tier: string;
  accrued_penalty: number;
  recipient_email: string;
}

/** Prevent HTML injection in email templates */
function escapeHtml(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_ROLES = ["admin", "environmental_manager", "executive"];

    const { data: roleRows, error: roleError } = await supabase
      .from("user_role_assignments")
      .select("roles(name)")
      .eq("user_id", user.id);

    if (roleError) {
      console.error("[send-deadline-alert] role lookup:", roleError.message);
      return new Response(JSON.stringify({ error: "Role lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roleNames: string[] = [];
    for (const row of roleRows ?? []) {
      const r = row.roles && typeof row.roles === "object" && "name" in row.roles
        ? String((row.roles as { name: string }).name)
        : "";
      if (r) roleNames.push(r);
    }

    const userRole = roleNames.find((n) => ALLOWED_ROLES.includes(n)) ?? null;
    if (!userRole) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: RequestBody;
    try {
      body = await req.json() as RequestBody;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      obligation_name,
      days_late,
      penalty_tier,
      accrued_penalty,
      recipient_email,
    } = body;

    if (!recipient_email || !obligation_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient_email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof days_late !== "number" || !Number.isFinite(days_late)) {
      return new Response(JSON.stringify({ error: "days_late must be a finite number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof accrued_penalty !== "number" || !Number.isFinite(accrued_penalty)) {
      return new Response(JSON.stringify({ error: "accrued_penalty must be a finite number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If Resend API key not configured, return gracefully
    if (!RESEND_API_KEY) {
      console.log("[send-deadline-alert] RESEND_API_KEY not set — skipping email");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "RESEND_API_KEY not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tierLabel = TIER_LABELS[penalty_tier] ?? "Alert";
    const subject = `[SCC Compliance] ${tierLabel}: ${obligation_name}`;
    const obligationsHref = `${FRONTEND_URL}/obligations`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #f1f5f9; border-radius: 12px; padding: 24px; border: 1px solid ${penalty_tier === 'tier_3' ? '#ef4444' : penalty_tier === 'tier_2' ? '#f97316' : '#eab308'}40;">
          <h2 style="margin: 0 0 16px; color: ${penalty_tier === 'tier_3' ? '#ef4444' : penalty_tier === 'tier_2' ? '#f97316' : '#eab308'};">
            ${escapeHtml(tierLabel)}
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Obligation</td>
              <td style="padding: 8px 0; color: #f1f5f9; font-weight: 600;">${escapeHtml(obligation_name)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Days Overdue</td>
              <td style="padding: 8px 0; color: #ef4444; font-weight: 700;">${escapeHtml(days_late)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Accrued Penalty</td>
              <td style="padding: 8px 0; color: #f97316; font-weight: 700;">$${escapeHtml(accrued_penalty.toLocaleString())}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Penalty Tier</td>
              <td style="padding: 8px 0; color: #f1f5f9;">${escapeHtml(tierLabel)}</td>
            </tr>
          </table>
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #334155;">
            <a href="${escapeHtml(obligationsHref)}" style="display: inline-block; padding: 10px 20px; background: #7c3aed; color: white; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
              View Obligations
            </a>
          </div>
        </div>
        <p style="font-size: 11px; color: #64748b; margin-top: 16px; line-height: 1.5;">
          Generated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS.
          Not legal or environmental consulting. All data and reports require independent
          verification by qualified personnel before regulatory submission.
        </p>
      </div>
    `;

    // Send via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SCC Compliance <compliance@scc-monitor.com>",
        to: [recipient_email],
        subject,
        html: htmlBody,
      }),
    });

    const resendText = await resendResponse.text();
    let resendData: { message?: string; id?: string } = {};
    try {
      resendData = resendText ? JSON.parse(resendText) as typeof resendData : {};
    } catch {
      resendData = { message: resendText.slice(0, 200) || "Non-JSON error body" };
    }

    if (!resendResponse.ok) {
      console.error("[send-deadline-alert] Resend error:", resendData);
      return new Response(
        JSON.stringify({ success: false, error: resendData.message ?? "Resend API error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, resend_id: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-deadline-alert] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

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

    // Verify user has appropriate role (admin, environmental_manager, or executive)
    const { data: roleData } = await supabase
      .from("user_role_assignments")
      .select("roles(name)")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const userRole = (
      roleData?.roles &&
      typeof roleData.roles === "object" &&
      "name" in roleData.roles
    )
      ? (roleData.roles as { name: string }).name
      : null;

    const ALLOWED_ROLES = ["admin", "environmental_manager", "executive"];
    if (!userRole || !ALLOWED_ROLES.includes(userRole)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
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

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #f1f5f9; border-radius: 12px; padding: 24px; border: 1px solid ${penalty_tier === 'tier_3' ? '#ef4444' : penalty_tier === 'tier_2' ? '#f97316' : '#eab308'}40;">
          <h2 style="margin: 0 0 16px; color: ${penalty_tier === 'tier_3' ? '#ef4444' : penalty_tier === 'tier_2' ? '#f97316' : '#eab308'};">
            ${tierLabel}
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Obligation</td>
              <td style="padding: 8px 0; color: #f1f5f9; font-weight: 600;">${obligation_name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Days Overdue</td>
              <td style="padding: 8px 0; color: #ef4444; font-weight: 700;">${days_late}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Accrued Penalty</td>
              <td style="padding: 8px 0; color: #f97316; font-weight: 700;">$${accrued_penalty.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Penalty Tier</td>
              <td style="padding: 8px 0; color: #f1f5f9;">${tierLabel}</td>
            </tr>
          </table>
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #334155;">
            <a href="${SUPABASE_URL.replace('.supabase.co', '')}/obligations" style="display: inline-block; padding: 10px 20px; background: #7c3aed; color: white; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
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

    const resendData = await resendResponse.json();

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

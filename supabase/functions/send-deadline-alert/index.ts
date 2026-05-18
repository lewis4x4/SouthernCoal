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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIER_LABELS: Record<string, string> = {
  tier_1: "Tier 1 Alert",
  tier_2: "Tier 2 Warning",
  tier_3: "TIER 3 CRITICAL",
};

interface RequestBody {
  obligation_id: string;
  /** Optional; must be an active user in the caller's organization. Defaults to caller email. */
  recipient_email?: string;
}

interface ObligationRow {
  id: string;
  description: string | null;
  title: string | null;
  days_at_risk: number;
  penalty_tier: string;
  accrued_penalty: number;
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("organization_id, email")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userOrgId = profile.organization_id as string;
    const callerEmail = (user.email ?? profile.email ?? "").trim();
    if (!callerEmail) {
      return new Response(JSON.stringify({ error: "Caller email not available" }), {
        status: 400,
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

    const obligationId = body.obligation_id?.trim();
    if (!obligationId || !UUID_RE.test(obligationId)) {
      return new Response(JSON.stringify({ error: "obligation_id must be a valid UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientEmail = (body.recipient_email?.trim() || callerEmail);
    if (!isValidEmail(recipientEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SYSTEM-WIDE: consent_decree_obligations has no organization_id (same as
    // generate-report rptConsentDecree). Org tenant gate deferred until column exists.
    const { data: obligation, error: obligationError } = await supabase
      .from("consent_decree_obligations")
      .select("id, description, title, days_at_risk, penalty_tier, accrued_penalty")
      .eq("id", obligationId)
      .maybeSingle();

    if (obligationError) {
      console.error("[send-deadline-alert] obligation lookup:", obligationError.message);
      return new Response(JSON.stringify({ error: "Obligation lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!obligation) {
      return new Response(JSON.stringify({ error: "Obligation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = obligation as ObligationRow;

    const normalizedRecipient = normalizeEmail(recipientEmail);
    const { data: orgRecipients, error: recipientError } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("organization_id", userOrgId)
      .eq("is_active", true);

    if (recipientError) {
      console.error("[send-deadline-alert] recipient lookup:", recipientError.message);
      return new Response(JSON.stringify({ error: "Recipient validation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedEmails = new Set(
      [callerEmail, ...(orgRecipients ?? []).map((r) => r.email as string)]
        .filter(Boolean)
        .map((email) => normalizeEmail(email)),
    );

    if (!allowedEmails.has(normalizedRecipient)) {
      return new Response(JSON.stringify({ error: "Recipient not allowed for this organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const obligationName = (row.description?.trim() || row.title?.trim() || "Unnamed obligation");
    const daysLate = Number(row.days_at_risk);
    const penaltyTier = String(row.penalty_tier ?? "none");
    const accruedPenalty = Number(row.accrued_penalty);

    if (!Number.isFinite(daysLate) || daysLate < 0) {
      return new Response(JSON.stringify({ error: "Invalid obligation days_at_risk" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Number.isFinite(accruedPenalty) || accruedPenalty < 0) {
      return new Response(JSON.stringify({ error: "Invalid obligation accrued_penalty" }), {
        status: 500,
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

    const tierLabel = TIER_LABELS[penaltyTier] ?? "Alert";
    const subject = `[SCC Compliance] ${tierLabel}: ${obligationName}`;
    const obligationsHref = `${FRONTEND_URL}/obligations`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a1a2e; color: #f1f5f9; border-radius: 12px; padding: 24px; border: 1px solid ${penaltyTier === 'tier_3' ? '#ef4444' : penaltyTier === 'tier_2' ? '#f97316' : '#eab308'}40;">
          <h2 style="margin: 0 0 16px; color: ${penaltyTier === 'tier_3' ? '#ef4444' : penaltyTier === 'tier_2' ? '#f97316' : '#eab308'};">
            ${escapeHtml(tierLabel)}
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Obligation</td>
              <td style="padding: 8px 0; color: #f1f5f9; font-weight: 600;">${escapeHtml(obligationName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Days Overdue</td>
              <td style="padding: 8px 0; color: #ef4444; font-weight: 700;">${escapeHtml(daysLate)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Accrued Penalty</td>
              <td style="padding: 8px 0; color: #f97316; font-weight: 700;">$${escapeHtml(accruedPenalty.toLocaleString())}</td>
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
        to: [recipientEmail],
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

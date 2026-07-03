import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isPrivilegedOrAnonymousJwt, verifyInternalSecret } from "../_shared/auth.ts";
import {
  evaluateComplianceAlert,
  tallySeverities,
} from "../_shared/compliance-alert-rules.ts";
import {
  buildComplianceAlertEmailHtml,
  parseOnCallSmsNumbers,
  sendResendEmail,
  sendTwilioSms,
} from "../_shared/notification-dispatch.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const _frontendEnv = Deno.env.get("FRONTEND_URL");
const FRONTEND_URL = (_frontendEnv ?? (
  (Deno.env.get("SUPABASE_URL") ?? "").includes("localhost") ? "http://localhost:5173" : ""
)).replace(/\/$/, "");

const ALERT_ROLES = [
  "admin",
  "executive",
  "environmental_manager",
  "compliance_reviewer",
  "coo",
];

interface RequestBody {
  organization_id: string;
  source?: string;
  inserted?: number;
  sync_log_id?: string | null;
  dry_run?: boolean;
  force_digest?: boolean;
}

interface Recipient {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

async function validateAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<{ ok: boolean; userId: string | null; privileged: boolean }> {
  if (verifyInternalSecret(req)) {
    return { ok: true, userId: null, privileged: true };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, userId: null, privileged: false };

  const token = authHeader.replace("Bearer ", "").trim();
  if (isPrivilegedOrAnonymousJwt(token)) return { ok: false, userId: null, privileged: false };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { ok: false, userId: null, privileged: false };

  const { data: roles } = await supabase
    .from("user_role_assignments")
    .select("roles(name)")
    .eq("user_id", user.id);

  const names: string[] = [];
  for (const row of roles ?? []) {
    const r = row.roles && typeof row.roles === "object" && "name" in row.roles
      ? String((row.roles as { name: string }).name)
      : "";
    if (r) names.push(r);
  }

  const allowed = ["admin", "executive", "environmental_manager"];
  if (!names.some((n) => allowed.includes(n))) return { ok: false, userId: null, privileged: false };

  return { ok: true, userId: user.id, privileged: false };
}

async function resolveTargetOrgId(
  supabase: ReturnType<typeof createClient>,
  auth: { userId: string | null; privileged: boolean },
  bodyOrgId: string,
): Promise<{ ok: true; orgId: string } | { ok: false; status: number; message: string }> {
  if (auth.privileged) {
    return { ok: true, orgId: bodyOrgId };
  }
  if (!auth.userId) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", auth.userId)
    .single();
  if (!profile?.organization_id) {
    return { ok: false, status: 401, message: "User profile not found" };
  }
  if (profile.organization_id !== bodyOrgId) {
    return { ok: false, status: 403, message: "organization_id does not match caller" };
  }
  return { ok: true, orgId: bodyOrgId };
}

async function isRateLimited(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  eventType: string,
  minutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("organization_id", orgId)
    .eq("event_type", eventType)
    .not("email_sent_at", "is", null)
    .gte("email_sent_at", since)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await validateAuth(req, supabase);

  if (!auth.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
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

  const orgId = body.organization_id?.trim();
  if (!orgId) {
    return new Response(JSON.stringify({ error: "organization_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orgResolution = await resolveTargetOrgId(supabase, auth, orgId);
  if (!orgResolution.ok) {
    return new Response(JSON.stringify({ error: orgResolution.message }), {
      status: orgResolution.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sinceRecent = new Date(Date.now() - 10 * 60_000).toISOString();

  const [{ data: pendingRows }, { data: recentRows }] = await Promise.all([
    supabase
      .from("discrepancy_reviews")
      .select("severity")
      .eq("organization_id", orgId)
      .eq("status", "pending"),
    supabase
      .from("discrepancy_reviews")
      .select("severity")
      .eq("organization_id", orgId)
      .gte("detected_at", sinceRecent),
  ]);

  const pending = tallySeverities(pendingRows ?? []);
  const recentlyDetected = tallySeverities(recentRows ?? []);

  const decision = evaluateComplianceAlert(pending, recentlyDetected, {
    forceDigest: body.force_digest === true,
  });

  if (!decision) {
    return new Response(
      JSON.stringify({
        success: true,
        skipped: true,
        reason: "no_alert_rules_matched",
        pending,
        recentlyDetected,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (await isRateLimited(supabase, orgId, decision.eventType, decision.rateLimitMinutes)) {
    return new Response(
      JSON.stringify({
        success: true,
        skipped: true,
        reason: "rate_limited",
        eventType: decision.eventType,
        rateLimitMinutes: decision.rateLimitMinutes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: roleRows } = await supabase
    .from("user_role_assignments")
    .select("user_id, roles(name)");

  const recipientIds = new Set<string>();
  for (const row of roleRows ?? []) {
    const name = row.roles && typeof row.roles === "object" && "name" in row.roles
      ? String((row.roles as { name: string }).name)
      : "";
    if (ALERT_ROLES.includes(name)) recipientIds.add(row.user_id as string);
  }

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, email, first_name, last_name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .in("id", [...recipientIds]);

  const recipients = (profiles ?? []) as Recipient[];

  if (body.dry_run) {
    return new Response(
      JSON.stringify({
        success: true,
        dryRun: true,
        decision,
        recipientCount: recipients.length,
        recipients: recipients.map((r) => r.email),
        pending,
        recentlyDetected,
        smsOnCall: decision.smsOnCall ? parseOnCallSmsNumbers() : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const reviewQueueHref = `${FRONTEND_URL}/compliance/review-queue`;
  const subject = `[SCC Compliance] ${decision.title}`;
  const html = buildComplianceAlertEmailHtml({
    title: decision.title,
    body: decision.body,
    reviewQueueHref,
  });

  let notificationsCreated = 0;
  let emailsSent = 0;
  let smsSent = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const { data: notificationId, error: rpcErr } = await supabase.rpc(
      "send_notification",
      {
        p_recipient_id: recipient.id,
        p_event_type: decision.eventType,
        p_title: decision.title,
        p_body: decision.body,
        p_priority: decision.priority,
        p_entity_type: "discrepancy_reviews",
        p_entity_id: null,
        p_metadata: {
          source: body.source ?? "echo",
          sync_log_id: body.sync_log_id ?? null,
          pending,
          recently_detected: recentlyDetected,
          inserted: body.inserted ?? null,
        },
      },
    );

    if (rpcErr || !notificationId) {
      errors.push(`notify ${recipient.email}: ${rpcErr?.message ?? "no id"}`);
      continue;
    }

    notificationsCreated++;

    const { data: notifRow } = await supabase
      .from("notifications")
      .select("channels")
      .eq("id", notificationId)
      .single();

    const channels = (notifRow?.channels ?? ["in_app"]) as string[];
    if (channels.includes("email") && recipient.email) {
      const emailResult = await sendResendEmail({
        to: recipient.email,
        subject,
        html,
      });

      if (emailResult.ok && !emailResult.skipped) {
        emailsSent++;
        await supabase
          .from("notifications")
          .update({ email_sent_at: new Date().toISOString(), email_error: null })
          .eq("id", notificationId);
      } else if (!emailResult.ok) {
        errors.push(`email ${recipient.email}: ${emailResult.error}`);
        await supabase
          .from("notifications")
          .update({ email_error: emailResult.error ?? "send failed" })
          .eq("id", notificationId);
      }
    }

  }

  if (decision.smsOnCall) {
    const onCall = parseOnCallSmsNumbers();
    const smsBody =
      `[SCC] ${decision.title}. Pending: ${pending.critical}c/${pending.high}h/${pending.medium}m. ${reviewQueueHref}`;
    for (const phone of onCall) {
      const smsResult = await sendTwilioSms({ to: phone, body: smsBody });
      if (smsResult.ok && !smsResult.skipped) {
        smsSent++;
        break;
      } else if (!smsResult.ok && !smsResult.skipped) {
        errors.push(`sms ${phone}: ${smsResult.error}`);
      }
    }
  }

  await supabase.from("audit_log").insert({
    user_id: auth.userId,
    organization_id: orgId,
    action: "compliance_alert_dispatched",
    module: "external_data",
    table_name: "notifications",
    description: JSON.stringify({
      event_type: decision.eventType,
      priority: decision.priority,
      notifications_created: notificationsCreated,
      emails_sent: emailsSent,
      sms_sent: smsSent,
      errors: errors.length,
      source: body.source,
      sync_log_id: body.sync_log_id,
    }),
  });

  console.log(
    `[dispatch-compliance-alerts] ${decision.eventType} → ${notificationsCreated} notifications, ${emailsSent} emails, ${smsSent} sms`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      decision: {
        eventType: decision.eventType,
        priority: decision.priority,
        title: decision.title,
      },
      notificationsCreated,
      emailsSent,
      smsSent,
      errors: errors.length > 0 ? errors : undefined,
      pending,
      recentlyDetected,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

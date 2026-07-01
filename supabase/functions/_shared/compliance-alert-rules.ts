/** Severity tallies for discrepancy alert evaluation. */
export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export type NotificationPriorityLevel = "info" | "warning" | "urgent" | "critical" | "emergency";

export interface ComplianceAlertDecision {
  eventType: "discrepancy_detected" | "discrepancy_digest";
  priority: NotificationPriorityLevel;
  title: string;
  body: string;
  /** Minimum minutes between duplicate emails for this event type (per org). */
  rateLimitMinutes: number;
  /** Send SMS to org on-call list (COMPLIANCE_ALERT_SMS_TO). */
  smsOnCall: boolean;
}

export function emptySeverityCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

export function tallySeverities(rows: { severity: string }[]): SeverityCounts {
  const counts = emptySeverityCounts();
  for (const row of rows) {
    const s = row.severity?.toLowerCase();
    if (s === "critical") counts.critical++;
    else if (s === "high") counts.high++;
    else if (s === "medium") counts.medium++;
    else if (s === "low") counts.low++;
  }
  return counts;
}

const MEDIUM_DIGEST_THRESHOLD = 25;

/**
 * Decide whether to send a compliance alert and at what priority.
 * Returns null when no alert should fire.
 */
export function evaluateComplianceAlert(
  pending: SeverityCounts,
  recentlyDetected: SeverityCounts,
  options?: { forceDigest?: boolean },
): ComplianceAlertDecision | null {
  const pendingTotal = pending.critical + pending.high + pending.medium + pending.low;
  const newTotal =
    recentlyDetected.critical +
    recentlyDetected.high +
    recentlyDetected.medium +
    recentlyDetected.low;

  if (pending.critical > 0 || recentlyDetected.critical > 0) {
    return {
      eventType: "discrepancy_detected",
      priority: "critical",
      title: `Critical ECHO discrepancies (${pending.critical} pending)`,
      body: buildBody(pending, recentlyDetected, "Immediate triage required for SNC / critical status mismatches."),
      rateLimitMinutes: 60,
      smsOnCall: true,
    };
  }

  if (pending.high > 0 || recentlyDetected.high > 0) {
    return {
      eventType: "discrepancy_detected",
      priority: "urgent",
      title: `High-severity ECHO discrepancies (${pending.high} pending)`,
      body: buildBody(pending, recentlyDetected, "Review missing violations and material DMR mismatches."),
      rateLimitMinutes: 60,
      smsOnCall: false,
    };
  }

  if (options?.forceDigest || pending.medium >= MEDIUM_DIGEST_THRESHOLD) {
    return {
      eventType: "discrepancy_digest",
      priority: "warning",
      title: `ECHO discrepancy digest (${pendingTotal} pending)`,
      body: buildBody(
        pending,
        recentlyDetected,
        `${pending.medium} medium-severity items in queue — batch triage recommended.`,
      ),
      rateLimitMinutes: 24 * 60,
      smsOnCall: false,
    };
  }

  if (newTotal >= 50) {
    return {
      eventType: "discrepancy_detected",
      priority: "warning",
      title: `Large ECHO detection batch (${newTotal} new)`,
      body: buildBody(pending, recentlyDetected, "New discrepancies were added from the latest detection run."),
      rateLimitMinutes: 360,
      smsOnCall: false,
    };
  }

  return null;
}

function buildBody(pending: SeverityCounts, recent: SeverityCounts, note: string): string {
  const lines = [
    note,
    "",
    `Pending: ${pending.critical} critical, ${pending.high} high, ${pending.medium} medium, ${pending.low} low`,
    `New (last 10 min): ${recent.critical} critical, ${recent.high} high, ${recent.medium} medium, ${recent.low} low`,
  ];
  return lines.join("\n");
}

export interface ExceedanceSeverityCounts {
  critical: number;
  major: number;
  moderate: number;
  minor: number;
}

export type ExceedanceNotificationPriority = "info" | "warning" | "urgent" | "critical" | "emergency";

export interface ExceedanceAlertDecision {
  eventType: "exceedance_detected" | "exceedance_digest";
  priority: ExceedanceNotificationPriority;
  title: string;
  body: string;
  rateLimitMinutes: number;
  smsOnCall: boolean;
}

export function emptyExceedanceCounts(): ExceedanceSeverityCounts {
  return { critical: 0, major: 0, moderate: 0, minor: 0 };
}

export function tallyExceedanceSeverities(
  rows: { severity: string }[],
): ExceedanceSeverityCounts {
  const counts = emptyExceedanceCounts();
  for (const row of rows) {
    const s = row.severity?.toLowerCase();
    if (s === "critical") counts.critical++;
    else if (s === "major") counts.major++;
    else if (s === "moderate") counts.moderate++;
    else if (s === "minor") counts.minor++;
  }
  return counts;
}

const MODERATE_DIGEST_THRESHOLD = 10;

export function evaluateExceedanceAlert(
  open: ExceedanceSeverityCounts,
  recentlyDetected: ExceedanceSeverityCounts,
  options?: { forceDigest?: boolean },
): ExceedanceAlertDecision | null {
  if (open.critical > 0 || recentlyDetected.critical > 0) {
    return {
      eventType: "exceedance_detected",
      priority: "critical",
      title: `Critical permit exceedance (${open.critical} open)`,
      body: buildBody(open, recentlyDetected, "Immediate review required — verify lab result and 24-hour notification obligations."),
      rateLimitMinutes: 60,
      smsOnCall: true,
    };
  }

  if (open.major > 0 || recentlyDetected.major > 0) {
    return {
      eventType: "exceedance_detected",
      priority: "urgent",
      title: `Major permit exceedance (${open.major} open)`,
      body: buildBody(open, recentlyDetected, "Review exceedance details and initiate corrective action if needed."),
      rateLimitMinutes: 60,
      smsOnCall: false,
    };
  }

  if (options?.forceDigest || open.moderate >= MODERATE_DIGEST_THRESHOLD) {
    const total = open.critical + open.major + open.moderate + open.minor;
    return {
      eventType: "exceedance_digest",
      priority: "warning",
      title: `Exceedance digest (${total} open)`,
      body: buildBody(open, recentlyDetected, `${open.moderate} moderate exceedances open — batch review on Monitoring dashboard.`),
      rateLimitMinutes: 24 * 60,
      smsOnCall: false,
    };
  }

  const newTotal =
    recentlyDetected.critical + recentlyDetected.major +
    recentlyDetected.moderate + recentlyDetected.minor;

  if (newTotal >= 20) {
    return {
      eventType: "exceedance_detected",
      priority: "warning",
      title: `Lab import exceedances (${newTotal} new)`,
      body: buildBody(open, recentlyDetected, "New exceedances detected from recent lab data import."),
      rateLimitMinutes: 360,
      smsOnCall: false,
    };
  }

  return null;
}

function buildBody(
  open: ExceedanceSeverityCounts,
  recent: ExceedanceSeverityCounts,
  note: string,
): string {
  return [
    note,
    "",
    `Open: ${open.critical} critical, ${open.major} major, ${open.moderate} moderate, ${open.minor} minor`,
    `New (last hour): ${recent.critical} critical, ${recent.major} major, ${recent.moderate} moderate, ${recent.minor} minor`,
  ].join("\n");
}

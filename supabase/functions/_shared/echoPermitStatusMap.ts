/** Map ECHO facility permit_status labels to internal npdes_permits.status values. */

export function mapEchoPermitStatusToInternal(echoStatus: string): string | null {
  const normalized = echoStatus.toLowerCase().trim();
  if (!normalized) return null;
  if (normalized.includes("terminated")) return "terminated";
  if (normalized.includes("expired")) return "expired";
  if (normalized.includes("admin continued")) return "administratively_continued";
  if (normalized.includes("effective")) return "active";
  if (normalized.includes("pending renewal") || normalized.includes("pending_renewal")) {
    return "pending_renewal";
  }
  if (normalized.includes("revoked")) return "revoked";
  if (normalized === "active") return "active";
  if (normalized === "draft") return "draft";
  return null;
}

export function normalizedPermitStatusForCompare(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "";
  return mapEchoPermitStatusToInternal(raw) ?? raw.toLowerCase();
}

export function permitStatusesSemanticallyMatch(
  internalStatus: string | null | undefined,
  echoStatus: string | null | undefined,
): boolean {
  const internal = normalizedPermitStatusForCompare(internalStatus);
  const external = normalizedPermitStatusForCompare(echoStatus);
  if (!internal || !external) return false;
  return internal === external;
}

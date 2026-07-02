/** Allowed values on `npdes_permits.status` (CMS check constraint). */
export const NPDES_PERMIT_STATUSES = [
  'active',
  'expired',
  'administratively_continued',
  'pending_renewal',
  'terminated',
  'revoked',
  'draft',
] as const;

export type NpdesPermitStatus = (typeof NPDES_PERMIT_STATUSES)[number];

/**
 * Map ECHO facility permit_status labels to internal npdes_permits.status values.
 * Returns null when the label is unrecognized — operator must dismiss manually.
 */
export function mapEchoPermitStatusToInternal(echoStatus: string): NpdesPermitStatus | null {
  const normalized = echoStatus.toLowerCase().trim();
  if (!normalized) return null;
  if (normalized.includes('terminated')) return 'terminated';
  if (normalized.includes('expired')) return 'expired';
  if (normalized.includes('admin continued')) return 'administratively_continued';
  if (normalized.includes('effective')) return 'active';
  if (normalized.includes('pending renewal') || normalized.includes('pending_renewal')) {
    return 'pending_renewal';
  }
  if (normalized.includes('revoked')) return 'revoked';
  if (normalized === 'active') return 'active';
  if (normalized === 'draft') return 'draft';
  return null;
}

export function statusMismatchNeedsInternalUpdate(
  internalStatus: string | null | undefined,
  echoStatus: string | null | undefined,
): boolean {
  const mapped = echoStatus ? mapEchoPermitStatusToInternal(echoStatus) : null;
  if (!mapped) return false;
  const internal = (internalStatus ?? '').toLowerCase().trim();
  return mapped !== internal;
}

export function formatNpdesPermitStatusLabel(status: NpdesPermitStatus): string {
  return status.replace(/_/g, ' ');
}

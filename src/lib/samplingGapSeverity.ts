export type SamplingGapKind = 'at_risk' | 'missed';

export type SamplingGapSeverity = 'low' | 'medium' | 'high' | 'critical';

export function computeSamplingGapSeverity(
  gapKind: SamplingGapKind,
  daysLate: number,
  daysUntilDue: number,
): SamplingGapSeverity {
  if (gapKind === 'missed') {
    if (daysLate >= 30) return 'critical';
    if (daysLate >= 14) return 'high';
    if (daysLate >= 7) return 'medium';
    return 'low';
  }

  if (daysUntilDue <= 1) return 'medium';
  return 'low';
}

export const GAP_KIND_LABELS: Record<SamplingGapKind, string> = {
  at_risk: 'At-Risk',
  missed: 'Missed',
};

export const GAP_REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  disputed: 'Disputed',
  force_majeure: 'Force Majeure',
  resolved: 'Resolved',
};

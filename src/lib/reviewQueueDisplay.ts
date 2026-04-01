import type { UserProfile } from '@/types/auth';

export function selfReviewDisplayNameFromProfile(profile: UserProfile | null): string {
  const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  return full || profile?.email?.trim() || '';
}

/** Human-readable label for discrepancy_reviews.reviewed_by (audit / triage UI). */
export function formatDiscrepancyReviewerLabel(
  reviewedBy: string | null | undefined,
  currentUserId: string | null | undefined,
  selfDisplayName: string,
): string {
  if (!reviewedBy) return '—';
  if (currentUserId && reviewedBy === currentUserId) {
    return selfDisplayName.trim() || 'You';
  }
  return `User ${reviewedBy.slice(0, 8)}…`;
}

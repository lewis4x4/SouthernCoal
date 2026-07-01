import type { UserProfile } from '@/types/auth';

export function displayNameFromProfileFields(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const full = [firstName, lastName].filter(Boolean).join(' ').trim();
  return full || email?.trim() || '';
}

export function selfReviewDisplayNameFromProfile(profile: UserProfile | null): string {
  return displayNameFromProfileFields(profile?.first_name, profile?.last_name, profile?.email);
}

/** Human-readable label for discrepancy_reviews.reviewed_by (audit / triage UI). */
export function formatDiscrepancyReviewerLabel(
  reviewedBy: string | null | undefined,
  currentUserId: string | null | undefined,
  selfDisplayName: string,
  nameByUserId?: Record<string, string>,
): string {
  if (!reviewedBy) return '—';
  if (currentUserId && reviewedBy === currentUserId) {
    return selfDisplayName.trim() || 'You';
  }
  const resolved = nameByUserId?.[reviewedBy]?.trim();
  if (resolved) return resolved;
  return `User ${reviewedBy.slice(0, 8)}…`;
}

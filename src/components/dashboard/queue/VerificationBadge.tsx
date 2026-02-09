import { cn } from '@/lib/cn';
import type { VerificationStatus } from '@/stores/verification';

interface VerificationBadgeProps {
  status: VerificationStatus;
}

const BADGE_STYLES: Record<VerificationStatus, string> = {
  unreviewed:
    'bg-verification-unreviewed/15 text-verification-unreviewed border-verification-unreviewed/20',
  in_review:
    'bg-verification-in_review/15 text-verification-in_review border-verification-in_review/20',
  verified:
    'bg-verification-verified/15 text-verification-verified border-verification-verified/20',
  disputed:
    'bg-verification-disputed/15 text-verification-disputed border-verification-disputed/20',
};

const LABELS: Record<VerificationStatus, string> = {
  unreviewed: 'Unreviewed',
  in_review: 'In Review',
  verified: 'Verified',
  disputed: 'Disputed',
};

/**
 * AI Extraction Trust Layer badge.
 * Purple unreviewed, yellow in_review, green verified, red disputed.
 */
export function VerificationBadge({ status }: VerificationBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border backdrop-blur-sm',
        BADGE_STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}

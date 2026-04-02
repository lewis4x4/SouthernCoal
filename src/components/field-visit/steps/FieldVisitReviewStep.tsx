import type { ReactNode } from 'react';

interface FieldVisitReviewStepProps {
  summaryCards: ReactNode;
  completionLocation: ReactNode;
  checklist: ReactNode;
  reviewHooks?: ReactNode;
  governanceIssues?: ReactNode;
  lockedBanner?: ReactNode;
  forceMajeureBanner?: ReactNode;
}

export function FieldVisitReviewStep({
  summaryCards,
  completionLocation,
  checklist,
  reviewHooks,
  governanceIssues,
  lockedBanner,
  forceMajeureBanner,
}: FieldVisitReviewStepProps) {
  return (
    <div className="space-y-4">
      {summaryCards}
      {completionLocation}
      {forceMajeureBanner}
      {checklist}
      {reviewHooks}
      {governanceIssues}
      {lockedBanner}
    </div>
  );
}

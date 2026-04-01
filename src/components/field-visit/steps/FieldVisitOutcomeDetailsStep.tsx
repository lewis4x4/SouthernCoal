import type { ReactNode } from 'react';
import type { FieldVisitOutcome } from '@/types';
import { FieldVisitOutcomePanel } from '@/components/field-visit/FieldVisitOutcomePanel';

interface FieldVisitOutcomeDetailsStepProps {
  outcome: FieldVisitOutcome;
  totalPhotoCount: number;
  pendingPhotoCount: number;
  syncedPhotoCount: number;
  isOnline: boolean;
  requirementsCard: ReactNode;
  lastContextCard: ReactNode;
  qaPrompts?: ReactNode;
  safetyActions?: ReactNode;
  outcomeContent: ReactNode;
  notesContent: ReactNode;
}

export function FieldVisitOutcomeDetailsStep({
  outcome,
  totalPhotoCount,
  pendingPhotoCount,
  syncedPhotoCount,
  isOnline,
  requirementsCard,
  lastContextCard,
  qaPrompts,
  safetyActions,
  outcomeContent,
  notesContent,
}: FieldVisitOutcomeDetailsStepProps) {
  return (
    <div className="space-y-5">
      {safetyActions}
      {qaPrompts}
      <FieldVisitOutcomePanel
        outcome={outcome}
        totalPhotoCount={totalPhotoCount}
        pendingPhotoCount={pendingPhotoCount}
        syncedPhotoCount={syncedPhotoCount}
        isOnline={isOnline}
        content={
          <div className="space-y-5">
            {requirementsCard}
            {lastContextCard}
            {outcomeContent}
          </div>
        }
        notes={notesContent}
      />
    </div>
  );
}

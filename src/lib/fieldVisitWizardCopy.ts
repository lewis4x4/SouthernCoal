import type { FieldVisitWizardStepId } from '@/lib/fieldVisitWizard';

export const FIELD_VISIT_WIZARD_COPY: Record<
  FieldVisitWizardStepId,
  {
    primaryActionLabel: string;
  }
> = {
  start_visit: {
    primaryActionLabel: 'Start visit',
  },
  inspection: {
    primaryActionLabel: 'Continue',
  },
  outcome_details: {
    primaryActionLabel: 'Continue to evidence',
  },
  evidence: {
    primaryActionLabel: 'Continue to review',
  },
  review_complete: {
    primaryActionLabel: 'Complete visit',
  },
};

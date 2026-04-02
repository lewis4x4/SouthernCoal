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
    primaryActionLabel: 'Save inspection & continue',
  },
  choose_outcome: {
    primaryActionLabel: 'Continue to outcome details',
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

export type FieldVisitWizardStepId =
  | 'start_visit'
  | 'inspection'
  | 'choose_outcome'
  | 'outcome_details'
  | 'evidence'
  | 'review_complete';

export interface FieldVisitWizardStepDefinition {
  id: FieldVisitWizardStepId;
  label: string;
  description: string;
}

export const FIELD_VISIT_WIZARD_STEPS: FieldVisitWizardStepDefinition[] = [
  {
    id: 'start_visit',
    label: 'Start Visit',
    description: 'Open the stop, capture start GPS, and anchor the visit context.',
  },
  {
    id: 'inspection',
    label: 'Outlet Inspection',
    description: 'Record outlet conditions before you decide the operational path.',
  },
  {
    id: 'choose_outcome',
    label: 'Choose Outcome',
    description: 'Pick the path that matches what actually happened at the stop.',
  },
  {
    id: 'outcome_details',
    label: 'Outcome Details',
    description: 'Capture only the fields and prompts required for the selected outcome.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    description: 'Attach structured evidence without mixing it into every other task.',
  },
  {
    id: 'review_complete',
    label: 'Review & Complete',
    description: 'Check what is ready, what is missing, and finalize with confidence.',
  },
];

function stepIndex(stepId: FieldVisitWizardStepId) {
  return FIELD_VISIT_WIZARD_STEPS.findIndex((step) => step.id === stepId);
}

export function getFieldVisitWizardStep(stepId: FieldVisitWizardStepId): FieldVisitWizardStepDefinition {
  return FIELD_VISIT_WIZARD_STEPS.find((step) => step.id === stepId) ?? FIELD_VISIT_WIZARD_STEPS[0]!;
}

export function getNextFieldVisitWizardStep(stepId: FieldVisitWizardStepId): FieldVisitWizardStepId | null {
  const index = stepIndex(stepId);
  return FIELD_VISIT_WIZARD_STEPS[index + 1]?.id ?? null;
}

export function getPreviousFieldVisitWizardStep(stepId: FieldVisitWizardStepId): FieldVisitWizardStepId | null {
  const index = stepIndex(stepId);
  return FIELD_VISIT_WIZARD_STEPS[index - 1]?.id ?? null;
}

export function compareFieldVisitWizardSteps(
  left: FieldVisitWizardStepId,
  right: FieldVisitWizardStepId,
) {
  return stepIndex(left) - stepIndex(right);
}

function wizardStorageKey(visitId: string) {
  return `field-visit-wizard-step:${visitId}`;
}

export function readStoredFieldVisitWizardStep(
  visitId: string,
): FieldVisitWizardStepId | null {
  try {
    const raw = sessionStorage.getItem(wizardStorageKey(visitId));
    return FIELD_VISIT_WIZARD_STEPS.some((step) => step.id === raw)
      ? (raw as FieldVisitWizardStepId)
      : null;
  } catch {
    return null;
  }
}

export function persistFieldVisitWizardStep(
  visitId: string,
  stepId: FieldVisitWizardStepId,
) {
  try {
    sessionStorage.setItem(wizardStorageKey(visitId), stepId);
  } catch {
    /* non-critical */
  }
}

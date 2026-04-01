import type { FieldVisitWizardStepId } from '@/lib/fieldVisitWizard';
import {
  FIELD_VISIT_WIZARD_STEPS,
  compareFieldVisitWizardSteps,
} from '@/lib/fieldVisitWizard';

export interface FieldVisitWizardGuardState {
  visitStarted: boolean;
  inspectionReady: boolean;
  outcomeSelected: boolean;
  outcomeDetailsReady: boolean;
  evidenceReady: boolean;
  startBlockerMessage: string;
  inspectionBlockerMessage: string;
  outcomeBlockerMessage: string;
  outcomeDetailsBlockerMessage: string;
  evidenceBlockerMessage: string;
}

const STEP_DONE_ORDER: Record<FieldVisitWizardStepId, keyof FieldVisitWizardGuardState | null> = {
  start_visit: 'visitStarted',
  inspection: 'inspectionReady',
  choose_outcome: 'outcomeSelected',
  outcome_details: 'outcomeDetailsReady',
  evidence: 'evidenceReady',
  review_complete: null,
};

function blockerMessage(stepId: FieldVisitWizardStepId, state: FieldVisitWizardGuardState) {
  switch (stepId) {
    case 'start_visit':
      return state.startBlockerMessage;
    case 'inspection':
      return state.inspectionBlockerMessage;
    case 'choose_outcome':
      return state.outcomeBlockerMessage;
    case 'outcome_details':
      return state.outcomeDetailsBlockerMessage;
    case 'evidence':
      return state.evidenceBlockerMessage;
    default:
      return 'Complete the current step before moving forward.';
  }
}

export function getFieldVisitWizardRecommendedStep(
  state: FieldVisitWizardGuardState,
): FieldVisitWizardStepId {
  if (!state.visitStarted) return 'start_visit';
  if (!state.inspectionReady) return 'inspection';
  if (!state.outcomeSelected) return 'choose_outcome';
  if (!state.outcomeDetailsReady) return 'outcome_details';
  if (!state.evidenceReady) return 'evidence';
  return 'review_complete';
}

export function isFieldVisitWizardStepComplete(
  stepId: FieldVisitWizardStepId,
  state: FieldVisitWizardGuardState,
) {
  const key = STEP_DONE_ORDER[stepId];
  return key == null ? false : Boolean(state[key]);
}

export function validateFieldVisitWizardStepAccess(input: {
  currentStep: FieldVisitWizardStepId;
  targetStep: FieldVisitWizardStepId;
  state: FieldVisitWizardGuardState;
}): { ok: true } | { ok: false; message: string; blockedStep: FieldVisitWizardStepId } {
  if (compareFieldVisitWizardSteps(input.targetStep, input.currentStep) <= 0) {
    return { ok: true };
  }

  for (const step of FIELD_VISIT_WIZARD_STEPS) {
    if (compareFieldVisitWizardSteps(step.id, input.targetStep) >= 0) break;
    if (!isFieldVisitWizardStepComplete(step.id, input.state)) {
      return {
        ok: false,
        message: blockerMessage(step.id, input.state),
        blockedStep: step.id,
      };
    }
  }

  return { ok: true };
}

export function validateFieldVisitWizardAdvanceStep(
  stepId: FieldVisitWizardStepId,
  state: FieldVisitWizardGuardState,
): { ok: true } | { ok: false; message: string } {
  if (stepId === 'review_complete') return { ok: true };
  if (isFieldVisitWizardStepComplete(stepId, state)) return { ok: true };
  return { ok: false, message: blockerMessage(stepId, state) };
}

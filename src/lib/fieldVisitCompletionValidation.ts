import type { FieldVisitOutcome } from '@/types';
import { FIELD_VISIT_COPY } from '@/lib/fieldVisitValidationCopy';

/**
 * Pure validation for field visit start + completion (Lane A Milestone 1 — A2, A3).
 * Keeps rules testable without mounting FieldVisitPage.
 */
export interface FieldVisitCompletionValidationInput {
  completeLatitude: number;
  completeLongitude: number;
  inspectionFlowStatus: string | null | undefined;
  outletInspectionObstructed: boolean;
  inspectionObstructionDetailsTrimmed: string;
  outcome: FieldVisitOutcome;
  cocContainerIdTrimmed: string;
  cocPreservativeConfirmed: boolean;
  totalPhotoCount: number;
  noDischargeNarrativeTrimmed: string;
  noDischargeObstructionObserved: boolean;
  noDischargeObstructionDetailsTrimmed: string;
  accessIssueNarrativeTrimmed: string;
}

export type FieldVisitCompletionValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Start visit requires finite latitude/longitude (A3). */
export function validateFieldVisitStartCoordinates(
  latitude: number,
  longitude: number,
): FieldVisitCompletionValidationResult {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, message: FIELD_VISIT_COPY.startGpsRequired };
  }
  return { ok: true };
}

export function validateFieldVisitCompletion(
  input: FieldVisitCompletionValidationInput,
): FieldVisitCompletionValidationResult {
  const {
    completeLatitude: lat,
    completeLongitude: lng,
    inspectionFlowStatus,
    outletInspectionObstructed,
    inspectionObstructionDetailsTrimmed,
    outcome,
    cocContainerIdTrimmed,
    cocPreservativeConfirmed,
    totalPhotoCount,
    noDischargeNarrativeTrimmed,
    noDischargeObstructionObserved,
    noDischargeObstructionDetailsTrimmed,
    accessIssueNarrativeTrimmed,
  } = input;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, message: FIELD_VISIT_COPY.completeGpsRequired };
  }

  if ((inspectionFlowStatus ?? 'unknown') === 'unknown') {
    return { ok: false, message: FIELD_VISIT_COPY.outletFlowRequired };
  }

  if (outletInspectionObstructed && !inspectionObstructionDetailsTrimmed) {
    return { ok: false, message: FIELD_VISIT_COPY.outletObstructionDetailsRequired };
  }

  if (outcome === 'sample_collected') {
    if (!cocContainerIdTrimmed) {
      return { ok: false, message: FIELD_VISIT_COPY.sampleCocContainerRequired };
    }
    if (!cocPreservativeConfirmed) {
      return { ok: false, message: FIELD_VISIT_COPY.sampleCocPreservativeRequired };
    }
  }

  if (outcome === 'no_discharge' && totalPhotoCount < 1) {
    return { ok: false, message: FIELD_VISIT_COPY.noDischargePhotoRequired };
  }

  if (outcome === 'no_discharge' && !noDischargeNarrativeTrimmed) {
    return { ok: false, message: FIELD_VISIT_COPY.noDischargeNarrativeRequired };
  }

  if (
    outcome === 'no_discharge' &&
    noDischargeObstructionObserved &&
    !noDischargeObstructionDetailsTrimmed
  ) {
    return { ok: false, message: FIELD_VISIT_COPY.noDischargeObstructionDetailsRequired };
  }

  if (outcome === 'access_issue' && totalPhotoCount < 1) {
    return { ok: false, message: FIELD_VISIT_COPY.accessIssuePhotoRequired };
  }

  if (outcome === 'access_issue' && !accessIssueNarrativeTrimmed) {
    return { ok: false, message: FIELD_VISIT_COPY.accessIssueNarrativeRequired };
  }

  return { ok: true };
}

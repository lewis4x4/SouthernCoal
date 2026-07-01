import type { FieldVisitOutcome } from '@/types';
import { FIELD_VISIT_COPY } from '@/lib/fieldVisitValidationCopy';

/**
 * Pure validation for field visit start + completion (Lane A Milestone 1 — A2, A3).
 * Keeps rules testable without mounting FieldVisitPage.
 *
 * Photo rule: `complete_field_visit` counts only persisted `field_evidence_assets` rows.
 * When online, require syncedPhotoCount >= 1 for no_discharge/access_issue.
 * When offline, pending device drafts count toward the gate (evidence sync runs before queue flush).
 */
export interface FieldVisitCompletionValidationInput {
  requiredFieldMeasurementsComplete: boolean;
  containerValidationBlocking: boolean;
  completeLatitude: number;
  completeLongitude: number;
  inspectionFlowStatus: string | null | undefined;
  outletInspectionObstructed: boolean;
  inspectionObstructionDetailsTrimmed: string;
  outcome: FieldVisitOutcome;
  cocContainerIdTrimmed: string;
  cocPreservativeConfirmed: boolean;
  /** Photos already in `field_evidence_assets` (synced to server). */
  syncedPhotoCount: number;
  /** Photo drafts on device not yet uploaded. */
  pendingPhotoCount: number;
  /** When true, completion will call RPC immediately — server requires synced photos. */
  isOnline: boolean;
  noDischargeNarrativeTrimmed: string;
  noDischargeObstructionObserved: boolean;
  noDischargeObstructionDetailsTrimmed: string;
  accessIssueNarrativeTrimmed: string;
}

export type FieldVisitCompletionValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Parse a GPS coordinate from a form field; empty / non-numeric → null (never treat blank as 0). */
export function parseFieldGpsCoordinate(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return value;
}

/**
 * Valid WGS84 pair for field visit start/complete (A3).
 * Rejects missing, non-finite, out-of-range, and 0,0 (blank fields coerce to 0 without parseFieldGpsCoordinate).
 */
export function isValidFieldGpsPair(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

/** Start visit requires finite latitude/longitude (A3). */
export function validateFieldVisitStartCoordinates(
  latitude: number,
  longitude: number,
): FieldVisitCompletionValidationResult {
  if (!isValidFieldGpsPair(latitude, longitude)) {
    return { ok: false, message: FIELD_VISIT_COPY.startGpsRequired };
  }
  return { ok: true };
}

export function validateFieldVisitOutcomeEvidence(
  outcome: FieldVisitOutcome,
  syncedPhotoCount: number,
  pendingPhotoCount: number,
  isOnline: boolean,
): FieldVisitCompletionValidationResult {
  if (outcome !== 'no_discharge' && outcome !== 'access_issue') {
    return { ok: true };
  }

  if (isOnline) {
    if (syncedPhotoCount >= 1) return { ok: true };
    if (pendingPhotoCount >= 1) {
      return { ok: false, message: FIELD_VISIT_COPY.photoSyncBeforeCompleteOnline };
    }
    return {
      ok: false,
      message:
        outcome === 'no_discharge'
          ? FIELD_VISIT_COPY.noDischargePhotoRequired
          : FIELD_VISIT_COPY.accessIssuePhotoRequired,
    };
  }

  if (syncedPhotoCount + pendingPhotoCount < 1) {
    return {
      ok: false,
      message:
        outcome === 'no_discharge'
          ? FIELD_VISIT_COPY.noDischargePhotoRequired
          : FIELD_VISIT_COPY.accessIssuePhotoRequired,
    };
  }
  return { ok: true };
}

export function validateFieldVisitCompletion(
  input: FieldVisitCompletionValidationInput,
): FieldVisitCompletionValidationResult {
  const {
    requiredFieldMeasurementsComplete,
    containerValidationBlocking,
    completeLatitude: lat,
    completeLongitude: lng,
    inspectionFlowStatus,
    outletInspectionObstructed,
    inspectionObstructionDetailsTrimmed,
    outcome,
    cocContainerIdTrimmed,
    cocPreservativeConfirmed,
    syncedPhotoCount,
    pendingPhotoCount,
    isOnline,
    noDischargeNarrativeTrimmed,
    noDischargeObstructionObserved,
    noDischargeObstructionDetailsTrimmed,
    accessIssueNarrativeTrimmed,
  } = input;

  if (!isValidFieldGpsPair(lat, lng)) {
    return { ok: false, message: FIELD_VISIT_COPY.completeGpsRequired };
  }

  if (outletInspectionObstructed) {
    if (!inspectionObstructionDetailsTrimmed) {
      return { ok: false, message: FIELD_VISIT_COPY.outletObstructionDetailsRequired };
    }
  } else if ((inspectionFlowStatus ?? 'unknown') === 'unknown') {
    return { ok: false, message: FIELD_VISIT_COPY.outletFlowRequired };
  }

  if (outcome === 'sample_collected') {
    if (containerValidationBlocking) {
      return { ok: false, message: FIELD_VISIT_COPY.sampleContainerMismatch };
    }
    if (!requiredFieldMeasurementsComplete) {
      return { ok: false, message: FIELD_VISIT_COPY.sampleFieldMeasurementsRequired };
    }
    if (!cocContainerIdTrimmed) {
      return { ok: false, message: FIELD_VISIT_COPY.sampleCocContainerRequired };
    }
    if (!cocPreservativeConfirmed) {
      return { ok: false, message: FIELD_VISIT_COPY.sampleCocPreservativeRequired };
    }
  }

  const photoCheck = validateFieldVisitOutcomeEvidence(
    outcome,
    syncedPhotoCount,
    pendingPhotoCount,
    isOnline,
  );
  if (!photoCheck.ok) return photoCheck;

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

  if (outcome === 'access_issue' && !accessIssueNarrativeTrimmed) {
    return { ok: false, message: FIELD_VISIT_COPY.accessIssueNarrativeRequired };
  }

  return { ok: true };
}

/** A6 — skip redundant offline COC queue op when primary container already saved on device/server row. */
export function shouldSkipCocResaveOnCompletion(input: {
  outcome: FieldVisitOutcome;
  cocContainerIdTrimmed: string;
  cocPreservativeConfirmed: boolean;
  savedCocText?: string | null;
  savedPreservativeConfirmed?: boolean | null;
}): boolean {
  if (input.outcome !== 'sample_collected') return false;
  if (!input.cocPreservativeConfirmed) return false;
  if (!input.savedCocText?.trim()) return false;
  return (
    input.savedCocText.trim() === input.cocContainerIdTrimmed
    && Boolean(input.savedPreservativeConfirmed)
  );
}

// ---------------------------------------------------------------------------
// Completion Gate checklist (read-only UI; mirrors validation predicates)
// ---------------------------------------------------------------------------

export interface FieldVisitCompletionChecklistInput {
  visitStarted: boolean;
  requiredFieldMeasurementsComplete: boolean;
  containerValidationBlocking: boolean;
  completeLatitude: number;
  completeLongitude: number;
  inspectionFlowStatus: string | null | undefined;
  outletInspectionObstructed: boolean;
  inspectionObstructionDetailsTrimmed: string;
  outcome: FieldVisitOutcome;
  cocContainerIdTrimmed: string;
  cocPreservativeConfirmed: boolean;
  syncedPhotoCount: number;
  pendingPhotoCount: number;
  isOnline: boolean;
  noDischargeNarrativeTrimmed: string;
  noDischargeObstructionObserved: boolean;
  noDischargeObstructionDetailsTrimmed: string;
  accessIssueNarrativeTrimmed: string;
}

export interface CompletionChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface CompletionReadinessSummary {
  blockerCount: number;
  completedCount: number;
  totalCount: number;
  blockerLabels: string[];
}

export function getFieldVisitCompletionChecklistItems(
  input: FieldVisitCompletionChecklistInput,
): CompletionChecklistItem[] {
  const {
    visitStarted,
    requiredFieldMeasurementsComplete,
    containerValidationBlocking,
    completeLatitude: lat,
    completeLongitude: lng,
    inspectionFlowStatus,
    outletInspectionObstructed,
    inspectionObstructionDetailsTrimmed,
    outcome,
    cocContainerIdTrimmed,
    cocPreservativeConfirmed,
    syncedPhotoCount,
    pendingPhotoCount,
    isOnline,
    noDischargeNarrativeTrimmed,
    noDischargeObstructionObserved,
    noDischargeObstructionDetailsTrimmed,
    accessIssueNarrativeTrimmed,
  } = input;

  const flowKnown = outletInspectionObstructed || (inspectionFlowStatus ?? 'unknown') !== 'unknown';
  const completionGpsOk = isValidFieldGpsPair(lat, lng);
  const obstructionOk =
    !outletInspectionObstructed || Boolean(inspectionObstructionDetailsTrimmed);

  const photoOk =
    outcome !== 'no_discharge' && outcome !== 'access_issue'
      ? true
      : isOnline
        ? syncedPhotoCount >= 1
        : syncedPhotoCount + pendingPhotoCount >= 1;

  const items: CompletionChecklistItem[] = [
    { id: 'started', label: 'Visit started (start GPS recorded)', done: visitStarted },
    { id: 'outlet_flow', label: 'Site condition assessed', done: flowKnown },
    {
      id: 'obstruction_details',
      label: 'Obstruction described (if flow obstructed or obstruction observed)',
      done: obstructionOk,
    },
    {
      id: 'completion_gps',
      label: 'Completion latitude and longitude entered',
      done: completionGpsOk,
    },
  ];

  if (outcome === 'sample_collected') {
    items.push(
      {
        id: 'required_field_measurements',
        label: 'Required field measurements captured for this stop',
        done: requiredFieldMeasurementsComplete,
      },
      {
        id: 'coc_id',
        label: 'Container scanned or entered in chain of custody',
        done: Boolean(cocContainerIdTrimmed),
      },
      {
        id: 'coc_match',
        label: 'Known bottle or kit mismatch cleared',
        done: !containerValidationBlocking,
      },
      {
        id: 'coc_preservative',
        label: 'Bottle / preservative confirmation checked',
        done: cocPreservativeConfirmed,
      },
    );
  }

  if (outcome === 'no_discharge' || outcome === 'access_issue') {
    const photoLabel = isOnline
      ? 'At least one photo uploaded (server)'
      : 'At least one photo (on device or uploaded)';
    items.push({ id: 'photos', label: photoLabel, done: photoOk });
  }

  if (outcome === 'no_discharge') {
    items.push(
      { id: 'nd_narrative', label: 'No-discharge narrative', done: Boolean(noDischargeNarrativeTrimmed) },
      {
        id: 'nd_obstruction',
        label: 'No-discharge obstruction details (if obstruction observed)',
        done: !noDischargeObstructionObserved || Boolean(noDischargeObstructionDetailsTrimmed),
      },
    );
  }

  if (outcome === 'access_issue') {
    items.push({
      id: 'access_narrative',
      label: 'Access issue narrative',
      done: Boolean(accessIssueNarrativeTrimmed),
    });
  }

  return items;
}

export function summarizeCompletionChecklist(
  items: CompletionChecklistItem[],
): CompletionReadinessSummary {
  const blockerLabels = items.filter((item) => !item.done).map((item) => item.label);
  return {
    blockerCount: blockerLabels.length,
    completedCount: items.length - blockerLabels.length,
    totalCount: items.length,
    blockerLabels,
  };
}

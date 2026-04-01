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

function validatePhotoEvidenceForOutcome(
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

  const photoCheck = validatePhotoEvidenceForOutcome(
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

// ---------------------------------------------------------------------------
// Completion Gate checklist (read-only UI; mirrors validation predicates)
// ---------------------------------------------------------------------------

export interface FieldVisitCompletionChecklistInput {
  visitStarted: boolean;
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

export function getFieldVisitCompletionChecklistItems(
  input: FieldVisitCompletionChecklistInput,
): CompletionChecklistItem[] {
  const {
    visitStarted,
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

  const flowKnown = (inspectionFlowStatus ?? 'unknown') !== 'unknown';
  const completionGpsOk = Number.isFinite(lat) && Number.isFinite(lng);
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
    { id: 'outlet_flow', label: 'Outlet flow status set (not Unknown)', done: flowKnown },
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
      { id: 'coc_id', label: 'Primary container ID in chain of custody', done: Boolean(cocContainerIdTrimmed) },
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

import { describe, expect, it } from 'vitest';
import {
  getFieldVisitCompletionChecklistItems,
  validateFieldVisitCompletion,
  validateFieldVisitStartCoordinates,
} from '@/lib/fieldVisitCompletionValidation';
import { FIELD_VISIT_COPY } from '@/lib/fieldVisitValidationCopy';

const base = () => ({
  completeLatitude: 38.0,
  completeLongitude: -81.0,
  inspectionFlowStatus: 'flowing' as const,
  outletInspectionObstructed: false,
  inspectionObstructionDetailsTrimmed: '',
  outcome: 'sample_collected' as const,
  cocContainerIdTrimmed: 'BTL-001',
  cocPreservativeConfirmed: true,
  syncedPhotoCount: 0,
  pendingPhotoCount: 0,
  isOnline: true,
  noDischargeNarrativeTrimmed: '',
  noDischargeObstructionObserved: false,
  noDischargeObstructionDetailsTrimmed: '',
  accessIssueNarrativeTrimmed: '',
});

describe('validateFieldVisitStartCoordinates', () => {
  it('passes for finite coordinates', () => {
    expect(validateFieldVisitStartCoordinates(38, -81)).toEqual({ ok: true });
  });

  it('fails for NaN (A3)', () => {
    const r = validateFieldVisitStartCoordinates(NaN, -81);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.startGpsRequired);
  });

  it('fails for non-finite longitude', () => {
    const r = validateFieldVisitStartCoordinates(38, Infinity);
    expect(r.ok).toBe(false);
  });
});

describe('validateFieldVisitCompletion', () => {
  it('passes for valid sample_collected', () => {
    expect(validateFieldVisitCompletion(base())).toEqual({ ok: true });
  });

  it('fails when completion coordinates are not finite (A3)', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      completeLatitude: NaN,
      completeLongitude: -81,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.completeGpsRequired);
  });

  it('fails when outlet flow is unknown (A2)', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      inspectionFlowStatus: 'unknown',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.outletFlowRequired);
  });

  it('fails when obstructed but no obstruction details', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outletInspectionObstructed: true,
      inspectionObstructionDetailsTrimmed: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.outletObstructionDetailsRequired);
  });

  it('fails sample_collected without COC container', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      cocContainerIdTrimmed: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.sampleCocContainerRequired);
  });

  it('fails sample_collected without preservative confirmation', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      cocPreservativeConfirmed: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.sampleCocPreservativeRequired);
  });

  it('fails no_discharge online without synced photo', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outcome: 'no_discharge',
      syncedPhotoCount: 0,
      pendingPhotoCount: 0,
      isOnline: true,
      noDischargeNarrativeTrimmed: 'Dry channel.',
      cocContainerIdTrimmed: '',
      cocPreservativeConfirmed: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.noDischargePhotoRequired);
  });

  it('fails no_discharge online when only pending photos (RPC needs synced rows)', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outcome: 'no_discharge',
      syncedPhotoCount: 0,
      pendingPhotoCount: 1,
      isOnline: true,
      noDischargeNarrativeTrimmed: 'Dry channel.',
      cocContainerIdTrimmed: '',
      cocPreservativeConfirmed: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.photoSyncBeforeCompleteOnline);
  });

  it('passes no_discharge offline with only pending photos', () => {
    expect(
      validateFieldVisitCompletion({
        ...base(),
        outcome: 'no_discharge',
        syncedPhotoCount: 0,
        pendingPhotoCount: 1,
        isOnline: false,
        noDischargeNarrativeTrimmed: 'No flow observed.',
        cocContainerIdTrimmed: '',
        cocPreservativeConfirmed: false,
      }),
    ).toEqual({ ok: true });
  });

  it('passes no_discharge online with synced photo and narrative', () => {
    expect(
      validateFieldVisitCompletion({
        ...base(),
        outcome: 'no_discharge',
        syncedPhotoCount: 1,
        pendingPhotoCount: 0,
        isOnline: true,
        noDischargeNarrativeTrimmed: 'No flow observed.',
        cocContainerIdTrimmed: '',
        cocPreservativeConfirmed: false,
      }),
    ).toEqual({ ok: true });
  });

  it('fails no_discharge with obstruction flag but empty obstruction details', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outcome: 'no_discharge',
      syncedPhotoCount: 1,
      isOnline: true,
      noDischargeNarrativeTrimmed: 'x',
      noDischargeObstructionObserved: true,
      noDischargeObstructionDetailsTrimmed: '',
      cocContainerIdTrimmed: '',
      cocPreservativeConfirmed: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe(FIELD_VISIT_COPY.noDischargeObstructionDetailsRequired);
    }
  });

  it('fails access_issue online without photo', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outcome: 'access_issue',
      syncedPhotoCount: 0,
      pendingPhotoCount: 0,
      isOnline: true,
      accessIssueNarrativeTrimmed: 'Gate locked.',
      cocContainerIdTrimmed: '',
      cocPreservativeConfirmed: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.accessIssuePhotoRequired);
  });

  it('fails access_issue without narrative', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outcome: 'access_issue',
      syncedPhotoCount: 1,
      isOnline: true,
      accessIssueNarrativeTrimmed: '',
      cocContainerIdTrimmed: '',
      cocPreservativeConfirmed: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.accessIssueNarrativeRequired);
  });
});

describe('getFieldVisitCompletionChecklistItems', () => {
  it('marks photo item done when online and synced photos exist', () => {
    const items = getFieldVisitCompletionChecklistItems({
      visitStarted: true,
      completeLatitude: 38,
      completeLongitude: -81,
      inspectionFlowStatus: 'flowing',
      outletInspectionObstructed: false,
      inspectionObstructionDetailsTrimmed: '',
      outcome: 'no_discharge',
      cocContainerIdTrimmed: '',
      cocPreservativeConfirmed: false,
      syncedPhotoCount: 1,
      pendingPhotoCount: 0,
      isOnline: true,
      noDischargeNarrativeTrimmed: 'ok',
      noDischargeObstructionObserved: false,
      noDischargeObstructionDetailsTrimmed: '',
      accessIssueNarrativeTrimmed: '',
    });
    expect(items.find((i) => i.id === 'photos')?.done).toBe(true);
  });
});

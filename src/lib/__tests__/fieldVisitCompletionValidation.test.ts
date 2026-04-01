import { describe, expect, it } from 'vitest';
import {
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
  totalPhotoCount: 0,
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

  it('fails no_discharge without photo', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outcome: 'no_discharge',
      totalPhotoCount: 0,
      noDischargeNarrativeTrimmed: 'Dry channel.',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.noDischargePhotoRequired);
  });

  it('passes no_discharge with photo and narrative', () => {
    expect(
      validateFieldVisitCompletion({
        ...base(),
        outcome: 'no_discharge',
        totalPhotoCount: 1,
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
      totalPhotoCount: 1,
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

  it('fails access_issue without photo', () => {
    const r = validateFieldVisitCompletion({
      ...base(),
      outcome: 'access_issue',
      totalPhotoCount: 0,
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
      totalPhotoCount: 1,
      accessIssueNarrativeTrimmed: '',
      cocContainerIdTrimmed: '',
      cocPreservativeConfirmed: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(FIELD_VISIT_COPY.accessIssueNarrativeRequired);
  });
});

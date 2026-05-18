import { describe, expect, it } from 'vitest';
import {
  buildNpdesPermitDispositionUpdate,
  formatAdministrativeDispositionLabel,
  isPermitAwaitingAdministrativeDisposition,
  permitRequiresAdministrativeInvestigation,
} from '../permitAdministrativeDisposition';

describe('buildNpdesPermitDispositionUpdate', () => {
  it('maps continued to administratively_continued true without investigation flag', () => {
    expect(buildNpdesPermitDispositionUpdate('continued')).toEqual({
      administratively_continued: true,
      requires_administrative_investigation: false,
    });
  });

  it('maps expired to false continued and no investigation flag', () => {
    expect(buildNpdesPermitDispositionUpdate('expired')).toEqual({
      administratively_continued: false,
      requires_administrative_investigation: false,
    });
  });

  it('maps investigate to distinct persisted state from expired', () => {
    const investigate = buildNpdesPermitDispositionUpdate('investigate');
    const expired = buildNpdesPermitDispositionUpdate('expired');
    expect(investigate.administratively_continued).toBe(expired.administratively_continued);
    expect(investigate.requires_administrative_investigation).not.toBe(
      expired.requires_administrative_investigation,
    );
    expect(investigate).toEqual({
      administratively_continued: false,
      requires_administrative_investigation: true,
    });
  });
});

describe('permit disposition readers', () => {
  it('detects unreviewed queue rows', () => {
    expect(isPermitAwaitingAdministrativeDisposition({ administratively_continued: null })).toBe(
      true,
    );
    expect(isPermitAwaitingAdministrativeDisposition({ administratively_continued: false })).toBe(
      false,
    );
  });

  it('detects investigation permits after save', () => {
    const saved = buildNpdesPermitDispositionUpdate('investigate');
    expect(permitRequiresAdministrativeInvestigation(saved)).toBe(true);
    expect(formatAdministrativeDispositionLabel(saved)).toBe('Investigate');
    expect(formatAdministrativeDispositionLabel(buildNpdesPermitDispositionUpdate('expired'))).toBe(
      'Expired',
    );
  });
});

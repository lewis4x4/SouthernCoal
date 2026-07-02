import { describe, expect, it } from 'vitest';
import {
  mapEchoPermitStatusToInternal,
  statusMismatchNeedsInternalUpdate,
} from '@/lib/echoPermitStatusMap';

describe('echoPermitStatusMap', () => {
  it('maps ECHO labels to internal npdes_permits.status values', () => {
    expect(mapEchoPermitStatusToInternal('Expired')).toBe('expired');
    expect(mapEchoPermitStatusToInternal('Terminated; Compliance Tracking Off')).toBe('terminated');
    expect(mapEchoPermitStatusToInternal('Admin Continued')).toBe('administratively_continued');
    expect(mapEchoPermitStatusToInternal('Effective')).toBe('active');
  });

  it('detects when internal status should change', () => {
    expect(statusMismatchNeedsInternalUpdate('active', 'Expired')).toBe(true);
    expect(statusMismatchNeedsInternalUpdate('active', 'Effective')).toBe(false);
    expect(statusMismatchNeedsInternalUpdate('active', 'Admin Continued')).toBe(true);
  });
});

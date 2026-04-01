import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearStoredOutboundQueueDiagnostic,
  OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY,
  persistOutboundQueueDiagnostic,
  readStoredOutboundQueueDiagnostic,
} from '../fieldOutboundQueueDiagnostic';

describe('fieldOutboundQueueDiagnostic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and reads diagnostic payload', () => {
    persistOutboundQueueDiagnostic({
      message: 'RLS violation',
      opKind: 'field_visit_complete',
      visitId: 'visit-uuid-1',
    });
    expect(readStoredOutboundQueueDiagnostic()).toEqual({
      message: 'RLS violation',
      opKind: 'field_visit_complete',
      visitId: 'visit-uuid-1',
    });
  });

  it('persists conflictHold flag when true', () => {
    persistOutboundQueueDiagnostic({
      message: 'Outcome mismatch',
      opKind: 'field_visit_complete',
      visitId: 'visit-uuid-2',
      conflictHold: true,
    });
    expect(readStoredOutboundQueueDiagnostic()).toEqual({
      message: 'Outcome mismatch',
      opKind: 'field_visit_complete',
      visitId: 'visit-uuid-2',
      conflictHold: true,
    });
  });

  it('clear removes key', () => {
    persistOutboundQueueDiagnostic({
      message: 'x',
      opKind: 'unknown',
      visitId: '—',
    });
    clearStoredOutboundQueueDiagnostic();
    expect(localStorage.getItem(OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY)).toBeNull();
    expect(readStoredOutboundQueueDiagnostic()).toBeNull();
  });
});

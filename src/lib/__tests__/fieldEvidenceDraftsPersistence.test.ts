import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearPersistedFieldEvidenceSyncFailures,
  clearPersistedFieldEvidenceSyncFailuresForVisit,
  persistFieldEvidenceSyncFailures,
  readPersistedFieldEvidenceSyncFailures,
  readPersistedFieldEvidenceSyncFailuresForVisit,
} from '../fieldEvidenceDrafts';

const f1 = {
  draftId: 'd1',
  fieldVisitId: 'v1',
  fileName: 'a.jpg',
  message: 'Network error',
};

const f2 = {
  draftId: 'd2',
  fieldVisitId: 'v2',
  fileName: 'b.jpg',
  message: 'Denied',
};

describe('field evidence sync failure persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('persists and reads failures', () => {
    persistFieldEvidenceSyncFailures([f1, f2]);
    expect(readPersistedFieldEvidenceSyncFailures()).toHaveLength(2);
    expect(readPersistedFieldEvidenceSyncFailuresForVisit('v1')).toEqual([f1]);
  });

  it('clears all failures', () => {
    persistFieldEvidenceSyncFailures([f1]);
    clearPersistedFieldEvidenceSyncFailures();
    expect(readPersistedFieldEvidenceSyncFailures()).toEqual([]);
  });

  it('clears failures for one visit only', () => {
    persistFieldEvidenceSyncFailures([f1, f2]);
    clearPersistedFieldEvidenceSyncFailuresForVisit('v1');
    expect(readPersistedFieldEvidenceSyncFailures()).toEqual([f2]);
  });

  it('persist empty clears storage', () => {
    persistFieldEvidenceSyncFailures([f1]);
    persistFieldEvidenceSyncFailures([]);
    expect(readPersistedFieldEvidenceSyncFailures()).toEqual([]);
  });
});

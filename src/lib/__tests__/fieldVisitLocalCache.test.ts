import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFieldVisitCache,
  clearAllFieldVisitCaches,
  type FieldVisitCacheScope,
  loadFieldVisitCache,
  saveFieldVisitCache,
} from '../fieldVisitLocalCache';
import type { FieldVisitDetails, FieldVisitListItem } from '@/types';

function installMockStorage() {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

const minimalVisit = (over: Partial<FieldVisitListItem> = {}): FieldVisitListItem => ({
  id: 'v1',
  organization_id: 'o1',
  permit_id: 'p1',
  outfall_id: 'of1',
  assigned_to: 'u1',
  assigned_by: 'u2',
  scheduled_date: '2026-03-31',
  visit_status: 'assigned',
  outcome: null,
  started_at: null,
  completed_at: null,
  started_latitude: null,
  started_longitude: null,
  completed_latitude: null,
  completed_longitude: null,
  weather_conditions: null,
  field_notes: null,
  potential_force_majeure: false,
  potential_force_majeure_notes: null,
  linked_sampling_event_id: null,
  sampling_calendar_id: null,
  route_batch_id: null,
  created_at: '2026-03-31T12:00:00Z',
  updated_at: '2026-03-31T12:00:00Z',
  permit_number: 'WV-1',
  outfall_number: '001',
  assigned_to_name: 'Test',
  route_stop_sequence: 1,
  ...over,
});

const minimalDetail = (over: Partial<FieldVisitDetails> = {}): FieldVisitDetails => ({
  visit: minimalVisit(),
  inspection: null,
  measurements: [],
  evidence: [],
  noDischarge: null,
  accessIssue: null,
  governanceIssues: [],
  scheduled_parameter_label: null,
  schedule_instructions: null,
  stop_requirements: [],
  required_field_measurements: [],
  previous_visit_context: null,
  ...over,
});

const scope = (over: Partial<FieldVisitCacheScope> = {}): FieldVisitCacheScope => ({
  organizationId: 'o1',
  viewerUserId: 'u1',
  ...over,
});

describe('fieldVisitLocalCache', () => {
  beforeEach(() => {
    installMockStorage();
    clearAllFieldVisitCaches();
  });

  it('saves and loads visit detail cache', () => {
    const detail = minimalDetail();
    expect(saveFieldVisitCache(detail, scope())).toBe(true);
    expect(loadFieldVisitCache('v1', scope())?.visit.id).toBe('v1');
  });

  it('rejects and clears legacy cache contents without ownership metadata', () => {
    localStorage.setItem('scc.fieldVisitCache.v1.v1', '{"bad":true}');
    expect(loadFieldVisitCache('v1', scope())).toBeNull();
    expect(localStorage.getItem('scc.fieldVisitCache.v1.v1')).toBeNull();
  });

  it('clears cached visit detail', () => {
    expect(saveFieldVisitCache(minimalDetail(), scope())).toBe(true);
    clearFieldVisitCache('v1');
    expect(loadFieldVisitCache('v1', scope())).toBeNull();
  });

  it('clears all cached visit details', () => {
    expect(saveFieldVisitCache(minimalDetail(), scope())).toBe(true);
    expect(
      saveFieldVisitCache(
        minimalDetail({
          visit: minimalVisit({ id: 'v2' }),
        }),
        scope(),
      ),
    ).toBe(true);

    clearAllFieldVisitCaches();

    expect(loadFieldVisitCache('v1', scope())).toBeNull();
    expect(loadFieldVisitCache('v2', scope())).toBeNull();
  });

  it('returns false when storage write fails', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveFieldVisitCache(minimalDetail(), scope())).toBe(false);
    spy.mockRestore();
  });

  it('rejects and clears same-org cache from a different user', () => {
    expect(saveFieldVisitCache(minimalDetail(), scope())).toBe(true);

    expect(loadFieldVisitCache('v1', scope({ viewerUserId: 'u9' }))).toBeNull();
    expect(localStorage.getItem('scc.fieldVisitCache.v1.v1')).toBeNull();
  });

  it('rejects and clears cross-org cache reuse', () => {
    expect(saveFieldVisitCache(minimalDetail(), scope())).toBe(true);

    expect(loadFieldVisitCache('v1', scope({ organizationId: 'o9' }))).toBeNull();
    expect(localStorage.getItem('scc.fieldVisitCache.v1.v1')).toBeNull();
  });

  it('rejects and clears cache whose embedded visit id mismatches the key', () => {
    localStorage.setItem('scc.fieldVisitCache.v1.v1', JSON.stringify({
      version: 2,
      visitId: 'v1',
      organizationId: 'o1',
      viewerUserId: 'u1',
      detail: minimalDetail({
        visit: minimalVisit({ id: 'v2' }),
      }),
    }));

    expect(loadFieldVisitCache('v1', scope())).toBeNull();
    expect(localStorage.getItem('scc.fieldVisitCache.v1.v1')).toBeNull();
  });

  it('rejects and clears cache whose embedded visit org mismatches the requested scope', () => {
    localStorage.setItem('scc.fieldVisitCache.v1.v1', JSON.stringify({
      version: 2,
      visitId: 'v1',
      organizationId: 'o1',
      viewerUserId: 'u1',
      detail: minimalDetail({
        visit: minimalVisit({ organization_id: 'o9' }),
      }),
    }));

    expect(loadFieldVisitCache('v1', scope())).toBeNull();
    expect(localStorage.getItem('scc.fieldVisitCache.v1.v1')).toBeNull();
  });

  it('does not save cache entries without full viewer scope', () => {
    expect(saveFieldVisitCache(minimalDetail(), scope({ viewerUserId: null }))).toBe(false);
    expect(localStorage.getItem('scc.fieldVisitCache.v1.v1')).toBeNull();
  });

  it('does not save cache entries when detail org disagrees with viewer scope', () => {
    expect(
      saveFieldVisitCache(
        minimalDetail({
          visit: minimalVisit({ organization_id: 'o9' }),
        }),
        scope(),
      ),
    ).toBe(false);
    expect(localStorage.getItem('scc.fieldVisitCache.v1.v1')).toBeNull();
  });
});

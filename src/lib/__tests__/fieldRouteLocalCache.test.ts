import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveFieldRouteCache,
  loadFieldRouteCache,
  loadFieldRouteCacheMatching,
  clearFieldRouteCache,
} from '../fieldRouteLocalCache';
import type { FieldVisitListItem } from '@/types';

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

describe('fieldRouteLocalCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads matching cache', () => {
    const v = [minimalVisit()];
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: v,
        outfallCoords: { of1: { lat: 1, lng: 2 } },
      }),
    ).toBe(true);
    const m = loadFieldRouteCacheMatching('2026-03-31', 'mine', 'u1');
    expect(m?.visits).toHaveLength(1);
    expect(m?.outfallCoords.of1).toEqual({ lat: 1, lng: 2 });
  });

  it('returns null when scope or date differs', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(true);
    expect(loadFieldRouteCacheMatching('2026-04-01', 'mine', 'u1')).toBeNull();
    expect(loadFieldRouteCacheMatching('2026-03-31', 'org', null)).toBeNull();
  });

  it('clearFieldRouteCache removes entry', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        scope: 'org',
        viewerUserId: null,
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(true);
    clearFieldRouteCache();
    expect(loadFieldRouteCache()).toBeNull();
  });

  it('saveFieldRouteCache returns false when setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(false);
    spy.mockRestore();
  });
});

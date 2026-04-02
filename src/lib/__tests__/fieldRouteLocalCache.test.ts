import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveFieldRouteCache,
  loadFieldRouteCache,
  loadFieldRouteCacheMatching,
  clearFieldRouteCache,
  clearFieldRouteCacheFromIdb,
  fieldRouteCacheMatchesView,
  findVisitInFieldRouteCache,
  findVisitInFieldRouteCacheAsync,
  loadFieldRouteCacheFromIdbMatching,
  saveFieldRouteCacheDual,
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

  afterEach(async () => {
    await clearFieldRouteCacheFromIdb();
  });

  it('saves and loads matching cache', () => {
    const v = [minimalVisit()];
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: v,
        outfallCoords: { of1: { lat: 1, lng: 2 } },
      }),
    ).toBe(true);
    const m = loadFieldRouteCacheMatching('2026-03-31', 'mine', 'u1', 'org-1');
    expect(m?.visits).toHaveLength(1);
    expect(m?.outfallCoords.of1).toEqual({ lat: 1, lng: 2 });
  });

  it('returns null when scope or date differs', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(true);
    expect(loadFieldRouteCacheMatching('2026-04-01', 'mine', 'u1', 'org-1')).toBeNull();
    expect(loadFieldRouteCacheMatching('2026-03-31', 'org', null, 'org-1')).toBeNull();
  });

  it('fieldRouteCacheMatchesView checks date, scope, and viewer', () => {
    const p = {
      version: 3 as const,
      routeDate: '2026-03-31',
      organizationId: 'org-1',
      scope: 'org' as const,
      viewerUserId: 'u1',
      savedAt: '2026-03-31T12:00:00Z',
      visits: [minimalVisit()],
      outfallCoords: {},
    };
    expect(fieldRouteCacheMatchesView(p, '2026-03-31', 'org', 'u1', 'org-1')).toBe(true);
    expect(fieldRouteCacheMatchesView(p, '2026-04-01', 'org', 'u1', 'org-1')).toBe(false);
    expect(fieldRouteCacheMatchesView(p, '2026-03-31', 'mine', 'u1', 'org-1')).toBe(false);
    expect(fieldRouteCacheMatchesView(p, '2026-03-31', 'org', 'u2', 'org-1')).toBe(false);
    expect(fieldRouteCacheMatchesView(p, '2026-03-31', 'org', 'u1', 'org-2')).toBe(false);
    expect(fieldRouteCacheMatchesView(p, '2026-03-31', 'org', null, 'org-1')).toBe(false);
  });

  it('saveFieldRouteCacheDual returns ok and snapshot', async () => {
    const { ok, snapshot } = await saveFieldRouteCacheDual({
      routeDate: '2026-03-31',
      organizationId: 'org-1',
      scope: 'mine',
      viewerUserId: 'u1',
      visits: [minimalVisit()],
      outfallCoords: {},
    });
    expect(ok).toBe(true);
    expect(snapshot.visits).toHaveLength(1);
  });

  it('findVisitInFieldRouteCache returns matching visit', () => {
    const v2 = minimalVisit({ id: 'v2', outfall_number: '002' });
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit(), v2],
        outfallCoords: {},
      }),
    ).toBe(true);
    expect(findVisitInFieldRouteCache('v2')?.outfall_number).toBe('002');
    expect(findVisitInFieldRouteCache('missing')).toBeNull();
    expect(findVisitInFieldRouteCache('')).toBeNull();
  });

  it('findVisitInFieldRouteCacheAsync falls back to localStorage', async () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit({ id: 'vx', organization_id: 'org-1' })],
        outfallCoords: {},
      }),
    ).toBe(true);
    const row = await findVisitInFieldRouteCacheAsync('vx', {
      viewerUserId: 'u1',
      organizationId: 'org-1',
    });
    expect(row?.id).toBe('vx');
    expect(await findVisitInFieldRouteCacheAsync('missing', {
      viewerUserId: 'u1',
      organizationId: 'org-1',
    })).toBeNull();
  });

  it('findVisitInFieldRouteCacheAsync rejects org-scope cache saved by another user (same org)', async () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit({ id: 'vx', organization_id: 'org-1' })],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(
      await findVisitInFieldRouteCacheAsync('vx', {
        viewerUserId: 'u2',
        organizationId: 'org-1',
      }),
    ).toBeNull();
  });

  it('findVisitInFieldRouteCacheAsync returns null without viewer context (cold auth)', async () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit({ id: 'vx' })],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(
      await findVisitInFieldRouteCacheAsync('vx', {
        viewerUserId: null,
        organizationId: 'org-1',
      }),
    ).toBeNull();
  });

  it('findVisitInFieldRouteCacheAsync rejects mine-scope cache for another user', async () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: [minimalVisit({ id: 'vx', organization_id: 'org-1' })],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(
      await findVisitInFieldRouteCacheAsync('vx', {
        viewerUserId: 'u2',
        organizationId: 'org-1',
      }),
    ).toBeNull();
  });

  it('findVisitInFieldRouteCacheAsync rejects cached visits from another organization', async () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit({ id: 'vx', organization_id: 'org-1' })],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(
      await findVisitInFieldRouteCacheAsync('vx', {
        viewerUserId: 'u1',
        organizationId: 'org-2',
      }),
    ).toBeNull();
  });

  it('loadFieldRouteCacheMatching rejects same-org snapshot for another user and clears it', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(loadFieldRouteCacheMatching('2026-03-31', 'mine', 'u2', 'org-1')).toBeNull();
    expect(loadFieldRouteCache()).toBeNull();
  });

  it('loadFieldRouteCacheMatching rejects cross-org snapshot and clears it', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(loadFieldRouteCacheMatching('2026-03-31', 'org', 'u1', 'org-2')).toBeNull();
    expect(loadFieldRouteCache()).toBeNull();
  });

  it('loadFieldRouteCacheMatching rejects same-org org-scope snapshot for another user and clears it', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(loadFieldRouteCacheMatching('2026-03-31', 'org', 'u2', 'org-1')).toBeNull();
    expect(loadFieldRouteCache()).toBeNull();
  });

  it('loadFieldRouteCacheMatching keeps snapshot when auth context is not ready', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(true);

    expect(loadFieldRouteCacheMatching('2026-03-31', 'org', null, 'org-1')).toBeNull();
    expect(loadFieldRouteCache()?.viewerUserId).toBe('u1');
  });

  it('loadFieldRouteCacheFromIdbMatching rejects cross-org snapshot and clears it', async () => {
    const { ok } = await saveFieldRouteCacheDual({
      routeDate: '2026-03-31',
      organizationId: 'org-1',
      scope: 'org',
      viewerUserId: 'u1',
      visits: [minimalVisit()],
      outfallCoords: {},
    });

    expect(ok).toBe(true);
    expect(await loadFieldRouteCacheFromIdbMatching('2026-03-31', 'org', 'u1', 'org-2')).toBeNull();
    expect(await loadFieldRouteCacheFromIdbMatching('2026-03-31', 'org', 'u1', 'org-1')).toBeNull();
  });

  it('loadFieldRouteCacheFromIdbMatching rejects same-org org-scope snapshot for another user and clears it', async () => {
    const { ok } = await saveFieldRouteCacheDual({
      routeDate: '2026-03-31',
      organizationId: 'org-1',
      scope: 'org',
      viewerUserId: 'u1',
      visits: [minimalVisit()],
      outfallCoords: {},
    });

    expect(ok).toBe(true);
    expect(await loadFieldRouteCacheFromIdbMatching('2026-03-31', 'org', 'u2', 'org-1')).toBeNull();
    expect(await loadFieldRouteCacheFromIdbMatching('2026-03-31', 'org', 'u1', 'org-1')).toBeNull();
  });

  it('loadFieldRouteCacheFromIdbMatching keeps snapshot when auth context is not ready', async () => {
    const { ok } = await saveFieldRouteCacheDual({
      routeDate: '2026-03-31',
      organizationId: 'org-1',
      scope: 'org',
      viewerUserId: 'u1',
      visits: [minimalVisit()],
      outfallCoords: {},
    });

    expect(ok).toBe(true);
    expect(await loadFieldRouteCacheFromIdbMatching('2026-03-31', 'org', null, 'org-1')).toBeNull();
    if (typeof indexedDB !== 'undefined') {
      expect(await loadFieldRouteCacheFromIdbMatching('2026-03-31', 'org', 'u1', 'org-1')).not.toBeNull();
    }
  });

  it('clearFieldRouteCache removes entry', () => {
    expect(
      saveFieldRouteCache({
        routeDate: '2026-03-31',
        organizationId: 'org-1',
        scope: 'org',
        viewerUserId: 'u1',
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
        organizationId: 'org-1',
        scope: 'mine',
        viewerUserId: 'u1',
        visits: [minimalVisit()],
        outfallCoords: {},
      }),
    ).toBe(false);
    spy.mockRestore();
  });
});

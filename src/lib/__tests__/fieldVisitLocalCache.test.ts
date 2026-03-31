import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFieldVisitCache,
  loadFieldVisitCache,
  saveFieldVisitCache,
} from '../fieldVisitLocalCache';
import type { FieldVisitDetails, FieldVisitListItem } from '@/types';

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
  ...over,
});

describe('fieldVisitLocalCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads visit detail cache', () => {
    const detail = minimalDetail();
    expect(saveFieldVisitCache(detail)).toBe(true);
    expect(loadFieldVisitCache('v1')?.visit.id).toBe('v1');
  });

  it('returns null for invalid cache contents', () => {
    localStorage.setItem('scc.fieldVisitCache.v1.v1', '{"bad":true}');
    expect(loadFieldVisitCache('v1')).toBeNull();
  });

  it('clears cached visit detail', () => {
    expect(saveFieldVisitCache(minimalDetail())).toBe(true);
    clearFieldVisitCache('v1');
    expect(loadFieldVisitCache('v1')).toBeNull();
  });

  it('returns false when storage write fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveFieldVisitCache(minimalDetail())).toBe(false);
    spy.mockRestore();
  });
});

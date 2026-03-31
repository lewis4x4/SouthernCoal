import { describe, it, expect } from 'vitest';
import {
  groupSameOutfallSameDay,
  siblingVisitsSameOutfallSameDay,
} from '../fieldSameOutfallDay';
import type { FieldVisitListItem } from '@/types';

const baseVisit = (over: Partial<FieldVisitListItem> = {}): FieldVisitListItem => ({
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
  assigned_to_name: 'A',
  route_stop_sequence: 1,
  ...over,
});

describe('fieldSameOutfallDay', () => {
  it('groupSameOutfallSameDay returns only groups with 2+ visits', () => {
    const a = baseVisit({ id: 'a' });
    const b = baseVisit({ id: 'b', assigned_to: 'u2', assigned_to_name: 'B' });
    const c = baseVisit({ id: 'c', outfall_id: 'of2', outfall_number: '002' });
    const groups = groupSameOutfallSameDay([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.visits).toHaveLength(2);
    expect(groups[0]?.outfallId).toBe('of1');
  });

  it('siblingVisitsSameOutfallSameDay excludes self', () => {
    const self = baseVisit({ id: 'me' });
    const other = baseVisit({ id: 'other', assigned_to_name: 'Other' });
    expect(
      siblingVisitsSameOutfallSameDay([self, other], 'me', '2026-03-31', 'of1'),
    ).toEqual([other]);
  });
});

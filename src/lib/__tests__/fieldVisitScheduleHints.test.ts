import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FieldVisitListItem } from '@/types';
import { enrichFieldVisitsWithScheduleHints, formatScheduledParameterLabel } from '../fieldVisitScheduleHints';

describe('enrichFieldVisitsWithScheduleHints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns same array when offline', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: false });
    const visits = [{ id: 'v1', sampling_calendar_id: 'cal-1' } as FieldVisitListItem];
    const out = await enrichFieldVisitsWithScheduleHints(visits);
    expect(out).toBe(visits);
  });
});

describe('formatScheduledParameterLabel', () => {
  it('combines name and distinct short_name', () => {
    expect(formatScheduledParameterLabel({ name: 'Iron', short_name: 'Fe' })).toBe('Iron (Fe)');
  });

  it('returns name when short_name matches name', () => {
    expect(formatScheduledParameterLabel({ name: 'Iron', short_name: 'Iron' })).toBe('Iron');
  });

  it('returns null for empty row', () => {
    expect(formatScheduledParameterLabel(null)).toBeNull();
  });
});

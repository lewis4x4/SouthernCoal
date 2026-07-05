import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAMPLING_GAP_READINESS,
  parseSamplingGapReadiness,
  samplingGapReadinessLabel,
} from '@/lib/samplingGapReadiness';

describe('parseSamplingGapReadiness', () => {
  it('parses a configured readiness envelope', () => {
    const parsed = parseSamplingGapReadiness({
      state: 'configured',
      organization_id: 'org-1',
      active_schedules: 12,
      matrix_rows: 10,
      manual_schedules: 2,
      calendar_events: 36,
      matrix_loaded: true,
      open_gaps: 3,
      missed: 2,
      at_risk: 1,
      latest_run: {
        id: 'run-1',
        started_at: '2026-07-05T06:00:00Z',
        finished_at: '2026-07-05T06:00:02Z',
        status: 'completed',
        source: 'scheduled',
        calendars_scanned: 36,
        gaps_opened: 2,
        gaps_updated: 1,
        gaps_resolved: 0,
      },
      disclaimer: 'DRAFT detector',
    });

    expect(parsed.state).toBe('configured');
    expect(parsed.matrix_loaded).toBe(true);
    expect(parsed.latest_run?.calendars_scanned).toBe(36);
  });

  it('defaults invalid or missing payloads to not configured', () => {
    expect(parseSamplingGapReadiness(null)).toEqual(DEFAULT_SAMPLING_GAP_READINESS);
    expect(parseSamplingGapReadiness({ state: 'unknown' }).state).toBe('not_configured');
  });

  it('labels all readiness states for the QW1 UI', () => {
    expect(samplingGapReadinessLabel('not_configured')).toBe('Not configured');
    expect(samplingGapReadinessLabel('empty')).toBe('Calendar empty');
    expect(samplingGapReadinessLabel('draft')).toBe('Draft calendar');
    expect(samplingGapReadinessLabel('configured')).toBe('Configured');
  });
});

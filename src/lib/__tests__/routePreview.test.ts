import { describe, it, expect } from 'vitest';
import {
  buildRouteLegEstimates,
  estimateDriveMinutesStraightLine,
  findNonConsecutiveOutfallRepeats,
  haversineKm,
} from '../routePreview';

describe('routePreview', () => {
  it('haversineKm returns ~0 for identical points', () => {
    const p = { lat: 38.0, lng: -81.0 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it('estimateDriveMinutesStraightLine is bounded', () => {
    expect(estimateDriveMinutesStraightLine(500)).toBeLessThanOrEqual(240);
  });

  it('buildRouteLegEstimates skips legs when coordinates missing', () => {
    const { legs, totalMinutes, missingCoordCount } = buildRouteLegEstimates([
      { label: 'A', coord: { lat: 38, lng: -81 } },
      { label: 'B', coord: { lat: 38.05, lng: -81.05 } },
      { label: 'C', coord: null },
    ]);
    expect(missingCoordCount).toBe(1);
    expect(legs.length).toBe(1);
    expect(totalMinutes).toBeGreaterThan(0);
  });

  it('findNonConsecutiveOutfallRepeats detects split visits to same outfall', () => {
    const ids = ['a', 'b', 'a', 'c'];
    expect(findNonConsecutiveOutfallRepeats(ids)).toContain('a');
  });
});

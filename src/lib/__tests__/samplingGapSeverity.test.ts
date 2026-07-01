import { describe, expect, it } from 'vitest';
import { computeSamplingGapSeverity } from '@/lib/samplingGapSeverity';

describe('computeSamplingGapSeverity', () => {
  it('escalates missed gaps by days late', () => {
    expect(computeSamplingGapSeverity('missed', 0, 0)).toBe('low');
    expect(computeSamplingGapSeverity('missed', 7, 0)).toBe('medium');
    expect(computeSamplingGapSeverity('missed', 14, 0)).toBe('high');
    expect(computeSamplingGapSeverity('missed', 30, 0)).toBe('critical');
  });

  it('marks at-risk gaps medium when due within one day', () => {
    expect(computeSamplingGapSeverity('at_risk', 0, 2)).toBe('low');
    expect(computeSamplingGapSeverity('at_risk', 0, 1)).toBe('medium');
    expect(computeSamplingGapSeverity('at_risk', 0, 0)).toBe('medium');
  });
});

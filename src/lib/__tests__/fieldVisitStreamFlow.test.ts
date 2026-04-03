import { describe, expect, it } from 'vitest';
import { isStreamFlowEstimationPointType } from '@/lib/fieldVisitStreamFlow';

describe('isStreamFlowEstimationPointType', () => {
  it('returns false for blank or typical discharge outfalls', () => {
    expect(isStreamFlowEstimationPointType(null)).toBe(false);
    expect(isStreamFlowEstimationPointType('')).toBe(false);
    expect(isStreamFlowEstimationPointType('Outfall')).toBe(false);
    expect(isStreamFlowEstimationPointType('outlet')).toBe(false);
  });

  it('returns true for stream / receiving stream / GW-SW style labels', () => {
    expect(isStreamFlowEstimationPointType('Receiving Stream')).toBe(true);
    expect(isStreamFlowEstimationPointType('stream')).toBe(true);
    expect(isStreamFlowEstimationPointType('GW/SW')).toBe(true);
    expect(isStreamFlowEstimationPointType('gw-sw interface')).toBe(true);
  });
});

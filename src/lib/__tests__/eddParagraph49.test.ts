import { describe, expect, it } from 'vitest';
import {
  computeExceedanceOnlyFlag,
  computeParagraph49Late,
  PARAGRAPH_49_HOURS_LIMIT,
} from '@/lib/eddParagraph49';

describe('computeParagraph49Late', () => {
  it('flags arrival more than 48h after analysis end', () => {
    const analysisDate = '2026-01-01';
    const onTime = new Date('2026-01-03T23:00:00.000Z');
    const late = new Date('2026-01-04T01:00:00.000Z');

    expect(computeParagraph49Late(analysisDate, onTime).isLate48h).toBe(false);
    expect(computeParagraph49Late(analysisDate, late).isLate48h).toBe(true);
  });

  it('uses configured hour limit constant', () => {
    expect(PARAGRAPH_49_HOURS_LIMIT).toBe(48);
  });
});

describe('computeExceedanceOnlyFlag', () => {
  it('detects transmittals where every received param is an exceedance and set is incomplete', () => {
    expect(computeExceedanceOnlyFlag(3, 10, 3)).toBe(true);
    expect(computeExceedanceOnlyFlag(3, 10, 2)).toBe(false);
    expect(computeExceedanceOnlyFlag(10, 10, 2)).toBe(false);
    expect(computeExceedanceOnlyFlag(0, 10, 0)).toBe(false);
    expect(computeExceedanceOnlyFlag(3, 0, 3)).toBe(false);
  });
});

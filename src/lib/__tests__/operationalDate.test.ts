import { describe, expect, it } from 'vitest';
import { getEasternCurrentYm, getEasternTodayYmd } from '@/lib/operationalDate';

describe('operationalDate', () => {
  it('uses Eastern time for the operational day even when UTC is already tomorrow', () => {
    const date = new Date('2026-04-02T02:30:00.000Z');
    expect(getEasternTodayYmd(date)).toBe('2026-04-01');
    expect(getEasternCurrentYm(date)).toBe('2026-04');
  });

  it('rolls forward after Eastern midnight', () => {
    const date = new Date('2026-04-02T05:30:00.000Z');
    expect(getEasternTodayYmd(date)).toBe('2026-04-02');
  });
});

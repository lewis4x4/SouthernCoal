import {
  buildDmrDateChunks,
  buildEffluentChartUrl,
  formatEchoDate,
  HEAVY_DMR_NPDES_IDS,
  resolveDmrChunkMonths,
} from '../../../supabase/functions/_shared/echo-dmr-sync.ts';
import { describe, expect, it } from 'vitest';

describe('echo DMR date-range chunking', () => {
  it('formats EPA dates as MM/DD/YYYY', () => {
    expect(formatEchoDate(new Date('2026-01-15T12:00:00Z'))).toBe('01/15/2026');
  });

  it('builds quarterly chunks for heavy permits', () => {
    expect(resolveDmrChunkMonths('WV1024078')).toBe(3);
    expect(HEAVY_DMR_NPDES_IDS.has('WV1024078')).toBe(true);
    const chunks = buildDmrDateChunks(3, 3, new Date('2026-07-01T00:00:00Z'));
    expect(chunks.length).toBeGreaterThanOrEqual(12);
  });

  it('builds effluent chart URLs with p_start_date and p_end_date', () => {
    const url = buildEffluentChartUrl(
      'https://echodata.epa.gov/echo',
      'WV1024078',
      new Date(2025, 0, 1),
      new Date(2025, 2, 31),
    );
    expect(url).toContain('p_start_date=01/01/2025');
    expect(url).toContain('p_end_date=03/31/2025');
    expect(url).toContain('p_id=WV1024078');
  });
});

describe('slice3 echo discrepancy rerun migration', () => {
  it('defines detect-discrepancies-echo job wrapper', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260703040000_slice3_echo_discrepancy_rerun.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('run_detect_discrepancies_echo_job');
    expect(sql).toContain('detect-discrepancies-echo');
    expect(sql).toContain('detect-discrepancies');
  });
});

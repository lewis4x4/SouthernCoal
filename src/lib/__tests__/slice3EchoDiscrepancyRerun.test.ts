import {
  bisectDmrDateChunk,
  buildDmrDateChunks,
  buildEffluentChartUrl,
  dmrDateWindowDays,
  formatEchoDate,
  HEAVY_DMR_NPDES_IDS,
  HEAVY_DMR_PARAMETER_CODES,
  resolveDmrChunkMonths,
  resolveHeavyDmrParameterCodes,
} from '../../../supabase/functions/_shared/echo-dmr-sync.ts';
import { describe, expect, it } from 'vitest';

describe('echo DMR date-range chunking', () => {
  it('formats EPA dates as MM/DD/YYYY', () => {
    expect(formatEchoDate(new Date('2026-01-15T12:00:00Z'))).toBe('01/15/2026');
  });

  it('builds monthly chunks for heavy permits', () => {
    expect(resolveDmrChunkMonths('WV1024078')).toBe(1);
    expect(HEAVY_DMR_NPDES_IDS.has('WV1024078')).toBe(true);
    const chunks = buildDmrDateChunks(3, 1, new Date('2026-07-01T00:00:00Z'));
    expect(chunks.length).toBeGreaterThanOrEqual(36);
  });

  it('resolves parameter-sliced fallback codes for WV1024078', () => {
    expect(HEAVY_DMR_PARAMETER_CODES.WV1024078).toContain('00530');
    expect(resolveHeavyDmrParameterCodes('WV1024078')).toContain('00400');
    expect(resolveHeavyDmrParameterCodes('WV1024078', [' 00530 ', '00530', '50050'])).toEqual([
      '00530',
      '50050',
    ]);
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

  it('bisects retry-failed windows down to smaller date ranges', () => {
    const split = bisectDmrDateChunk({
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31),
    });
    expect(split).not.toBeNull();
    expect(split?.[0].start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(split?.[0].end.toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(split?.[1].start.toISOString().slice(0, 10)).toBe('2026-01-16');
    expect(split?.[1].end.toISOString().slice(0, 10)).toBe('2026-01-31');
    expect(dmrDateWindowDays(split![0]) + dmrDateWindowDays(split![1])).toBe(31);
  });

  it('does not split a one-day window', () => {
    expect(
      bisectDmrDateChunk({
        start: new Date(2026, 0, 1),
        end: new Date(2026, 0, 1, 23, 59, 59),
      }),
    ).toBeNull();
  });

  it('builds parameter-specific effluent chart URLs', () => {
    const url = buildEffluentChartUrl(
      'https://echodata.epa.gov/echo',
      'WV1024078',
      new Date(2026, 0, 1),
      new Date(2026, 0, 31),
      { parameterCode: '00530' },
    );
    expect(url).toContain('parameter_code=00530');
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

describe('slice3 echo batch detect migration', () => {
  it('defines batch job wrapper for per-NPDES loop', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sql = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../supabase/migrations/20260703070000_slice3_echo_batch_detect.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('run_detect_discrepancies_echo_batch_job');
    expect(sql).toContain('detect-discrepancies-echo-batch');
  });
});

describe('sync-echo-data WV1024078 heavy permit fallback', () => {
  it('keeps targeted detect and parameter failure metadata wired', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(import.meta.dirname, '../../../supabase/functions/sync-echo-data/index.ts'),
      'utf8',
    );
    expect(source).toContain('dmr_parameter_codes');
    expect(source).toContain('dmr_parameter_failures');
    expect(source).toContain('dmr_bad_windows');
    expect(source).toContain('dmr_window_results');
    expect(source).toContain('syncDmrWindowWithBisection');
    expect(source).toContain('target_npdes_ids: permits.map((permit) => permit.npdes_id)');
  });
});

describe('WV1024078 sync artifact script', () => {
  it('writes bad-window and imported-row artifact sections', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(import.meta.dirname, '../../../scripts/slice3-wv1024078-sync.mjs'),
      'utf8',
    );
    expect(source).toContain('## EPA window outcomes');
    expect(source).toContain('## Bad EPA windows');
    expect(source).toContain('rows_imported');
    expect(source).toContain('slice3-wv1024078-sync-windows');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSamplingObligationLedger } from '@/lib/samplingObligationLedger';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260702180000_sampling_obligation_ledger.sql',
);

describe('sampling obligation ledger migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('defines get_sampling_obligation_ledger RPC', () => {
    expect(sql).toContain('get_sampling_obligation_ledger');
    expect(sql).toContain('sampling_calendar_has_lab_result');
    expect(sql).toContain('sampling_calendar_is_documented_excuse');
    expect(sql).toContain('DRAFT — partial obligation calendar');
  });

  it('classifies obligation statuses', () => {
    expect(sql).toContain("'fulfilled'");
    expect(sql).toContain("'excused'");
    expect(sql).toContain("'missed'");
    expect(sql).toContain("'at_risk'");
    expect(sql).toContain("'upcoming'");
  });

  it('grants authenticated execute', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION get_sampling_obligation_ledger');
  });
});

describe('parseSamplingObligationLedger', () => {
  it('parses summary payload', () => {
    const parsed = parseSamplingObligationLedger({
      organization_id: 'org-1',
      disclaimer: 'DRAFT test',
      coverage: {
        active_schedules: 2,
        distinct_outfalls: 1,
        distinct_parameters: 2,
        calendar_events: 4,
        matrix_rows: 0,
        matrix_loaded: false,
      },
      status_counts: { fulfilled: 0, excused: 1, missed: 1, at_risk: 1, upcoming: 1 },
      rows: [
        {
          calendar_id: 'cal-1',
          scheduled_date: '2026-06-10',
          effective_due: '2026-06-10',
          obligation_status: 'missed',
          days_late: 21,
          outfall_number: '001',
          parameter_short_name: 'pH',
        },
      ],
    });

    expect(parsed?.status_counts.missed).toBe(1);
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.coverage.matrix_loaded).toBe(false);
  });

  it('returns error envelope', () => {
    const parsed = parseSamplingObligationLedger({ error: 'Organization context required' });
    expect(parsed?.error).toBe('Organization context required');
    expect(parsed?.rows).toEqual([]);
  });
});

export type ObligationStatus = 'fulfilled' | 'excused' | 'missed' | 'at_risk' | 'upcoming';

export interface SamplingObligationRow {
  calendar_id: string;
  scheduled_date: string;
  effective_due: string;
  calendar_status: string | null;
  dispatch_status: string | null;
  outfall_number: string | null;
  parameter_short_name: string | null;
  permit_number: string | null;
  schedule_source: string | null;
  frequency_code: string | null;
  obligation_status: ObligationStatus;
  days_late: number;
}

export interface SamplingObligationLedger {
  organization_id?: string;
  computed_at?: string;
  disclaimer: string;
  coverage: {
    active_schedules: number;
    distinct_outfalls: number;
    distinct_parameters: number;
    calendar_events: number;
    matrix_rows: number;
    matrix_loaded: boolean;
  };
  status_counts: Record<ObligationStatus, number>;
  rows: SamplingObligationRow[];
  error?: string;
}

export const OBLIGATION_STATUS_LABELS: Record<ObligationStatus, string> = {
  fulfilled: 'Fulfilled',
  excused: 'Excused',
  missed: 'Missed',
  at_risk: 'At risk',
  upcoming: 'Upcoming',
};

export function parseSamplingObligationLedger(raw: unknown): SamplingObligationLedger | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (obj.error) {
    return {
      disclaimer:
        'DRAFT — partial obligation calendar; fills incrementally as Sampling Matrix and Upload Dashboard populate permits/outfalls',
      coverage: {
        active_schedules: 0,
        distinct_outfalls: 0,
        distinct_parameters: 0,
        calendar_events: 0,
        matrix_rows: 0,
        matrix_loaded: false,
      },
      status_counts: {
        fulfilled: 0,
        excused: 0,
        missed: 0,
        at_risk: 0,
        upcoming: 0,
      },
      rows: [],
      error: String(obj.error),
    };
  }

  const coverage = (obj.coverage as SamplingObligationLedger['coverage']) ?? {
    active_schedules: 0,
    distinct_outfalls: 0,
    distinct_parameters: 0,
    calendar_events: 0,
    matrix_rows: 0,
    matrix_loaded: false,
  };

  const statusRaw = (obj.status_counts as Record<string, number>) ?? {};
  const status_counts: SamplingObligationLedger['status_counts'] = {
    fulfilled: statusRaw.fulfilled ?? 0,
    excused: statusRaw.excused ?? 0,
    missed: statusRaw.missed ?? 0,
    at_risk: statusRaw.at_risk ?? 0,
    upcoming: statusRaw.upcoming ?? 0,
  };

  const rows = Array.isArray(obj.rows) ? (obj.rows as SamplingObligationRow[]) : [];

  return {
    organization_id: obj.organization_id as string | undefined,
    computed_at: obj.computed_at as string | undefined,
    disclaimer: String(
      obj.disclaimer ??
        'DRAFT — partial obligation calendar; fills incrementally as Sampling Matrix and Upload Dashboard populate permits/outfalls',
    ),
    coverage,
    status_counts,
    rows,
  };
}

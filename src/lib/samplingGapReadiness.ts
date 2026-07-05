export type SamplingGapReadinessState = 'configured' | 'draft' | 'empty' | 'not_configured';

export interface SamplingGapLatestRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'completed' | 'failed';
  source: 'scheduled' | 'manual';
  calendars_scanned: number;
  gaps_opened: number;
  gaps_updated: number;
  gaps_resolved: number;
  error_message: string | null;
}

export interface SamplingGapReadiness {
  state: SamplingGapReadinessState;
  organization_id?: string;
  active_schedules: number;
  matrix_rows: number;
  manual_schedules: number;
  calendar_events: number;
  matrix_loaded: boolean;
  open_gaps: number;
  missed: number;
  at_risk: number;
  latest_run: SamplingGapLatestRun | null;
  disclaimer: string;
  error?: string;
}

export const DEFAULT_SAMPLING_GAP_READINESS: SamplingGapReadiness = {
  state: 'not_configured',
  active_schedules: 0,
  matrix_rows: 0,
  manual_schedules: 0,
  calendar_events: 0,
  matrix_loaded: false,
  open_gaps: 0,
  missed: 0,
  at_risk: 0,
  latest_run: null,
  disclaimer: 'DRAFT - Sampling Matrix dependent detector',
};

const READINESS_STATES = new Set<SamplingGapReadinessState>([
  'configured',
  'draft',
  'empty',
  'not_configured',
]);

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseLatestRun(raw: unknown): SamplingGapLatestRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string') return null;

  return {
    id: obj.id,
    started_at: typeof obj.started_at === 'string' ? obj.started_at : '',
    finished_at: typeof obj.finished_at === 'string' ? obj.finished_at : null,
    status:
      obj.status === 'running' || obj.status === 'completed' || obj.status === 'failed'
        ? obj.status
        : 'completed',
    source: obj.source === 'manual' ? 'manual' : 'scheduled',
    calendars_scanned: asNumber(obj.calendars_scanned),
    gaps_opened: asNumber(obj.gaps_opened),
    gaps_updated: asNumber(obj.gaps_updated),
    gaps_resolved: asNumber(obj.gaps_resolved),
    error_message: typeof obj.error_message === 'string' ? obj.error_message : null,
  };
}

export function parseSamplingGapReadiness(raw: unknown): SamplingGapReadiness {
  if (!raw || typeof raw !== 'object') return DEFAULT_SAMPLING_GAP_READINESS;
  const obj = raw as Record<string, unknown>;
  const rawState = typeof obj.state === 'string' ? obj.state : 'not_configured';
  const state = READINESS_STATES.has(rawState as SamplingGapReadinessState)
    ? (rawState as SamplingGapReadinessState)
    : 'not_configured';

  return {
    state,
    organization_id: typeof obj.organization_id === 'string' ? obj.organization_id : undefined,
    active_schedules: asNumber(obj.active_schedules),
    matrix_rows: asNumber(obj.matrix_rows),
    manual_schedules: asNumber(obj.manual_schedules),
    calendar_events: asNumber(obj.calendar_events),
    matrix_loaded: Boolean(obj.matrix_loaded),
    open_gaps: asNumber(obj.open_gaps),
    missed: asNumber(obj.missed),
    at_risk: asNumber(obj.at_risk),
    latest_run: parseLatestRun(obj.latest_run),
    disclaimer: String(obj.disclaimer ?? DEFAULT_SAMPLING_GAP_READINESS.disclaimer),
    error: typeof obj.error === 'string' ? obj.error : undefined,
  };
}

export function samplingGapReadinessLabel(state: SamplingGapReadinessState): string {
  switch (state) {
    case 'configured':
      return 'Configured';
    case 'draft':
      return 'Draft calendar';
    case 'empty':
      return 'Calendar empty';
    case 'not_configured':
      return 'Not configured';
  }
}

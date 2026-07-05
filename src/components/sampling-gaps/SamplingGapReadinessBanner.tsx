import { AlertTriangle, CalendarDays, CheckCircle2, Database } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  samplingGapReadinessLabel,
  type SamplingGapReadiness,
  type SamplingGapReadinessState,
} from '@/lib/samplingGapReadiness';

const STATE_TONE: Record<SamplingGapReadinessState, string> = {
  configured: 'border-qo-sage/25 bg-qo-sage/10 text-qo-sage-text',
  draft: 'border-qo-ochre/30 bg-qo-ochre/10 text-qo-ochre-text',
  empty: 'border-qo-accent/25 bg-qo-accent/10 text-qo-accent',
  not_configured: 'border-black/[0.08] bg-black/[0.03] text-text-muted',
};

const STATE_ICON = {
  configured: CheckCircle2,
  draft: AlertTriangle,
  empty: CalendarDays,
  not_configured: Database,
};

function readinessMessage(readiness: SamplingGapReadiness): string {
  switch (readiness.state) {
    case 'configured':
      return 'Sampling Matrix schedules are loaded; nightly runs scan the generated calendar.';
    case 'draft':
      return 'Sampling Matrix rows are not loaded; detector is scanning manual or synthetic schedules only.';
    case 'empty':
      return 'Schedules exist, but no calendar rows are present yet; the next run generates the active window before scanning.';
    case 'not_configured':
      return 'No active schedules or calendar rows are loaded for this organization.';
  }
}

interface Props {
  readiness: SamplingGapReadiness;
  loading?: boolean;
}

export function SamplingGapReadinessBanner({ readiness, loading = false }: Props) {
  const Icon = STATE_ICON[readiness.state];

  return (
    <div className={cn('rounded-lg border px-4 py-3', STATE_TONE[readiness.state])}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">
              {loading ? 'Checking detector state' : samplingGapReadinessLabel(readiness.state)}
            </p>
            <p className="mt-1 text-xs">{readiness.error ?? readinessMessage(readiness)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right text-[10px] uppercase tracking-wide">
          <div>
            <p className="text-text-muted">Schedules</p>
            <p className="text-sm font-semibold tabular-nums text-text-primary">
              {loading ? '-' : readiness.active_schedules}
            </p>
          </div>
          <div>
            <p className="text-text-muted">Matrix</p>
            <p className="text-sm font-semibold tabular-nums text-text-primary">
              {loading ? '-' : readiness.matrix_rows}
            </p>
          </div>
          <div>
            <p className="text-text-muted">Calendar</p>
            <p className="text-sm font-semibold tabular-nums text-text-primary">
              {loading ? '-' : readiness.calendar_events}
            </p>
          </div>
        </div>
      </div>
      {readiness.latest_run && (
        <p className="mt-2 text-[10px] text-text-muted">
          Last run {readiness.latest_run.status}: {readiness.latest_run.calendars_scanned} scanned,{' '}
          {readiness.latest_run.gaps_opened} opened, {readiness.latest_run.gaps_resolved} resolved
        </p>
      )}
    </div>
  );
}

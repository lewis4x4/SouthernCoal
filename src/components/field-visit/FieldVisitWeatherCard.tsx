import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';

export type FieldVisitWeatherCardProps = {
  visitLocked: boolean;
  visitStarted: boolean;
  fetchEnabled: boolean;
  isOnline: boolean;
  /** Effective coordinates used for the last or next system fetch (for transparency). */
  coordinateSummary: string | null;
  systemWeather: { summary: string; fetchedAtIso: string } | null;
  systemLoading: boolean;
  systemError: string | null;
  observedSiteConditions: string;
  onObservedChange: (value: string) => void;
  onRefreshSystem: () => void;
  onApplySystemToObserved: () => void;
};

/**
 * System weather (Open-Meteo) + observed site conditions. Persisted as one column via `formatWeatherForPersistence`.
 */
export function FieldVisitWeatherCard({
  visitLocked,
  visitStarted,
  fetchEnabled,
  isOnline,
  coordinateSummary,
  systemWeather,
  systemLoading,
  systemError,
  observedSiteConditions,
  onObservedChange,
  onRefreshSystem,
  onApplySystemToObserved,
}: FieldVisitWeatherCardProps) {
  const showSystemSection = fetchEnabled && visitStarted && !visitLocked;
  const canLoadWeatherAfterStart = fetchEnabled && !visitStarted && !visitLocked;

  return (
    <div
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
      role="region"
      aria-label="Weather and site conditions"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
            Weather and site conditions
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            <span className="font-medium text-cyan-200/90">System weather</span> is pulled from Open-Meteo at your
            start GPS when you start the visit and are online (reference only).{' '}
            <span className="font-medium text-text-primary">Observed at site</span> is what you see at the outlet —
            always review and supplement.
          </p>
        </div>
        {showSystemSection ? (
          <button
            type="button"
            disabled={visitLocked || systemLoading || !isOnline}
            onClick={() => onRefreshSystem()}
            className={cn(
              'inline-flex min-h-12 items-center gap-2 rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 text-sm font-medium text-sky-100 transition-colors hover:bg-sky-500/20 active:bg-sky-500/25 disabled:opacity-50',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', systemLoading && 'animate-spin')} aria-hidden />
            Refresh system weather
          </button>
        ) : null}
      </div>

      {!fetchEnabled ? (
        <p className="mt-3 text-xs text-text-muted">
          Automated weather fetch is turned off (build flag). Record observed conditions only.
        </p>
      ) : null}

      {canLoadWeatherAfterStart ? (
        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3 text-sm text-cyan-100">
          System weather will load automatically after you press <span className="font-medium">Start visit &amp; continue</span>.
          Capture start GPS first so the request uses the correct coordinates.
        </div>
      ) : null}

      {showSystemSection ? (
        <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            {systemError ? (
              <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
            ) : (
              <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-200/85">System weather</p>
              {coordinateSummary ? (
                <p className="mt-1 text-xs text-text-muted">Using start coordinates {coordinateSummary}</p>
              ) : null}
              {systemLoading ? (
                <p className="mt-2 text-sm text-text-secondary">Fetching current conditions…</p>
              ) : systemError ? (
                <p className="mt-2 text-sm text-amber-100/95">{systemError}</p>
              ) : systemWeather ? (
                <>
                  <p className="mt-2 text-sm text-text-primary">{systemWeather.summary}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Retrieved {new Date(systemWeather.fetchedAtIso).toLocaleString()}
                  </p>
                  <button
                    type="button"
                    disabled={visitLocked}
                    onClick={onApplySystemToObserved}
                    className="mt-3 min-h-12 rounded-2xl border border-sky-400/35 bg-sky-500/15 px-4 text-sm font-medium text-sky-50 transition-colors hover:bg-sky-500/25 active:bg-sky-500/30 disabled:opacity-50"
                  >
                    Insert system line into observed notes
                  </button>
                </>
              ) : (
                <p className="mt-2 text-sm text-text-muted">No system snapshot yet — use Refresh or continue offline.</p>
              )}
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            Weather data by{' '}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-200/90 underline decoration-sky-400/40 underline-offset-2 hover:text-sky-100"
            >
              Open-Meteo
            </a>
            . Independent verification is required before any regulatory reliance.
          </p>
        </div>
      ) : !visitStarted ? (
        <p className="mt-3 text-xs text-text-muted">
          Start the visit with GPS to load the system weather snapshot for this stop.
        </p>
      ) : null}

      <label className="mt-5 block space-y-2">
        <span className="text-sm font-medium text-text-muted">
          Observed at site
        </span>
        <textarea
          value={observedSiteConditions}
          onChange={(e) => onObservedChange(e.target.value)}
          disabled={visitLocked}
          rows={3}
          placeholder="e.g. Light rain at parking area; dry channel at discharge point; wind from NW."
          className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-base text-text-primary outline-none"
        />
      </label>
    </div>
  );
}

import { useState } from 'react';
import { MapPin, Navigation, ChevronDown, Cloud, CloudOff, Loader2, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface FieldVisitStartStepProps {
  startLatitude: string;
  startLongitude: string;
  onStartLatitudeChange: (value: string) => void;
  onStartLongitudeChange: (value: string) => void;
  onCaptureStartCoords: () => void;
  visitStarted: boolean;
  visitLocked: boolean;
  outfallMapsHref: string;
  scheduledParameter?: ReactNode;
  scheduleInstructions?: ReactNode;
  hasCoordinates: boolean;
  weatherSummary: string | null;
  weatherLoading: boolean;
  weatherError: string | null;
  observedSiteConditions: string;
  onObservedChange: (value: string) => void;
}

export function FieldVisitStartStep({
  startLatitude,
  startLongitude,
  onStartLatitudeChange,
  onStartLongitudeChange,
  onCaptureStartCoords,
  visitStarted,
  visitLocked,
  outfallMapsHref,
  scheduledParameter,
  scheduleInstructions,
  hasCoordinates,
  weatherSummary,
  weatherLoading,
  weatherError,
  observedSiteConditions,
  onObservedChange,
}: FieldVisitStartStepProps) {
  const [manualEntryOpen, setManualEntryOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* GPS section */}
      {!hasCoordinates ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            type="button"
            onClick={onCaptureStartCoords}
            disabled={visitLocked}
            className="inline-flex h-16 w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-cyan-500/20 text-lg font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30 active:bg-cyan-500/40 disabled:opacity-60"
          >
            <MapPin className="h-6 w-6" aria-hidden />
            Capture GPS
          </button>
          {outfallMapsHref ? (
            <a
              href={outfallMapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-cyan-300/70 transition-colors hover:text-cyan-200"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Open in Maps
            </a>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          <span className="min-w-0 text-sm text-emerald-100">
            {Number(startLatitude).toFixed(5)}, {Number(startLongitude).toFixed(5)}
          </span>
          <button
            type="button"
            onClick={onCaptureStartCoords}
            disabled={visitLocked}
            className="ml-auto shrink-0 text-xs font-medium text-emerald-300/70 transition-colors hover:text-emerald-200 disabled:opacity-60"
          >
            Recapture
          </button>
        </div>
      )}

      {/* Manual entry disclosure */}
      <button
        type="button"
        onClick={() => setManualEntryOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${manualEntryOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
        Manual entry
      </button>
      {manualEntryOpen && (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1" htmlFor="field-visit-start-lat">
            <span className="text-xs text-text-muted">Latitude</span>
            <input
              id="field-visit-start-lat"
              name="field-visit-start-lat"
              inputMode="decimal"
              autoComplete="off"
              value={startLatitude}
              onChange={(event) => onStartLatitudeChange(event.target.value)}
              disabled={visitLocked}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none disabled:opacity-60"
            />
          </label>
          <label className="space-y-1" htmlFor="field-visit-start-lng">
            <span className="text-xs text-text-muted">Longitude</span>
            <input
              id="field-visit-start-lng"
              name="field-visit-start-lng"
              inputMode="decimal"
              autoComplete="off"
              value={startLongitude}
              onChange={(event) => onStartLongitudeChange(event.target.value)}
              disabled={visitLocked}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none disabled:opacity-60"
            />
          </label>
        </div>
      )}

      {/* Scheduled parameter / instructions */}
      {scheduledParameter}
      {scheduleInstructions}

      {/* Weather status (compact inline) */}
      {hasCoordinates && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          {weatherLoading ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" aria-hidden />
              <span className="text-sm text-text-muted">Loading weather…</span>
            </>
          ) : weatherError ? (
            <>
              <CloudOff className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              <span className="text-sm text-amber-200/80">Weather unavailable — note conditions manually</span>
            </>
          ) : weatherSummary ? (
            <>
              <Cloud className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
              <span className="text-sm text-text-primary">{weatherSummary}</span>
            </>
          ) : null}
        </div>
      )}

      {/* Observed conditions — only after visit started */}
      {visitStarted && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-muted">Observed conditions (optional)</span>
          <textarea
            value={observedSiteConditions}
            onChange={(event) => onObservedChange(event.target.value)}
            disabled={visitLocked}
            rows={2}
            placeholder="e.g. Light rain, muddy access road, moderate flow"
            className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-text-primary placeholder:text-text-muted/50 outline-none disabled:opacity-60"
          />
        </label>
      )}
    </div>
  );
}

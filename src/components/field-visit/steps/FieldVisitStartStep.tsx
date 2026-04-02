import { MapPin, Navigation } from 'lucide-react';
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
  syncGuidance?: ReactNode;
  weatherCard: ReactNode;
  scheduledParameter?: ReactNode;
  scheduleInstructions?: ReactNode;
  sameOutfallWarning?: ReactNode;
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
  syncGuidance,
  weatherCard,
  scheduledParameter,
  scheduleInstructions,
  sameOutfallWarning,
}: FieldVisitStartStepProps) {
  return (
    <div className="space-y-4">
      {syncGuidance}
      {scheduledParameter}
      {scheduleInstructions}
      {sameOutfallWarning}

      <div className="grid gap-4">
        <label className="space-y-2" htmlFor="field-visit-start-lat">
          <span className="text-sm font-medium text-text-muted">Start latitude</span>
          <input
            id="field-visit-start-lat"
            name="field-visit-start-lat"
            inputMode="decimal"
            autoComplete="off"
            value={startLatitude}
            onChange={(event) => onStartLatitudeChange(event.target.value)}
            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-base text-text-primary outline-none"
          />
        </label>
        <label className="space-y-2" htmlFor="field-visit-start-lng">
          <span className="text-sm font-medium text-text-muted">Start longitude</span>
          <input
            id="field-visit-start-lng"
            name="field-visit-start-lng"
            inputMode="decimal"
            autoComplete="off"
            value={startLongitude}
            onChange={(event) => onStartLongitudeChange(event.target.value)}
            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-base text-text-primary outline-none"
          />
        </label>
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={onCaptureStartCoords}
          disabled={visitLocked}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-base font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary active:bg-white/[0.1] disabled:opacity-60"
        >
          <MapPin className="h-5 w-5" aria-hidden />
          Capture start GPS
        </button>
        {outfallMapsHref ? (
          <a
            href={outfallMapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 px-4 text-base font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 active:bg-cyan-500/25"
          >
            <Navigation className="h-5 w-5" aria-hidden />
            Open stop in maps
          </a>
        ) : null}
      </div>

      {!visitStarted ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Capture GPS first, then start the visit. System weather loads after start.
        </div>
      ) : null}

      {weatherCard}

      {visitStarted ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Visit started. Continue to outlet inspection when ready.
        </div>
      ) : null}
    </div>
  );
}

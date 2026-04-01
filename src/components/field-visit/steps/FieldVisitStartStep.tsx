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
}: FieldVisitStartStepProps) {
  return (
    <div className="space-y-5">
      {syncGuidance}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2" htmlFor="field-visit-start-lat">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Start latitude</span>
          <input
            id="field-visit-start-lat"
            name="field-visit-start-lat"
            inputMode="decimal"
            autoComplete="off"
            value={startLatitude}
            onChange={(event) => onStartLatitudeChange(event.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          />
        </label>
        <label className="space-y-2" htmlFor="field-visit-start-lng">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Start longitude</span>
          <input
            id="field-visit-start-lng"
            name="field-visit-start-lng"
            inputMode="decimal"
            autoComplete="off"
            value={startLongitude}
            onChange={(event) => onStartLongitudeChange(event.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCaptureStartCoords}
          disabled={visitLocked}
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary disabled:opacity-60"
        >
          <MapPin className="h-4 w-4" aria-hidden />
          Capture start GPS
        </button>
        {outfallMapsHref ? (
          <a
            href={outfallMapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20"
          >
            <Navigation className="h-4 w-4" aria-hidden />
            Open stop in maps
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-4 text-sm text-text-secondary">
        {visitStarted
          ? 'This visit is already started on this device. You can review or adjust weather and observed conditions before moving on.'
          : 'Start GPS is the anchor for the field record. Capture it first, then start the visit. System weather is pulled after the visit start succeeds.'}
      </div>

      {weatherCard}

      {visitStarted ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Visit started. Continue into the outlet inspection when you are ready.
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          The wizard stays in draft mode until you explicitly start the visit.
        </div>
      )}
    </div>
  );
}

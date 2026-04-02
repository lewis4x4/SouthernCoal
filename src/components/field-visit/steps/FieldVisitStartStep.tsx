import { Cloud, CloudOff, Loader2, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';

interface FieldVisitStartStepProps {
  samplerFirstName: string;
  outfallNumber: string;
  permitNumber: string;
  outfallLatitude: number | null;
  outfallLongitude: number | null;
  visitDate: string;
  onConfirm: () => void;
  onDecline: () => void;
  visitStarted: boolean;
  visitLocked: boolean;
  saving: boolean;
  scheduledParameter?: ReactNode;
  scheduleInstructions?: ReactNode;
  weatherSummary: string | null;
  weatherLoading: boolean;
  weatherError: string | null;
  observedSiteConditions: string;
  onObservedChange: (value: string) => void;
}

export function FieldVisitStartStep({
  samplerFirstName,
  outfallNumber,
  permitNumber,
  outfallLatitude,
  outfallLongitude,
  visitDate,
  onConfirm,
  onDecline,
  visitStarted,
  visitLocked,
  saving,
  scheduledParameter,
  scheduleInstructions,
  weatherSummary,
  weatherLoading,
  weatherError,
  observedSiteConditions,
  onObservedChange,
}: FieldVisitStartStepProps) {
  const hasCoords = outfallLatitude != null && outfallLongitude != null;

  if (!visitStarted) {
    return (
      <div className="flex flex-col items-center px-2 py-6 text-center">
        <h2 className="text-xl font-semibold text-text-primary">
          Welcome, {samplerFirstName}
        </h2>

        <p className="mt-5 text-sm text-text-muted">Are you at the following outfall?</p>

        <div className="mt-4 w-full max-w-sm space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-left">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
            <div>
              <p className="text-base font-semibold text-text-primary">{outfallNumber}</p>
              <p className="text-sm text-text-secondary">{permitNumber}</p>
            </div>
          </div>

          {hasCoords && (
            <p className="text-sm text-text-muted">
              {outfallLatitude.toFixed(5)}, {outfallLongitude.toFixed(5)}
            </p>
          )}

          {!hasCoords && (
            <p className="text-sm text-amber-200/80">
              No coordinates on file for this outfall — contact your manager.
            </p>
          )}

          <p className="text-sm text-text-secondary">{visitDate}</p>
        </div>

        {scheduledParameter && <div className="mt-4 w-full max-w-sm text-left">{scheduledParameter}</div>}
        {scheduleInstructions && <div className="mt-3 w-full max-w-sm text-left">{scheduleInstructions}</div>}

        <button
          type="button"
          onClick={onConfirm}
          disabled={visitLocked || !hasCoords || saving}
          className="mt-8 min-h-14 w-full max-w-sm rounded-2xl bg-cyan-500/20 text-base font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30 active:bg-cyan-500/40 disabled:opacity-60"
        >
          {saving ? 'Starting…' : 'Continue'}
        </button>

        <button
          type="button"
          onClick={onDecline}
          className="mt-3 min-h-12 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] text-base font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
        >
          No, go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <MapPin className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
        <span className="text-sm text-text-primary">
          {outfallNumber} — {hasCoords ? `${outfallLatitude!.toFixed(5)}, ${outfallLongitude!.toFixed(5)}` : 'No coordinates'}
        </span>
      </div>

      {scheduledParameter}
      {scheduleInstructions}

      <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
        {weatherLoading ? (
          <>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" aria-hidden />
            <span className="text-sm text-text-muted">Loading weather…</span>
          </>
        ) : weatherError ? (
          <>
            <CloudOff className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <span className="text-sm text-amber-200/80">Weather queued — will load when back online</span>
          </>
        ) : weatherSummary ? (
          <>
            <Cloud className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
            <span className="text-sm text-text-primary">{weatherSummary}</span>
          </>
        ) : null}
      </div>

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
    </div>
  );
}

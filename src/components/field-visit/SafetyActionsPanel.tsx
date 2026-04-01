import { AlertTriangle, ShieldAlert, UserRound } from 'lucide-react';

interface SafetyActionsPanelProps {
  disabled?: boolean;
  onRouteSafetyHazard: () => void;
  onFlagUnsafeToProceed: () => void;
  onRecordLoneWorkerEscalation: () => void;
}

export function SafetyActionsPanel({
  disabled = false,
  onRouteSafetyHazard,
  onFlagUnsafeToProceed,
  onRecordLoneWorkerEscalation,
}: SafetyActionsPanelProps) {
  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-rose-200" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-100">
          Safety actions
        </h3>
      </div>
      <p className="mt-2 text-sm text-rose-50/90">
        Use these actions when the stop needs to be treated as a safety problem, not just a normal form path.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onRouteSafetyHazard}
          className="rounded-xl border border-rose-500/25 bg-black/10 px-4 py-4 text-left transition-colors hover:bg-rose-500/10 disabled:opacity-60"
        >
          <AlertTriangle className="h-4 w-4 text-rose-200" aria-hidden />
          <div className="mt-3 text-sm font-medium text-text-primary">Route as safety hazard</div>
          <div className="mt-2 text-sm text-text-secondary">
            Switch the visit into the access-issue hazard path and jump to the required narrative.
          </div>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onFlagUnsafeToProceed}
          className="rounded-xl border border-rose-500/25 bg-black/10 px-4 py-4 text-left transition-colors hover:bg-rose-500/10 disabled:opacity-60"
        >
          <ShieldAlert className="h-4 w-4 text-rose-200" aria-hidden />
          <div className="mt-3 text-sm font-medium text-text-primary">Unsafe-to-proceed note</div>
          <div className="mt-2 text-sm text-text-secondary">
            Append a safety hold note so the record clearly shows why sampling stopped.
          </div>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onRecordLoneWorkerEscalation}
          className="rounded-xl border border-rose-500/25 bg-black/10 px-4 py-4 text-left transition-colors hover:bg-rose-500/10 disabled:opacity-60"
        >
          <UserRound className="h-4 w-4 text-rose-200" aria-hidden />
          <div className="mt-3 text-sm font-medium text-text-primary">Lone-worker escalation</div>
          <div className="mt-2 text-sm text-text-secondary">
            Append a lone-worker escalation note for later supervisor review.
          </div>
        </button>
      </div>
    </div>
  );
}

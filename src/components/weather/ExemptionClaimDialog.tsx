import { useState, useCallback } from 'react';
import { X, Shield, Info } from 'lucide-react';

interface ExemptionClaimDialogProps {
  eventId: string;
  rainfallInches: number;
  isOpen: boolean;
  onClose: () => void;
  onClaim: (data: {
    eventId: string;
    recurrenceInterval: number;
    justification: string;
  }) => Promise<void>;
}

const MIN_JUSTIFICATION_LENGTH = 50;

export function ExemptionClaimDialog({
  eventId,
  rainfallInches,
  isOpen,
  onClose,
  onClaim,
}: ExemptionClaimDialogProps) {
  const [recurrenceInterval, setRecurrenceInterval] = useState<string>('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedJustification = justification.trim();
  const intervalNum = Number(recurrenceInterval);
  const isValid =
    recurrenceInterval !== '' &&
    !isNaN(intervalNum) &&
    intervalNum >= 10 &&
    trimmedJustification.length >= MIN_JUSTIFICATION_LENGTH;

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onClaim({
        eventId,
        recurrenceInterval: intervalNum,
        justification: trimmedJustification,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit exemption claim');
    } finally {
      setSubmitting(false);
    }
  }, [eventId, intervalNum, trimmedJustification, isValid, onClaim, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-crystal-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg bg-gradient-to-br from-violet-600 to-violet-500 p-2">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Claim Exemption</h2>
              <p className="mt-0.5 text-sm text-text-muted">
                {rainfallInches}" recorded rainfall
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info box */}
        <div className="mb-5 flex gap-3 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3">
          <Info className="h-5 w-5 shrink-0 text-sky-400" />
          <div className="text-sm text-sky-300">
            <p>
              Exemptions apply for storms exceeding the <strong>10-year recurrence interval</strong> (24-hour
              duration) as defined in the NPDES permit.
            </p>
            <p className="mt-1.5 text-sky-400/80">
              Reference NOAA Atlas 14 for recurrence interval calculations
            </p>
          </div>
        </div>

        {/* Recurrence Interval */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Recurrence interval (years) <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            min={10}
            step={1}
            value={recurrenceInterval}
            onChange={(e) => setRecurrenceInterval(e.target.value)}
            placeholder="Minimum 10-year storm"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-sky-500/50"
          />
          {recurrenceInterval !== '' && intervalNum < 10 && (
            <p className="mt-1 text-xs text-red-400">
              Must be at least 10-year recurrence interval
            </p>
          )}
        </div>

        {/* Justification */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Justification <span className="text-red-400">*</span>
            <span className="ml-2 text-xs text-text-muted">
              ({trimmedJustification.length}/{MIN_JUSTIFICATION_LENGTH} min characters)
            </span>
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={4}
            placeholder="Provide detailed justification including rainfall data source, storm classification, and basis for the recurrence interval determination."
            className={`w-full rounded-lg border px-3 py-2.5 text-sm text-text-primary outline-none transition-colors ${
              trimmedJustification.length > 0 && trimmedJustification.length < MIN_JUSTIFICATION_LENGTH
                ? 'border-red-500/50 bg-red-500/5'
                : 'border-white/[0.08] bg-white/[0.04] focus:border-sky-500/50'
            }`}
          />
          {trimmedJustification.length > 0 && trimmedJustification.length < MIN_JUSTIFICATION_LENGTH && (
            <p className="mt-1 text-xs text-red-400">
              {MIN_JUSTIFICATION_LENGTH - trimmedJustification.length} more characters required
            </p>
          )}
        </div>

        {/* 48-hour note */}
        <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-300">
            Note: You must provide sampling proof within 48 hours of the rain event to support this
            exemption claim. Failure to provide evidence may result in automatic denial.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="mb-4 text-sm text-red-400">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Submitting...' : 'Submit Exemption Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}

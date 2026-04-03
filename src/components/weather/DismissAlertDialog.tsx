import { useState, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { DISMISS_REASON_OPTIONS } from '@/types/weather';
import type { DismissReasonCode } from '@/types/weather';

interface DismissAlertDialogProps {
  eventId: string;
  rainfallInches: number;
  stationName: string;
  isOpen: boolean;
  onClose: () => void;
  onDismiss: (eventId: string, reasonCode: DismissReasonCode, justification: string) => Promise<void>;
}

const MIN_JUSTIFICATION_LENGTH = 50;

export function DismissAlertDialog({
  eventId,
  rainfallInches,
  stationName,
  isOpen,
  onClose,
  onDismiss,
}: DismissAlertDialogProps) {
  const [reasonCode, setReasonCode] = useState<DismissReasonCode | ''>('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedJustification = justification.trim();
  const isValid = reasonCode !== '' && trimmedJustification.length >= MIN_JUSTIFICATION_LENGTH;

  const handleSubmit = useCallback(async () => {
    if (!isValid || !reasonCode) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDismiss(eventId, reasonCode, trimmedJustification);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss alert');
    } finally {
      setSubmitting(false);
    }
  }, [eventId, reasonCode, trimmedJustification, isValid, onDismiss, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-crystal-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Dismiss Rain Event Alert</h2>
            <p className="mt-1 text-sm text-text-muted">
              {rainfallInches}" recorded at {stationName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conservative default warning */}
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            When in doubt, sample. The cost of an unnecessary sample is trivial compared to a missed
            event under the Consent Decree.
          </p>
        </div>

        {/* Reason Code */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Reason for dismissal <span className="text-red-400">*</span>
          </label>
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as DismissReasonCode)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-sky-500/50"
          >
            <option value="">Select a reason...</option>
            {DISMISS_REASON_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label} — {opt.description}
              </option>
            ))}
          </select>
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
            placeholder="Provide detailed justification for dismissing this alert. Must include enough detail for a third party to understand the basis for dismissal."
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
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Dismissing...' : 'Dismiss Alert'}
          </button>
        </div>
      </div>
    </div>
  );
}

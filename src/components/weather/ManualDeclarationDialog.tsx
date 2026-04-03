import { useState, useCallback } from 'react';
import { X, CloudRain, Upload } from 'lucide-react';
import { MANUAL_TRIGGER_REASON_OPTIONS } from '@/types/weather';
import type { ManualTriggerReasonCode } from '@/types/weather';

interface ManualDeclarationData {
  reasonCode: ManualTriggerReasonCode;
  justification: string;
  rainfallInches: number;
  weatherStationId: string;
  evidenceFiles: File[];
}

interface ManualDeclarationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDeclare: (data: ManualDeclarationData) => Promise<void>;
  stations: { id: string; station_name: string }[];
}

const MIN_JUSTIFICATION_LENGTH = 50;

export function ManualDeclarationDialog({
  isOpen,
  onClose,
  onDeclare,
  stations,
}: ManualDeclarationDialogProps) {
  const [reasonCode, setReasonCode] = useState<ManualTriggerReasonCode | ''>('');
  const [justification, setJustification] = useState('');
  const [rainfallInches, setRainfallInches] = useState('');
  const [stationId, setStationId] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedJustification = justification.trim();
  const rainfallNum = parseFloat(rainfallInches);
  const isValid =
    reasonCode !== '' &&
    trimmedJustification.length >= MIN_JUSTIFICATION_LENGTH &&
    !isNaN(rainfallNum) &&
    rainfallNum > 0 &&
    stationId !== '';

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setEvidenceFiles(Array.from(files));
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isValid || !reasonCode) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDeclare({
        reasonCode,
        justification: trimmedJustification,
        rainfallInches: rainfallNum,
        weatherStationId: stationId,
        evidenceFiles,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to declare rain event');
    } finally {
      setSubmitting(false);
    }
  }, [reasonCode, trimmedJustification, rainfallNum, stationId, evidenceFiles, isValid, onDeclare, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-crystal-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg bg-gradient-to-br from-sky-600 to-sky-500 p-2">
              <CloudRain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Declare Rain Event</h2>
              <p className="text-sm text-text-muted">Manual event without automated threshold trigger</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Station */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Weather Station <span className="text-red-400">*</span>
            </label>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-sky-500/50"
            >
              <option value="">Select station...</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.station_name}</option>
              ))}
            </select>
          </div>

          {/* Rainfall Amount */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Rainfall Amount (inches) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={rainfallInches}
              onChange={(e) => setRainfallInches(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-sky-500/50"
            />
          </div>

          {/* Reason Code */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Declaration Reason <span className="text-red-400">*</span>
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ManualTriggerReasonCode)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-sky-500/50"
            >
              <option value="">Select a reason...</option>
              {MANUAL_TRIGGER_REASON_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>

          {/* Justification */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Justification <span className="text-red-400">*</span>
              <span className="ml-2 text-xs text-text-muted">
                ({trimmedJustification.length}/{MIN_JUSTIFICATION_LENGTH} min)
              </span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Explain what evidence the declaration is based on..."
              className={`w-full rounded-lg border px-3 py-2.5 text-sm text-text-primary outline-none ${
                trimmedJustification.length > 0 && trimmedJustification.length < MIN_JUSTIFICATION_LENGTH
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-white/[0.08] bg-white/[0.04] focus:border-sky-500/50'
              }`}
            />
          </div>

          {/* Evidence Upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Supporting Evidence
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/[0.20] hover:bg-white/[0.04]">
              <Upload className="h-4 w-4 text-text-muted" />
              <span className="text-sm text-text-muted">
                {evidenceFiles.length > 0
                  ? `${evidenceFiles.length} file(s) selected`
                  : 'Upload gauge readings, radar screenshots, field photos'}
              </span>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.tiff"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Declaring...' : 'Declare Rain Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

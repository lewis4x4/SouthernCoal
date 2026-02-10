import { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useDataCorrections } from '@/hooks/useDataCorrections';
import { useAuditLog } from '@/hooks/useAuditLog';
import { ENTITY_TYPE_LABELS } from '@/types/corrections';
import type { DataCorrection } from '@/types/corrections';

interface CorrectionRequestModalProps {
  entityType: DataCorrection['entity_type'];
  entityId: string;
  fieldName: string;
  currentValue: unknown;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * Reusable modal for requesting a data correction.
 * Two-person rule: requester cannot approve their own correction.
 * Wire into any entity detail view:
 *   <CorrectionRequestModal entityType="lab_result" entityId={id} fieldName="value" currentValue={123} onClose={...} />
 */
export function CorrectionRequestModal({
  entityType,
  entityId,
  fieldName,
  currentValue,
  onClose,
  onSubmitted,
}: CorrectionRequestModalProps) {
  const { requestCorrection } = useDataCorrections();
  const { log } = useAuditLog();
  const [proposedValue, setProposedValue] = useState('');
  const [justification, setJustification] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = proposedValue.trim().length > 0 && justification.trim().length >= 20;

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);

    let evidencePath: string | undefined;

    // Upload evidence file if provided
    if (evidenceFile) {
      const ext = evidenceFile.name.split('.').pop() ?? 'pdf';
      const path = `corrections/${entityType}/${entityId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('other')
        .upload(path, evidenceFile, { contentType: evidenceFile.type, upsert: false });

      if (uploadError) {
        toast.error('Failed to upload supporting evidence');
        setSubmitting(false);
        return;
      }

      evidencePath = path;
      log('evidence_uploaded', { entity_type: entityType, entity_id: entityId, file_name: evidenceFile.name }, {
        module: 'corrections',
        tableName: 'data_corrections',
      });
    }

    // Parse proposed value — try JSON first, fall back to string
    let parsedValue: unknown = proposedValue;
    try {
      parsedValue = JSON.parse(proposedValue);
    } catch {
      // Keep as string
    }

    const result = await requestCorrection({
      entityType,
      entityId,
      fieldName,
      originalValue: currentValue,
      proposedValue: parsedValue,
      justification,
      evidencePath,
    });

    setSubmitting(false);

    if (!result.error) {
      onSubmitted?.();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-crystal-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Request Data Correction</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {ENTITY_TYPE_LABELS[entityType]} &middot; Field: <span className="font-mono text-purple-400">{fieldName}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-white/[0.05]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Current value (read-only) */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-text-muted">Current Value</label>
            <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-2.5 font-mono text-xs text-text-secondary">
              {JSON.stringify(currentValue)}
            </div>
          </div>

          {/* Proposed value */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-text-muted">Proposed Value</label>
            <input
              type="text"
              value={proposedValue}
              onChange={e => setProposedValue(e.target.value)}
              placeholder="Enter the corrected value"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-white/[0.15]"
            />
          </div>

          {/* Justification */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-text-muted">
              Justification <span className="text-text-muted">(min 20 chars)</span>
            </label>
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Explain why this correction is needed — reference lab reports, field notes, or permit conditions..."
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-white/[0.15]"
            />
            <div className={cn(
              'mt-0.5 text-right text-[10px]',
              justification.length >= 20 ? 'text-emerald-400' : 'text-text-muted',
            )}>
              {justification.length}/20
            </div>
          </div>

          {/* Evidence upload */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-text-muted">
              Supporting Evidence <span className="text-text-muted">(optional)</span>
            </label>
            {evidenceFile ? (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                <span className="text-xs text-text-secondary">{evidenceFile.name}</span>
                <button onClick={() => setEvidenceFile(null)} className="text-text-muted hover:text-red-400">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/[0.1] bg-white/[0.01] px-3 py-3 text-xs text-text-muted transition-colors hover:border-white/[0.15] hover:bg-white/[0.03]">
                <Upload size={14} />
                <span>Upload PDF, PNG, or JPEG</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={e => setEvidenceFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-white/[0.05]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={cn(
              'rounded-lg px-4 py-2 text-xs font-medium transition-colors',
              isValid && !submitting
                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'cursor-not-allowed bg-white/[0.03] text-text-muted',
            )}
          >
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

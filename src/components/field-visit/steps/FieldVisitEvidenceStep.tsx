import { Camera } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FieldVisitOutcome } from '@/types';

interface FieldVisitEvidenceStepProps {
  outcome: FieldVisitOutcome;
  totalPhotoCount: number;
  pendingPhotoCount: number;
  syncedPhotoCount: number;
  requiredPrompt: string;
  focusPrompts?: ReactNode;
  evidenceContent: ReactNode;
}

export function FieldVisitEvidenceStep({
  outcome,
  totalPhotoCount,
  pendingPhotoCount,
  syncedPhotoCount,
  requiredPrompt,
  focusPrompts,
  evidenceContent,
}: FieldVisitEvidenceStepProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-cyan-300" aria-hidden />
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
            Structured evidence
          </h3>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          Evidence stays in its own step so the operator can focus on capturing the right proof without rereading the whole visit.
        </p>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Uploaded</div>
            <div className="mt-2 text-lg font-semibold text-text-primary">{syncedPhotoCount}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Pending sync</div>
            <div className="mt-2 text-lg font-semibold text-text-primary">{pendingPhotoCount}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Outcome path</div>
            <div className="mt-2 text-sm font-medium text-text-primary">{outcome.replace(/_/g, ' ')}</div>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {requiredPrompt}
        </div>
      </div>

      {focusPrompts}
      {evidenceContent}

      {totalPhotoCount === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-black/10 px-4 py-4 text-sm text-text-muted">
          No evidence is attached yet for this visit.
        </div>
      ) : null}
    </div>
  );
}

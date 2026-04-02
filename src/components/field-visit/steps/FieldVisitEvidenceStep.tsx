import { Camera } from 'lucide-react';
import type { ReactNode } from 'react';

interface FieldVisitEvidenceStepProps {
  totalPhotoCount: number;
  pendingPhotoCount: number;
  syncedPhotoCount: number;
  requiredPrompt: string;
  focusPrompts?: ReactNode;
  evidenceContent: ReactNode;
}

export function FieldVisitEvidenceStep({
  totalPhotoCount,
  pendingPhotoCount,
  syncedPhotoCount,
  requiredPrompt,
  focusPrompts,
  evidenceContent,
}: FieldVisitEvidenceStepProps) {
  return (
    <div className="space-y-4">
      {/* Stats line + required prompt — compact */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-text-muted">{syncedPhotoCount} uploaded</span>
        {pendingPhotoCount > 0 ? (
          <span className="text-amber-200">{pendingPhotoCount} pending</span>
        ) : null}
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        {requiredPrompt}
      </div>

      {focusPrompts}

      {/* Evidence capture + photo buckets — camera-first */}
      {evidenceContent}

      {totalPhotoCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.1] bg-black/10 px-4 py-6 text-center text-sm text-text-muted">
          <Camera className="mx-auto mb-2 h-6 w-6 text-text-muted/60" aria-hidden />
          No evidence attached yet.
        </div>
      ) : null}
    </div>
  );
}

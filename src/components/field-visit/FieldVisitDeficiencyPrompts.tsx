import { AlertTriangle, Camera } from 'lucide-react';
import type { FieldVisitDeficiencyPrompt } from '@/lib/fieldVisitDeficiencyPrompts';

interface FieldVisitDeficiencyPromptsProps {
  prompts: FieldVisitDeficiencyPrompt[];
  disabled?: boolean;
  onCaptureRequiredPhoto: (note: string) => void;
}

export function FieldVisitDeficiencyPrompts({
  prompts,
  disabled = false,
  onCaptureRequiredPhoto,
}: FieldVisitDeficiencyPromptsProps) {
  if (prompts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-qo-ochre/25 bg-qo-ochre/10 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-qo-ochre" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-qo-ochre-text">
          Capture before you continue
        </h3>
      </div>
      <p className="mt-2 text-sm text-qo-ochre-text">
        These outlet conditions need photo evidence while you are still on the stop.
      </p>

      <div className="mt-4 space-y-3">
        {prompts.map((prompt) => (
          <div key={prompt.id} className="rounded-xl border border-amber-500/20 bg-black/10 px-4 py-4">
            <div className="text-sm font-medium text-text-primary">{prompt.title}</div>
            <div className="mt-2 text-sm leading-6 text-text-secondary">{prompt.body}</div>
            {prompt.needsPhotoBucket ? (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onCaptureRequiredPhoto(prompt.suggestedNote)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-qo-ochre/30 bg-qo-ochre/15 px-4 py-3 text-sm font-medium text-qo-ochre-text transition-colors hover:bg-qo-ochre/25 disabled:opacity-60 sm:w-auto"
                >
                  <Camera className="h-4 w-4" aria-hidden />
                  Take required photo
                </button>
                <div className="text-xs text-qo-ochre-text/90">
                  This opens Evidence with the correct photo bucket selected and adds a follow-up note for review.
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

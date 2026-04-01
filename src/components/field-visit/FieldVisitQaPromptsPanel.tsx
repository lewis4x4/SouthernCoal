import { FlaskConical, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FieldVisitPhotoCategory } from '@/types';
import type { FieldVisitQaPrompt } from '@/lib/fieldVisitQaPrompts';

interface FieldVisitQaPromptsPanelProps {
  prompts: FieldVisitQaPrompt[];
  disabled?: boolean;
  onAppendNote: (note: string) => void;
  onFocusBucket: (bucket: FieldVisitPhotoCategory) => void;
}

function toneClasses(tone: FieldVisitQaPrompt['tone']) {
  return tone === 'warning'
    ? 'border-amber-500/20 bg-amber-500/10 text-amber-100'
    : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100';
}

function bucketButtonLabel(bucket: FieldVisitPhotoCategory) {
  switch (bucket) {
    case 'sample_containers':
      return 'Focus sample-container evidence';
    case 'site_weather':
      return 'Focus site/weather evidence';
    default:
      return 'Focus outlet evidence';
  }
}

export function FieldVisitQaPromptsPanel({
  prompts,
  disabled = false,
  onAppendNote,
  onFocusBucket,
}: FieldVisitQaPromptsPanelProps) {
  if (prompts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
          QA prompts
        </h3>
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        These prompts tighten duplicate, QA, and special-handling execution before the visit is completed.
      </p>

      <div className="mt-4 space-y-3">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className={cn('rounded-xl border px-4 py-4 text-sm', toneClasses(prompt.tone))}
          >
            <div className="flex items-start gap-3">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{prompt.title}</div>
                <div className="mt-1 text-sm/6 opacity-90">{prompt.body}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAppendNote(prompt.noteTemplate)}
                    className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-current transition-colors hover:bg-white/15 disabled:opacity-60"
                  >
                    Append QA note
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onFocusBucket(prompt.focusBucket)}
                    className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-50 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
                  >
                    {bucketButtonLabel(prompt.focusBucket)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

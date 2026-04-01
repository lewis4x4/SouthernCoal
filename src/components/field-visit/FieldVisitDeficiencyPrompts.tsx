import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { governanceIssuesInboxHref, FIELD_HANDOFF_GOVERNANCE_INBOX } from '@/lib/governanceInboxNav';
import type { FieldVisitDeficiencyPrompt } from '@/lib/fieldVisitDeficiencyPrompts';

interface FieldVisitDeficiencyPromptsProps {
  prompts: FieldVisitDeficiencyPrompt[];
  disabled?: boolean;
  onSetDeficiencyBucket: () => void;
  onAppendFollowUpNote: (note: string) => void;
}

export function FieldVisitDeficiencyPrompts({
  prompts,
  disabled = false,
  onSetDeficiencyBucket,
  onAppendFollowUpNote,
}: FieldVisitDeficiencyPromptsProps) {
  if (prompts.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-200" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">
          Follow-up prompts
        </h3>
      </div>
      <p className="mt-2 text-sm text-amber-50/90">
        Inspection conditions suggest possible deficiencies or review actions. Capture them while you are still on the stop.
      </p>

      <div className="mt-4 space-y-3">
        {prompts.map((prompt) => (
          <div key={prompt.id} className="rounded-xl border border-amber-500/20 bg-black/10 px-4 py-4">
            <div className="text-sm font-medium text-text-primary">{prompt.title}</div>
            <div className="mt-2 text-sm leading-6 text-text-secondary">{prompt.body}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {prompt.needsPhotoBucket ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onSetDeficiencyBucket}
                  className="rounded-lg border border-amber-500/35 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/25 disabled:opacity-60"
                >
                  Set photo bucket to obstruction / deficiency
                </button>
              ) : null}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAppendFollowUpNote(prompt.suggestedNote)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:opacity-60"
              >
                Append follow-up note
              </button>
              <a
                href={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20"
              >
                Open governance inbox
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

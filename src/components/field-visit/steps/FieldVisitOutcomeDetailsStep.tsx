import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { FieldVisitOutcome } from '@/types';
import { FieldVisitOutcomePanel } from '@/components/field-visit/FieldVisitOutcomePanel';

export interface FieldVisitOutcomeHelperSection {
  id: string;
  label: string;
  content: ReactNode;
}

interface FieldVisitOutcomeDetailsStepProps {
  outcome: FieldVisitOutcome;
  outcomeContent: ReactNode;
  helperSections?: FieldVisitOutcomeHelperSection[];
}

export function FieldVisitOutcomeDetailsStep({
  outcome,
  outcomeContent,
  helperSections = [],
}: FieldVisitOutcomeDetailsStepProps) {
  const [openHelperId, setOpenHelperId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <FieldVisitOutcomePanel
        outcome={outcome}
        content={outcomeContent}
      />

      {helperSections.length > 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Need help with this stop?
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Open only the helper you need. Guidance stays compact so the outcome task stays clear on mobile.
          </p>

          <div className="mt-4 space-y-2">
            {helperSections.map((section) => {
              const isOpen = openHelperId === section.id;
              return (
                <div key={section.id} className="rounded-xl border border-white/[0.06] bg-black/10">
                  <button
                    type="button"
                    onClick={() => setOpenHelperId(isOpen ? null : section.id)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-medium text-text-primary">{section.label}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-text-muted" aria-hidden />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-muted" aria-hidden />
                    )}
                  </button>
                  {isOpen ? <div className="border-t border-white/[0.06] px-4 py-4">{section.content}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

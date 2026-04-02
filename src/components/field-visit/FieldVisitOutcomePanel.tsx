import type { ReactNode } from 'react';
import { Package, ShieldAlert, Wind } from 'lucide-react';
import type { FieldVisitOutcome } from '@/types';

interface FieldVisitOutcomePanelProps {
  outcome: FieldVisitOutcome;
  content: ReactNode;
}

const OUTCOME_META = {
  sample_collected: {
    icon: Package,
    title: 'Sample collected',
    description: 'Finish custody and field-only readings for this stop.',
  },
  no_discharge: {
    icon: Wind,
    title: 'No discharge',
    description: 'Capture the no-flow narrative and only the details needed to support it.',
  },
  access_issue: {
    icon: ShieldAlert,
    title: 'Access issue',
    description: 'Capture the access problem, what was attempted, and the follow-up context.',
  },
} as const;

export function FieldVisitOutcomePanel({
  outcome,
  content,
}: FieldVisitOutcomePanelProps) {
  const meta = OUTCOME_META[outcome];
  const Icon = meta.icon;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5">
            <Icon className="h-5 w-5 text-cyan-200" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Outcome details</p>
            <h3 className="mt-2 text-lg font-semibold text-text-primary">{meta.title}</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{meta.description}</p>
          </div>
        </div>
      </div>

      {content}
    </div>
  );
}

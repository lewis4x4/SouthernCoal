import { CloudRain, Package, ShieldAlert, Wind } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FieldVisitOutcome } from '@/types';

interface FieldVisitOutcomeStepProps {
  outcome: FieldVisitOutcome;
  visitLocked: boolean;
  potentialForceMajeure: boolean;
  onOutcomeSelect: (outcome: FieldVisitOutcome) => void;
}

const OUTCOME_CHOICES: Array<{
  value: FieldVisitOutcome;
  label: string;
  copy: string;
  icon: typeof Package;
}> = [
  {
    value: 'sample_collected',
    label: 'Sample collected',
    copy: 'Custody-aware path for collected samples, field readings, and QA.',
    icon: Package,
  },
  {
    value: 'no_discharge',
    label: 'No discharge',
    copy: 'Defensible narrative and evidence when no discharge observed.',
    icon: Wind,
  },
  {
    value: 'access_issue',
    label: 'Access issue',
    copy: 'Blocked, unsafe, or otherwise prevented sampling.',
    icon: ShieldAlert,
  },
];

export function FieldVisitOutcomeStep({
  outcome,
  visitLocked,
  potentialForceMajeure,
  onOutcomeSelect,
}: FieldVisitOutcomeStepProps) {
  return (
    <div className="space-y-4">
      {potentialForceMajeure ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <CloudRain className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden />
          Force majeure flagged. Choose the outcome first, then document in the next step.
        </div>
      ) : null}

      <div className="grid gap-3">
        {OUTCOME_CHOICES.map((choice) => {
          const selected = choice.value === outcome;
          const Icon = choice.icon;
          return (
            <button
              key={choice.value}
              type="button"
              disabled={visitLocked}
              onClick={() => onOutcomeSelect(choice.value)}
              className={cn(
                'flex min-h-[72px] items-center gap-4 rounded-2xl border px-5 text-left transition-colors active:bg-white/[0.08]',
                selected
                  ? 'border-cyan-400/35 bg-cyan-500/12'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
              )}
            >
              <Icon className="h-5 w-5 shrink-0 text-cyan-200" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-text-primary">{choice.label}</div>
                <div className="mt-0.5 text-sm text-text-secondary">{choice.copy}</div>
              </div>
              {selected ? (
                <span className="shrink-0 rounded-full bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100">
                  Selected
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

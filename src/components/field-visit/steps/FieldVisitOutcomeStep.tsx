import { AlertTriangle, CloudRain, Package, ShieldAlert, Wind } from 'lucide-react';
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
    copy: 'Use the custody-aware path for collected samples, required field readings, and QA handling.',
    icon: Package,
  },
  {
    value: 'no_discharge',
    label: 'No discharge',
    copy: 'Use when the sample point had no discharge and the outcome needs a defensible narrative plus evidence.',
    icon: Wind,
  },
  {
    value: 'access_issue',
    label: 'Access issue',
    copy: 'Use when access was blocked, unsafe, or otherwise prevented sampling at the stop.',
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
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden />
          Force majeure is already flagged on this visit. Choose the operational outcome first, then document the deadline/evidence context in the next step.
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-3">
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
                'rounded-2xl border px-4 py-5 text-left transition-colors',
                selected
                  ? 'border-cyan-400/35 bg-cyan-500/12'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-cyan-200" aria-hidden />
                <div className="text-sm font-semibold text-text-primary">{choice.label}</div>
              </div>
              <div className="mt-3 text-sm leading-6 text-text-secondary">{choice.copy}</div>
              {selected ? (
                <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  Selected
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-text-secondary">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
          Pick the outcome that matches what actually happened at the sample point. The wizard will hide the unrelated fields after this choice.
        </div>
      </div>
    </div>
  );
}

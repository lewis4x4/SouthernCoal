import { CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FieldVisitWizardStepId } from '@/lib/fieldVisitWizard';

export interface FieldVisitWizardProgressStep {
  id: FieldVisitWizardStepId;
  label: string;
  description: string;
  status: 'current' | 'complete' | 'upcoming';
}

interface FieldVisitWizardProgressProps {
  activeStep: FieldVisitWizardStepId;
  steps: FieldVisitWizardProgressStep[];
  onStepSelect: (stepId: FieldVisitWizardStepId) => void;
}

export function FieldVisitWizardProgress({
  activeStep,
  steps,
  onStepSelect,
}: FieldVisitWizardProgressProps) {
  return (
    <nav
      aria-label="Field visit wizard progress"
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3"
    >
      <ol className="grid gap-2 lg:grid-cols-6">
        {steps.map((step, index) => {
          const isActive = activeStep === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onStepSelect(step.id)}
                className={cn(
                  'flex h-full w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  isActive
                    ? 'border-cyan-400/35 bg-cyan-500/12'
                    : step.status === 'complete'
                      ? 'border-emerald-500/20 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    step.status === 'complete'
                      ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                      : isActive
                        ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/[0.08] bg-white/[0.03] text-text-muted',
                  )}
                >
                  {step.status === 'complete' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Step {index + 1}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-text-primary">{step.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-text-secondary">{step.description}</span>
                </span>
                {isActive ? <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-cyan-200" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

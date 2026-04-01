import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type FieldVisitStepId =
  | 'start_visit'
  | 'confirm_location'
  | 'inspection'
  | 'choose_outcome'
  | 'outcome_details'
  | 'review_complete';

export type FieldVisitStepStatus = 'current' | 'complete' | 'attention';

export interface FieldVisitStepItem {
  id: FieldVisitStepId;
  label: string;
  description: string;
  status: FieldVisitStepStatus;
  recommended?: boolean;
}

interface FieldVisitStepperProps {
  activeStep: FieldVisitStepId;
  steps: FieldVisitStepItem[];
  onStepSelect: (stepId: FieldVisitStepId) => void;
}

function StepIcon({ status, index }: { status: FieldVisitStepStatus; index: number }) {
  if (status === 'complete') {
    return <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden />;
  }

  if (status === 'attention') {
    return <AlertTriangle className="h-5 w-5 text-amber-200" aria-hidden />;
  }

  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/15 text-xs font-semibold text-cyan-100">
      {index + 1}
    </span>
  );
}

export function FieldVisitStepper({
  activeStep,
  steps,
  onStepSelect,
}: FieldVisitStepperProps) {
  return (
    <nav
      className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3"
      aria-label="Field visit workflow steps"
    >
      <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
        {steps.map((step, index) => {
          const isActive = step.id === activeStep;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onStepSelect(step.id)}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex h-full w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  isActive
                    ? 'border-cyan-400/35 bg-cyan-500/12'
                    : step.status === 'complete'
                      ? 'border-emerald-500/20 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
                )}
              >
                <StepIcon status={step.status} index={index} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Step {index + 1}
                    {step.recommended ? (
                      <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] tracking-[0.24em] text-cyan-100">
                        Next
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm font-medium text-text-primary">{step.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-text-secondary">{step.description}</span>
                </span>
                {isActive ? (
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

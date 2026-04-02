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
    <nav aria-label="Field visit wizard progress" className="flex items-center justify-center gap-2">
      {steps.map((step) => {
        const isCurrent = step.id === activeStep;
        const canNavigate = step.status === 'complete' || isCurrent;
        return (
          <button
            key={step.id}
            type="button"
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={step.label}
            onClick={() => canNavigate && onStepSelect(step.id)}
            className={cn(
              'rounded-full transition-all',
              isCurrent
                ? 'h-3 w-3 bg-cyan-400'
                : step.status === 'complete'
                  ? 'h-2.5 w-2.5 bg-emerald-400 hover:bg-emerald-300'
                  : 'h-2.5 w-2.5 bg-white/20',
              canNavigate ? 'cursor-pointer' : 'cursor-default',
            )}
          />
        );
      })}
    </nav>
  );
}

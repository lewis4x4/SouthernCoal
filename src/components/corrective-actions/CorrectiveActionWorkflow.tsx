import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_LABELS,
  STEP_REQUIRED_FIELDS,
  type CorrectiveAction,
  type WorkflowStep,
  isOverdue,
  getDaysOverdue,
} from '@/types/corrective-actions';
import { useWorkflowTransition } from '@/hooks/useWorkflowTransition';

interface CorrectiveActionWorkflowProps {
  action: CorrectiveAction;
  onStepClick?: (step: WorkflowStep) => void;
  className?: string;
}

/**
 * 7-step vertical workflow stepper for corrective actions.
 * Shows completed, current, and future steps with validation status.
 */
export function CorrectiveActionWorkflow({
  action,
  onStepClick,
  className,
}: CorrectiveActionWorkflowProps) {
  const { isStepComplete, isCurrentStep, getStepValidation } =
    useWorkflowTransition();

  const currentStepIndex = WORKFLOW_STEPS.indexOf(action.workflow_step);

  return (
    <div className={cn('space-y-1', className)}>
      {WORKFLOW_STEPS.map((step, index) => {
        const isComplete = isStepComplete(action, step);
        const isCurrent = isCurrentStep(action, step);
        const isFuture = index > currentStepIndex;
        const validation = getStepValidation(action, step);

        return (
          <div key={step} className="relative">
            {/* Connector line */}
            {index < WORKFLOW_STEPS.length - 1 && (
              <div
                className={cn(
                  'absolute left-[15px] top-8 w-0.5 h-[calc(100%-16px)]',
                  isComplete
                    ? 'bg-emerald-500/40'
                    : isCurrent
                      ? 'bg-gradient-to-b from-cyan-500/40 to-border-subtle'
                      : 'bg-border-subtle'
                )}
              />
            )}

            {/* Step row */}
            <button
              onClick={() => onStepClick?.(step)}
              disabled={isFuture && action.status !== 'closed'}
              className={cn(
                'relative flex items-start gap-3 w-full p-2 rounded-lg text-left transition-all',
                'hover:bg-white/[0.02]',
                isCurrent && 'bg-cyan-500/[0.05] border border-cyan-500/20',
                !isFuture && 'cursor-pointer',
                isFuture && 'opacity-50 cursor-not-allowed'
              )}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <StepIcon
                  isComplete={isComplete}
                  isCurrent={isCurrent}
                  hasErrors={!validation.valid && isCurrent}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isComplete && 'text-emerald-400',
                      isCurrent && 'text-cyan-400',
                      isFuture && 'text-text-muted'
                    )}
                  >
                    {WORKFLOW_STEP_LABELS[step]}
                  </span>
                  {isComplete && (
                    <span className="text-[10px] text-emerald-400/60 uppercase tracking-wider">
                      Complete
                    </span>
                  )}
                </div>

                {/* Validation checklist for current step */}
                {isCurrent && (
                  <StepValidation
                    action={action}
                    step={step}
                  />
                )}

                {/* Completed step summary */}
                {isComplete && (
                  <div className="text-xs text-text-muted mt-0.5">
                    {getStepSummary(action, step)}
                  </div>
                )}
              </div>
            </button>
          </div>
        );
      })}

      {/* Due date warning */}
      {isOverdue(action) && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <div className="text-sm">
            <span className="text-red-400 font-medium">
              Overdue by {getDaysOverdue(action)} days
            </span>
            <span className="text-text-muted ml-2">
              Due: {formatDate(action.due_date)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step Icon Component
// -----------------------------------------------------------------------------
interface StepIconProps {
  isComplete: boolean;
  isCurrent: boolean;
  hasErrors: boolean;
}

function StepIcon({ isComplete, isCurrent, hasErrors }: StepIconProps) {
  if (isComplete) {
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      </div>
    );
  }

  if (isCurrent) {
    return (
      <div
        className={cn(
          'relative w-8 h-8 rounded-full flex items-center justify-center',
          hasErrors
            ? 'bg-amber-500/20 border border-amber-500/30'
            : 'bg-cyan-500/20 border border-cyan-500/30'
        )}
      >
        {/* Pulsing dot */}
        <span
          className={cn(
            'absolute w-3 h-3 rounded-full animate-pulse',
            hasErrors ? 'bg-amber-400' : 'bg-cyan-400'
          )}
        />
        <span
          className={cn(
            'absolute w-3 h-3 rounded-full animate-ping opacity-30',
            hasErrors ? 'bg-amber-400' : 'bg-cyan-400'
          )}
        />
      </div>
    );
  }

  // Future step
  return (
    <div className="w-8 h-8 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center">
      <Circle className="h-4 w-4 text-text-muted" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step Validation Checklist
// -----------------------------------------------------------------------------
interface StepValidationProps {
  action: CorrectiveAction;
  step: WorkflowStep;
  validation: { valid: boolean; missing: string[] };
}

function StepValidation({ action, step }: Omit<StepValidationProps, 'validation'>) {
  const requiredFields = STEP_REQUIRED_FIELDS[step] || [];

  if (requiredFields.length === 0) {
    return (
      <div className="text-xs text-text-muted mt-1">
        No required fields for this step
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      {requiredFields.map((field) => {
        const value = action[field as keyof CorrectiveAction];
        const isFilled = value !== null && value !== undefined && value !== '';
        const label = formatFieldName(field);

        return (
          <div key={field} className="flex items-center gap-2 text-xs">
            {isFilled ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            ) : (
              <Circle className="h-3 w-3 text-text-muted" />
            )}
            <span
              className={cn(
                isFilled ? 'text-emerald-400' : 'text-text-muted'
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatFieldName(field: string): string {
  return field
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(date: string | null): string {
  if (!date) return 'Not set';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStepSummary(action: CorrectiveAction, step: WorkflowStep): string {
  switch (step) {
    case 'identification':
      return action.followup_assigned_to
        ? `Assigned to ${action.assigned_to_name || 'user'}`
        : 'Identified';
    case 'root_cause_analysis':
      return action.root_cause
        ? `${action.root_cause.substring(0, 50)}...`
        : 'Analyzed';
    case 'corrective_action_plan':
      return action.immediate_mitigation
        ? `${action.immediate_mitigation.substring(0, 50)}...`
        : 'Planned';
    case 'preventive_action':
      return action.preventive_action
        ? `${action.preventive_action.substring(0, 50)}...`
        : 'Prevention defined';
    case 'implementation':
      return action.completed_date
        ? `Completed: ${formatDate(action.completed_date)}`
        : 'Implemented';
    case 'verification':
      return action.verified_date
        ? `Verified: ${formatDate(action.verified_date)}`
        : 'Verified';
    case 'closure':
      return action.closed_date
        ? `Closed: ${formatDate(action.closed_date)}`
        : 'Closed';
    default:
      return '';
  }
}

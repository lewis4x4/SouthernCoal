import type { ReactNode } from 'react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';

interface WizardAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'success';
}

interface FieldVisitWizardShellProps {
  stepNumber: number;
  stepTitle: string;
  stepDescription: string;
  progress: ReactNode;
  children: ReactNode;
  backAction?: WizardAction | null;
  saveAction?: WizardAction | null;
  primaryAction?: WizardAction | null;
  stepMeta?: ReactNode;
}

function primaryActionClasses(variant: WizardAction['variant']) {
  switch (variant) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25';
    case 'default':
      return 'bg-white/[0.06] text-text-primary hover:bg-white/[0.1]';
    default:
      return 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25';
  }
}

export function FieldVisitWizardShell({
  stepNumber,
  stepTitle,
  stepDescription,
  progress,
  children,
  backAction = null,
  saveAction = null,
  primaryAction = null,
  stepMeta,
}: FieldVisitWizardShellProps) {
  return (
    <div className="space-y-4 pb-28 sm:pb-32">
      {progress}

      <SpotlightCard className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
              Step {stepNumber}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-text-primary sm:text-2xl">{stepTitle}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{stepDescription}</p>
          </div>
          {stepMeta ? <div className="shrink-0 self-start">{stepMeta}</div> : null}
        </div>

        <div className="mt-5">{children}</div>
      </SpotlightCard>

      {(backAction || saveAction || primaryAction) ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-crystal-surface/95 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur-xl sm:px-6"
          role="region"
          aria-label="Wizard step actions"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {backAction ? (
                <button
                  type="button"
                  onClick={backAction.onClick}
                  disabled={backAction.disabled}
                  className="min-h-12 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary disabled:opacity-60"
                >
                  {backAction.label}
                </button>
              ) : null}
              {saveAction ? (
                <button
                  type="button"
                  onClick={saveAction.onClick}
                  disabled={saveAction.disabled}
                  className={`min-h-12 rounded-xl px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60 ${primaryActionClasses(saveAction.variant)}`}
                >
                  {saveAction.label}
                </button>
              ) : null}
            </div>
            {primaryAction ? (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className={`min-h-12 w-full rounded-xl px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60 sm:w-auto sm:min-w-[220px] ${primaryActionClasses(primaryAction.variant)}`}
              >
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

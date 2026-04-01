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
  primaryAction = null,
  stepMeta,
}: FieldVisitWizardShellProps) {
  return (
    <div className="space-y-6">
      {progress}

      <SpotlightCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
              Step {stepNumber}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-text-primary">{stepTitle}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{stepDescription}</p>
          </div>
          {stepMeta ? <div className="shrink-0">{stepMeta}</div> : null}
        </div>

        <div className="mt-6">{children}</div>

        {(backAction || primaryAction) ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
            <div>
              {backAction ? (
                <button
                  type="button"
                  onClick={backAction.onClick}
                  disabled={backAction.disabled}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary disabled:opacity-60"
                >
                  {backAction.label}
                </button>
              ) : (
                <span />
              )}
            </div>
            {primaryAction ? (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${primaryActionClasses(primaryAction.variant)}`}
              >
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </SpotlightCard>
    </div>
  );
}

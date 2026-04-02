import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface WizardAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

export interface FieldVisitWizardShellProps {
  stepTitle: string;
  progress: ReactNode;
  children: ReactNode;
  fieldBar?: ReactNode;
  backAction?: WizardAction | null;
  saveAction?: WizardAction | null;
  primaryAction?: WizardAction | null;
  stepMeta?: ReactNode;
}

function actionClasses(variant: WizardAction['variant']) {
  switch (variant) {
    case 'success':
      return 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 active:bg-emerald-500/35';
    case 'warning':
      return 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 active:bg-amber-500/35';
    case 'default':
      return 'bg-white/[0.06] text-text-primary hover:bg-white/[0.1] active:bg-white/[0.14]';
    default:
      return 'bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 active:bg-cyan-500/35';
  }
}

export function FieldVisitWizardShell({
  stepTitle,
  progress,
  children,
  fieldBar,
  backAction = null,
  saveAction = null,
  primaryAction = null,
  stepMeta,
}: FieldVisitWizardShellProps) {
  const hasActions = backAction || saveAction || primaryAction;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Field bar: back, progress dots, status */}
      <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-crystal-surface/95 backdrop-blur-xl">
        <div className="flex h-11 items-center gap-3 px-3">
          {fieldBar}
          <div className="flex-1">{progress}</div>
          {stepMeta ? <div className="shrink-0">{stepMeta}</div> : null}
        </div>
      </div>

      {/* Step content — fills viewport, scrolls internally */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <h2 className="text-lg font-semibold text-text-primary">{stepTitle}</h2>
        <div className="mt-3">{children}</div>
      </div>

      {/* Action bar — pinned at bottom */}
      {hasActions ? (
        <div
          className="border-t border-white/[0.08] bg-crystal-surface/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-3 backdrop-blur-xl"
          role="region"
          aria-label="Wizard step actions"
        >
          <div className="flex items-center gap-2">
            {backAction ? (
              <button
                type="button"
                onClick={backAction.onClick}
                disabled={backAction.disabled}
                className="min-h-[52px] rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 text-base font-medium text-text-secondary transition-colors hover:bg-white/[0.06] active:bg-white/[0.1] disabled:opacity-60"
              >
                {backAction.label}
              </button>
            ) : null}
            {saveAction ? (
              <button
                type="button"
                onClick={saveAction.onClick}
                disabled={saveAction.disabled}
                className={cn(
                  'min-h-[52px] rounded-2xl px-5 text-base font-medium transition-colors disabled:opacity-60',
                  actionClasses(saveAction.variant),
                )}
              >
                {saveAction.label}
              </button>
            ) : null}
            {primaryAction ? (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className={cn(
                  'min-h-[52px] flex-1 rounded-2xl text-base font-semibold transition-colors disabled:opacity-60',
                  actionClasses(primaryAction.variant),
                )}
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

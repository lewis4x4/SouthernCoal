import { AlertTriangle, ArrowUpRight, Eye, Lock } from 'lucide-react';
import type { FieldVisitReviewHook } from '@/lib/fieldVisitReviewHooks';

interface FieldVisitReviewHooksPanelProps {
  hooks: FieldVisitReviewHook[];
  governanceInboxHref?: string | null;
  governanceDisabledReason?: string | null;
}

function toneClasses(tone: FieldVisitReviewHook['tone']) {
  switch (tone) {
    case 'critical':
      return 'border-qo-risk/25 bg-qo-risk/10 text-qo-risk';
    case 'warning':
      return 'border-qo-ochre/25 bg-qo-ochre/10 text-qo-ochre-text';
    default:
      return 'border-qo-accent/20 bg-qo-accent/10 text-qo-accent';
  }
}

export function FieldVisitReviewHooksPanel({
  hooks,
  governanceInboxHref,
  governanceDisabledReason,
}: FieldVisitReviewHooksPanelProps) {
  if (hooks.length === 0) return null;

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-qo-nested p-5">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-qo-accent" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
          Review-required markers
        </h3>
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        These do not always block completion, but they mark the visit for closer supervisor or governance review.
      </p>

      <div className="mt-4 space-y-3">
        {hooks.map((hook) => (
          <div key={hook.id} className={`rounded-xl border px-4 py-3 text-sm ${toneClasses(hook.tone)}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{hook.title}</div>
                <div className="mt-1 text-sm/6 opacity-90">{hook.body}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {governanceInboxHref ? (
        <a
          href={governanceInboxHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-qo-accent/25 bg-qo-accent/10 px-3 py-1.5 text-xs font-medium text-qo-accent transition-colors hover:bg-qo-accent/20"
        >
          Open governance inbox
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled
            title={governanceDisabledReason ?? 'Governance inbox is not available from this role.'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-1.5 text-xs font-medium text-text-muted opacity-70"
          >
            Open governance inbox
            <Lock className="h-3.5 w-3.5" aria-hidden />
          </button>
          {governanceDisabledReason ? (
            <div className="text-xs text-text-muted">{governanceDisabledReason}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

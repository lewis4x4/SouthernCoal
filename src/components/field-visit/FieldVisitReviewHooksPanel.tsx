import { AlertTriangle, ArrowUpRight, Eye } from 'lucide-react';
import { governanceIssuesInboxHref, FIELD_HANDOFF_GOVERNANCE_INBOX } from '@/lib/governanceInboxNav';
import type { FieldVisitReviewHook } from '@/lib/fieldVisitReviewHooks';

interface FieldVisitReviewHooksPanelProps {
  hooks: FieldVisitReviewHook[];
}

function toneClasses(tone: FieldVisitReviewHook['tone']) {
  switch (tone) {
    case 'critical':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-100';
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-100';
    default:
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100';
  }
}

export function FieldVisitReviewHooksPanel({
  hooks,
}: FieldVisitReviewHooksPanelProps) {
  if (hooks.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-cyan-300" aria-hidden />
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

      <a
        href={governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20"
      >
        Open governance inbox
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}

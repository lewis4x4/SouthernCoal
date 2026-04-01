import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  summarizeCompletionChecklist,
  type CompletionChecklistItem,
} from '@/lib/fieldVisitCompletionValidation';

interface FieldVisitRequiredChecklistProps {
  items: CompletionChecklistItem[];
}

export function FieldVisitRequiredChecklist({
  items,
}: FieldVisitRequiredChecklistProps) {
  const summary = summarizeCompletionChecklist(items);
  const orderedItems = [...items].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
            Completion Readiness
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {summary.blockerCount === 0
              ? 'Everything required for this outcome is in place.'
              : `${summary.blockerCount} item${summary.blockerCount === 1 ? '' : 's'} still need attention before completion.`}
          </p>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-text-primary">
          {summary.completedCount}/{summary.totalCount}
        </div>
      </div>

      {summary.blockerLabels.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/85">
            Primary blockers
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {summary.blockerLabels.slice(0, 3).map((label) => (
              <span
                key={label}
                className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-100"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2" aria-label="Completion requirements checklist">
        {orderedItems.map((item) => (
          <li key={item.id} className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-black/10 px-3 py-3">
            <span
              className={cn(
                'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                item.done
                  ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-500/35 bg-amber-500/10 text-amber-200',
              )}
            >
              {item.done ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
            <span className={item.done ? 'text-sm text-text-secondary' : 'text-sm text-amber-100'}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

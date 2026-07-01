import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { SameOutfallSameDayGroup } from '@/lib/fieldSameOutfallDay';

type Props = {
  groups: SameOutfallSameDayGroup[];
  /** Short label for where this warning appears, e.g. "Today's route" */
  contextLabel: string;
  /** If true, list each group's visit links; if false, summary only (for dense pages). */
  detailed?: boolean;
  /** Applied to the detailed list wrapper (e.g. max-h + scroll on the queue page). */
  detailListClassName?: string;
};

export function FieldSameOutfallDayWarning({
  groups,
  contextLabel,
  detailed = true,
  detailListClassName,
}: Props) {
  if (groups.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-qo-ochre/30 bg-qo-ochre/10 px-4 py-3 text-sm text-qo-ochre-text"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-qo-ochre" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-qo-ochre-text">
            Same outfall, same day — {groups.length} conflict{groups.length === 1 ? '' : 's'} ({contextLabel})
          </p>
          <p className="text-xs text-qo-ochre-text/90">
            Multiple field visits target the same outfall on the same scheduled date. Confirm dispatch intent
            before sampling; both records stay in the queue until resolved or completed.
          </p>
          {detailed ? (
            <ul
              className={`space-y-2 border-t border-qo-ochre/20 pt-2 text-xs text-qo-ochre-text/90 ${detailListClassName ?? ''}`}
            >
              {groups.map((g) => (
                <li key={`${g.scheduledDate}-${g.outfallId}`}>
                  <span className="font-medium text-qo-ochre-text">
                    {g.permitLabel ?? 'Permit'} / {g.outfallLabel ?? 'Outfall'}
                  </span>
                  <span className="text-text-muted"> · {g.scheduledDate}</span>
                  <span className="text-text-muted"> · {g.visits.length} visits</span>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {g.visits.map((v) => (
                      <Link
                        key={v.id}
                        to={`/field/visits/${v.id}`}
                        className="text-qo-accent underline decoration-qo-accent/40 underline-offset-2 hover:text-qo-accent-hover"
                      >
                        {v.visit_status.replace('_', ' ')} — {v.assigned_to_name}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { AlertTriangle, CheckCheck, ListFilter, Loader2 } from 'lucide-react';

interface Props {
  count: number;
  active: boolean;
  onFilter: () => void;
  canDismissSemantic?: boolean;
  dismissingSemantic?: boolean;
  onDismissSemantic?: () => void;
}

/**
 * Human-triage callout for permit status mismatches.
 */
export function StatusMismatchTriageBanner({
  count,
  active,
  onFilter,
  canDismissSemantic = false,
  dismissingSemantic = false,
  onDismissSemantic,
}: Props) {
  if (count === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-qo-risk shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-primary">
              {count.toLocaleString()} permit status mismatches need human review first
            </p>
            <p className="text-[11px] text-text-secondary max-w-2xl">
              Internal <span className="font-mono">npdes_permits.status</span> is{' '}
              compared against ECHO <span className="font-mono">permit_status</span>. The semantic
              dismiss action only clears rows where both statuses already map to the same internal
              value; rows that imply a permit lifecycle change remain pending for operator judgment.
              Do not bulk-mark reviewed.
            </p>
            <p className="text-[10px] text-text-muted">
              CLI export: <span className="font-mono">npm run qa:slice4-status-mismatch</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onFilter}
          className={`flex items-center gap-1.5 shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            active
              ? 'border-red-500/30 bg-red-500/15 text-qo-risk'
              : 'border-black/[0.08] bg-qo-nested text-text-secondary hover:text-text-primary'
          }`}
        >
          <ListFilter size={14} />
          {active ? 'Showing status mismatches' : 'Filter status mismatches'}
        </button>
        {canDismissSemantic && onDismissSemantic && (
          <button
            type="button"
            onClick={onDismissSemantic}
            disabled={dismissingSemantic}
            title="Dismiss only rows where ECHO status maps to the current internal permit status"
            className="flex items-center gap-1.5 shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {dismissingSemantic ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCheck size={14} />
            )}
            Dismiss semantic
          </button>
        )}
      </div>
    </div>
  );
}

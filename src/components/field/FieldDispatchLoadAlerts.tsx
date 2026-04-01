import { AlertTriangle } from 'lucide-react';

type Props = {
  alerts: readonly string[];
};

/**
 * Persistent summary when field dispatch context loaded with errors (toasts alone are easy to miss during QA).
 */
export function FieldDispatchLoadAlerts({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100/95"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="font-medium text-amber-50">Field queue data may be incomplete</p>
          <p className="text-xs text-amber-200/85">
            Some requests failed while loading dispatch context. Use Refresh after fixing permissions or network
            issues. An empty WV list can mean a load error, not only “no visits scheduled.”
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-amber-100/90">
            {alerts.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

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
      className="rounded-xl border border-qo-ochre/25 bg-qo-ochre/10 px-4 py-3 text-sm text-qo-ochre-text"
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-qo-ochre" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="font-medium text-qo-ochre-text">Field queue data may be incomplete</p>
          <p className="text-xs text-qo-ochre-text/90">
            Some requests failed while loading dispatch context. Use Refresh after fixing permissions or network
            issues. An empty WV list can mean a load error, not only “no visits scheduled.”
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-qo-ochre-text/90">
            {alerts.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

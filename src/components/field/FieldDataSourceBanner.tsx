import { Database, HardDrive, WifiOff } from 'lucide-react';
import type { FieldVisitDetailLoadSource } from '@/lib/fieldDataSource';

type RouteOfflineProps = {
  variant: 'route_offline_device';
  /** ISO or epoch from route cache `savedAt` — shown as a short locale string when provided. */
  routeSavedAt?: string | number | Date;
};

type VisitProps = {
  variant: 'visit';
  source: Exclude<FieldVisitDetailLoadSource, 'live'>;
};

type Props = RouteOfflineProps | VisitProps;

/**
 * Explains when route or visit UI is driven by device cache vs live Supabase (Milestone 2 UX).
 */
export function FieldDataSourceBanner(props: Props) {
  if (props.variant === 'route_offline_device') {
    const savedLabel =
      props.routeSavedAt != null
        ? new Date(props.routeSavedAt).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          })
        : null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-3 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
      >
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-sky-50">Offline — saved route on this device</p>
          <p className="mt-1 text-xs text-sky-200/85">
            Stop order and visit rows come from your last saved copy (localStorage / IndexedDB). Map pins use cached
            coordinates. Reconnect and use Refresh for live assignments and server updates. Field actions still use the
            outbound queue when you are back online.
          </p>
          {savedLabel ? (
            <p className="mt-2 text-xs font-medium text-sky-200/90">Last saved {savedLabel}.</p>
          ) : null}
        </div>
      </div>
    );
  }

  const { source } = props;
  const Icon = source === 'device_visit_cache' ? Database : HardDrive;
  const title =
    source === 'device_visit_cache'
      ? 'Showing saved visit from this device'
      : 'Showing minimal stop data from your saved route';

  const body =
    source === 'device_visit_cache'
      ? 'This screen is using a cached copy of the visit (typical when offline or after a failed live load). Photos, measurements, and server state may be stale. Reconnect and use Refresh in the sync bar to load live data.'
      : 'Live visit details could not be loaded; this stop is built from your offline route list only. Some sections may be empty until you reconnect and refresh.';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-100"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-violet-50">{title}</p>
        <p className="mt-1 text-xs text-violet-200/85">{body}</p>
      </div>
    </div>
  );
}

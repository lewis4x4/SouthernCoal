import { useMemo, useState } from 'react';
import { CloudRain, CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react';
import type { PrecipitationEvent, PrecipitationEventStatus } from '@/types/weather';

interface AlertInboxProps {
  events: PrecipitationEvent[];
  loading: boolean;
  onActivate: (event: PrecipitationEvent) => void;
  onDismiss: (event: PrecipitationEvent) => void;
  onSelect: (event: PrecipitationEvent) => void;
  statusFilter: PrecipitationEventStatus | 'all';
  onStatusFilterChange: (status: PrecipitationEventStatus | 'all') => void;
}

const STATUS_CONFIG: Record<PrecipitationEventStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: typeof Clock;
}> = {
  alert_generated: { label: 'Pending', color: 'text-amber-400', bgColor: 'bg-amber-500/20', icon: Clock },
  activated: { label: 'Activated', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', icon: CheckCircle },
  dismissed: { label: 'Dismissed', color: 'text-text-muted', bgColor: 'bg-white/[0.06]', icon: XCircle },
  completed: { label: 'Completed', color: 'text-sky-400', bgColor: 'bg-sky-500/20', icon: CheckCircle },
};

const FILTER_TABS: { value: PrecipitationEventStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'alert_generated', label: 'Pending' },
  { value: 'activated', label: 'Activated' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'completed', label: 'Completed' },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AlertInbox({
  events,
  loading,
  onActivate,
  onDismiss,
  onSelect,
  statusFilter,
  onStatusFilterChange,
}: AlertInboxProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return events;
    return events.filter((e) => e.status === statusFilter);
  }, [events, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) {
      c[e.status] = (c[e.status] || 0) + 1;
    }
    return c;
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onStatusFilterChange(tab.value)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-white/[0.10] text-text-primary'
                : 'text-text-muted hover:bg-white/[0.04] hover:text-text-secondary'
            }`}
          >
            {tab.label}
            {(counts[tab.value] ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-xs">
                {counts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <CloudRain className="mx-auto mb-2 h-8 w-8 text-text-muted" />
          <p className="text-sm text-text-muted">
            {statusFilter === 'all' ? 'No rain events recorded' : `No ${statusFilter.replace('_', ' ')} events`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event) => {
            const config = STATUS_CONFIG[event.status];
            const StatusIcon = config.icon;
            const isHovered = hoveredId === event.id;

            return (
              <div
                key={event.id}
                onMouseEnter={() => setHoveredId(event.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelect(event)}
                className="group cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${config.bgColor}`}>
                      <StatusIcon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">
                          {event.rainfall_inches}" rainfall
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-text-muted">
                          {event.trigger_source}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {formatDate(event.event_date ?? event.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Action buttons only for pending alerts */}
                    {event.status === 'alert_generated' && isHovered && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onActivate(event);
                          }}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                        >
                          Activate
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDismiss(event);
                          }}
                          className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    <ChevronRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                {/* Dismissal note */}
                {event.status === 'dismissed' && event.dismiss_reason_code && (
                  <div className="mt-2 rounded-lg bg-white/[0.03] px-3 py-2">
                    <p className="text-xs text-text-muted">
                      <span className="font-medium text-text-secondary">
                        {event.dismiss_reason_code.replace('_', ' ')}:
                      </span>{' '}
                      {event.dismiss_justification?.slice(0, 100)}
                      {(event.dismiss_justification?.length ?? 0) > 100 ? '...' : ''}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { Wifi, WifiOff, Clock } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useFieldOps } from '@/hooks/useFieldOps';
import { cn } from '@/lib/cn';

export function OutboundQueueCard() {
  const { outboundPendingCount, lastSyncedAt, loading } = useFieldOps();

  if (loading) {
    return (
      <SpotlightCard className="p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-white/[0.06]" />
          <div className="h-16 rounded-lg bg-white/[0.04]" />
        </div>
      </SpotlightCard>
    );
  }

  const hasPending = outboundPendingCount > 0;
  const lastSync = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'Never';

  return (
    <SpotlightCard className="p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-text-secondary">
        {hasPending ? (
          <WifiOff className="h-4 w-4 text-amber-400" />
        ) : (
          <Wifi className="h-4 w-4 text-emerald-400" />
        )}
        Sync Status
      </h3>

      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
        <div>
          <p className={cn(
            'font-mono text-2xl font-bold',
            hasPending ? 'text-amber-400' : 'text-emerald-400',
          )}>
            {outboundPendingCount}
          </p>
          <p className="text-[10px] text-text-muted">
            {hasPending ? 'Pending sync items' : 'All synced'}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <Clock className="h-3 w-3" />
            Last sync
          </div>
          <p className="text-sm font-medium text-text-secondary">{lastSync}</p>
        </div>
      </div>
    </SpotlightCard>
  );
}

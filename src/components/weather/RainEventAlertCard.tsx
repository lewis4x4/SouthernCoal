import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudRain, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';

interface RainEventCounts {
  pending: number;
  activated: number;
  dismissed: number;
  total: number;
}

export function RainEventAlertCard() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const organizationId = profile?.organization_id ?? null;
  const [counts, setCounts] = useState<RainEventCounts>({
    pending: 0,
    activated: 0,
    dismissed: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !organizationId) return;

    async function fetchCounts() {
      const { data, error } = await supabase
        .from('precipitation_events')
        .select('status')
        .eq('organization_id', organizationId);

      if (error) {
        console.warn('[RainEventAlertCard]', error.message);
        setLoading(false);
        return;
      }

      const pending = data.filter((e) => e.status === 'alert_generated').length;
      const activated = data.filter((e) => e.status === 'activated').length;
      const dismissed = data.filter((e) => e.status === 'dismissed').length;

      setCounts({ pending, activated, dismissed, total: data.length });
      setLoading(false);
    }

    fetchCounts();

    // Realtime subscription for live updates
    const channel = supabase
      .channel(`rain_events_card:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'precipitation_events',
        },
        () => {
          // Re-fetch on any change
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [organizationId, user?.id]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-xl">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 rounded bg-white/[0.06]" />
          <div className="h-8 w-20 rounded bg-white/[0.06]" />
        </div>
      </div>
    );
  }

  const hasPendingAlerts = counts.pending > 0;

  return (
    <Link
      to="/weather/alerts"
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-crystal-surface/50 to-crystal-surface/20 p-6 backdrop-blur-xl transition-all hover:border-white/[0.12]"
    >
      {/* Urgency glow for pending alerts */}
      {hasPendingAlerts && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
      )}

      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-gradient-to-br from-sky-600 to-sky-500 p-2">
              <CloudRain className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">Rain Events</h3>
          </div>
          {hasPendingAlerts && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {counts.pending} pending
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-bold text-amber-400">{counts.pending}</p>
            <p className="text-xs text-text-muted">Alerts</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-2xl font-bold text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              {counts.activated}
            </p>
            <p className="text-xs text-text-muted">Activated</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-2xl font-bold text-text-secondary">
              <XCircle className="h-4 w-4" />
              {counts.dismissed}
            </p>
            <p className="text-xs text-text-muted">Dismissed</p>
          </div>
        </div>

        {hasPendingAlerts && (
          <p className="mt-3 text-xs font-medium text-amber-400/80">
            Action required — review pending rain event alerts
          </p>
        )}
      </div>
    </Link>
  );
}

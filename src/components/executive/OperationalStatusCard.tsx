import { useEffect, useState } from 'react';
import { Building2, FileCheck, Droplet, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';

interface StatRow {
  label: string;
  value: string | number;
  subtext: string;
  icon: typeof Building2;
  status: 'good' | 'warning' | 'critical';
}

export function OperationalStatusCard() {
  const [dbStats, setDbStats] = useState<{ orgCount: number; permitCount: number; outfallCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const queueEntries = useQueueStore((s) => s.entries);

  // DB counts — fetch ONCE on mount with slight delay to avoid connection burst
  // (FinancialRiskCard + ActionQueueCard fire first, this waits 300ms)
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      const [orgsRes, permitsRes, outfallsRes] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('permits').select('id', { count: 'exact', head: true }),
        supabase.from('outfalls').select('id', { count: 'exact', head: true }),
      ]);

      if (cancelled) return;

      setDbStats({
        orgCount: orgsRes.count ?? 0,
        permitCount: permitsRes.count ?? 0,
        outfallCount: outfallsRes.count ?? 0,
      });
      setLoading(false);
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // Queue stats — derived from store, no DB call
  const processingCount = queueEntries.filter(
    (e) => e.status === 'processing' || e.status === 'queued',
  ).length;
  const failedCount = queueEntries.filter((e) => e.status === 'failed').length;

  const orgCount = dbStats?.orgCount ?? 0;
  const permitCount = dbStats?.permitCount ?? 0;
  const outfallCount = dbStats?.outfallCount ?? 0;

  const stats: StatRow[] = [
    {
      label: 'Active Facilities',
      value: orgCount,
      subtext: '5 states (AL, KY, TN, VA, WV)',
      icon: Building2,
      status: 'good',
    },
    {
      label: 'Permits Uploaded',
      value: permitCount,
      subtext: permitCount === 0 ? 'Upload permits to populate' : 'Across all states',
      icon: FileCheck,
      status: permitCount === 0 ? 'warning' : 'good',
    },
    {
      label: 'Outfalls Tracked',
      value: outfallCount,
      subtext: outfallCount === 0 ? 'Extracted from permits' : 'Active discharge points',
      icon: Droplet,
      status: outfallCount === 0 ? 'warning' : 'good',
    },
    {
      label: 'Files Processing',
      value: processingCount,
      subtext: `${failedCount} failed`,
      icon: Calendar,
      status: failedCount > 0 ? 'critical' : processingCount > 0 ? 'warning' : 'good',
    },
    {
      label: 'Failed Files',
      value: failedCount,
      subtext: failedCount > 0 ? 'Retry from Upload Dashboard' : 'All clear',
      icon: AlertCircle,
      status: failedCount > 0 ? 'critical' : 'good',
    },
  ];

  const statusColors: Record<string, string> = {
    good: 'text-emerald-400',
    warning: 'text-yellow-400',
    critical: 'text-red-400',
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-crystal-surface/50 to-crystal-surface/20 p-6 backdrop-blur-xl">
      <div className="mb-6">
        <h3 className="text-sm font-medium text-text-secondary">Operational Status</h3>
        <p className="mt-0.5 text-xs text-text-muted">System-wide compliance metrics</p>
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] animate-pulse rounded-lg border border-white/[0.04] bg-white/[0.02]"
              />
            ))
          : stats.map((stat) => {
              const Icon = stat.icon;
              const color = statusColors[stat.status] ?? 'text-text-muted';

              return (
                <div
                  key={stat.label}
                  className="flex items-center gap-4 rounded-lg border border-white/[0.04] bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06]"
                >
                  <div className={cn('rounded-lg bg-white/[0.05] p-2.5', color)}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={cn('text-2xl font-bold', color)}>{stat.value}</span>
                      <span className="text-sm text-text-muted">{stat.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-text-muted">{stat.subtext}</div>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}

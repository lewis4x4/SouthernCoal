import { useEffect, useState } from 'react';
import { Building2, FileCheck, Droplet, Calendar, AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import { useUserProfile } from '@/hooks/useUserProfile';

interface StatRow {
  label: string;
  value: string | number;
  subtext: string;
  icon: typeof Building2;
  status: 'good' | 'warning' | 'critical';
}

export function OperationalStatusCard() {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;
  const [dbStats, setDbStats] = useState<{
    activeFacilityCount: number;
    activeStateCount: number;
    hasCutoverRoster: boolean;
    siteCount: number;
    permitCount: number;
    outfallCount: number;
    violationCount: number;
    /** Rows in fts_uploads with parse_status = completed (not calendar quarters). */
    ftsCompletedUploads: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const queueEntries = useQueueStore((s) => s.entries);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      setDbStats(null);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [sitesRes, rosterRes, permitRowsRes, violationsRes, ftsUploadsRes] = await Promise.all([
            supabase.from('sites').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase
              .from('live_program_roster')
              .select('site_id, permit_id, outfall_id, state_code')
              .eq('organization_id', orgId),
            supabase.from('npdes_permits').select('id').eq('organization_id', orgId).limit(5000),
            supabase.from('fts_violations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase
              .from('fts_uploads')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .eq('parse_status', 'completed'),
          ]);

          const permitIds = (permitRowsRes.data ?? []).map((row) => row.id);
          const outfallsRes = permitIds.length > 0
            ? await supabase.from('outfalls').select('id', { count: 'exact', head: true }).in('permit_id', permitIds)
            : { count: 0, error: null };

          if (cancelled) return;

          const queryError =
            sitesRes.error ||
            rosterRes.error ||
            permitRowsRes.error ||
            outfallsRes.error ||
            violationsRes.error ||
            ftsUploadsRes.error;
          if (queryError) {
            setDbStats({
              activeFacilityCount: 0,
              activeStateCount: 0,
              hasCutoverRoster: false,
              siteCount: 0,
              permitCount: 0,
              outfallCount: 0,
              violationCount: 0,
              ftsCompletedUploads: 0,
            });
            return;
          }

          const rosterRows = rosterRes.data ?? [];
          const uniqueSites = new Set(rosterRows.map((row) => row.site_id));
          const uniquePermits = new Set(
            rosterRows
              .map((row) => row.permit_id)
              .filter((permitId): permitId is string => typeof permitId === 'string' && permitId.length > 0),
          );
          const uniqueOutfalls = new Set(
            rosterRows
              .map((row) => row.outfall_id)
              .filter((outfallId): outfallId is string => typeof outfallId === 'string' && outfallId.length > 0),
          );
          const uniqueStates = new Set(
            rosterRows
              .map((row) => row.state_code)
              .filter((stateCode): stateCode is string => typeof stateCode === 'string' && stateCode.length > 0),
          );

          setDbStats({
            activeFacilityCount: uniqueSites.size > 0 ? uniqueSites.size : (sitesRes.count ?? 0),
            activeStateCount: uniqueStates.size,
            hasCutoverRoster: uniqueSites.size > 0,
            siteCount: sitesRes.count ?? 0,
            permitCount: uniquePermits.size > 0 ? uniquePermits.size : permitIds.length,
            outfallCount: uniqueOutfalls.size > 0 ? uniqueOutfalls.size : (outfallsRes.count ?? 0),
            violationCount: violationsRes.count ?? 0,
            ftsCompletedUploads: ftsUploadsRes.count ?? 0,
          });
        } catch {
          if (!cancelled) {
            setDbStats({
              activeFacilityCount: 0,
              activeStateCount: 0,
              hasCutoverRoster: false,
              siteCount: 0,
              permitCount: 0,
              outfallCount: 0,
              violationCount: 0,
              ftsCompletedUploads: 0,
            });
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgId]);

  const processingCount = queueEntries.filter(
    (e) => e.status === 'processing' || e.status === 'queued',
  ).length;
  const failedCount = queueEntries.filter((e) => e.status === 'failed').length;

  const activeFacilityCount = dbStats?.activeFacilityCount ?? 0;
  const activeStateCount = dbStats?.activeStateCount ?? 0;
  const hasCutoverRoster = dbStats?.hasCutoverRoster ?? false;
  const siteCount = dbStats?.siteCount ?? 0;
  const permitCount = dbStats?.permitCount ?? 0;
  const outfallCount = dbStats?.outfallCount ?? 0;
  const violationCount = dbStats?.violationCount ?? 0;
  const ftsCompletedUploads = dbStats?.ftsCompletedUploads ?? 0;

  const stats: StatRow[] = [
    {
      label: 'Active Facilities',
      value: activeFacilityCount,
      subtext: hasCutoverRoster
        ? `${activeStateCount} states in live program roster`
        : `${siteCount} sites currently loaded`,
      icon: Building2,
      status: 'good',
    },
    {
      label: 'FTS Violations',
      value: violationCount.toLocaleString(),
      subtext:
        ftsCompletedUploads > 0
          ? `${ftsCompletedUploads} FTS file${ftsCompletedUploads !== 1 ? 's' : ''} parsed`
          : 'Upload penalty files to populate',
      icon: AlertTriangle,
      status: violationCount > 1000 ? 'critical' : violationCount > 0 ? 'warning' : 'good',
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
          ? Array.from({ length: 6 }).map((_, i) => (
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

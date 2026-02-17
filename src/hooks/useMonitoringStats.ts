import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { ExceedanceSeverity } from '@/types';

export interface MonitoringStats {
  // Exceedance counts
  totalExceedances: number;
  openExceedances: number;
  acknowledgedExceedances: number;
  criticalExceedances: number;
  majorExceedances: number;
  moderateExceedances: number;
  minorExceedances: number;

  // Severity breakdown for chart
  exceedancesBySeverity: Record<ExceedanceSeverity, number>;

  // Recent activity
  recentSamplingEvents: number;
  recentLabResults: number;

  // Trend data (last 30 days vs previous 30 days)
  exceedanceTrend: 'up' | 'down' | 'stable';
  exceedanceTrendPct: number;
}

interface UseMonitoringStatsReturn {
  stats: MonitoringStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching monitoring dashboard statistics.
 * Runs parallel queries for performance.
 */
export function useMonitoringStats(): UseMonitoringStatsReturn {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useUserProfile();

  const fetchStats = useCallback(async () => {
    if (!profile?.organization_id) {
      setStats(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const orgId = profile.organization_id;
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Run all queries in parallel
      const [
        totalResult,
        openResult,
        acknowledgedResult,
        criticalResult,
        majorResult,
        moderateResult,
        minorResult,
        recentSamplingResult,
        recentLabResult,
        last30DaysResult,
        prev30DaysResult,
      ] = await Promise.all([
        // Total exceedances (excluding resolved)
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .neq('status', 'resolved')
          .neq('status', 'false_positive'),

        // Open exceedances
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'open'),

        // Acknowledged exceedances
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'acknowledged'),

        // Critical severity
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('severity', 'critical')
          .neq('status', 'resolved'),

        // Major severity
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('severity', 'major')
          .neq('status', 'resolved'),

        // Moderate severity
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('severity', 'moderate')
          .neq('status', 'resolved'),

        // Minor severity
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('severity', 'minor')
          .neq('status', 'resolved'),

        // Recent sampling events (last 30 days)
        supabase
          .from('sampling_events')
          .select('id', { count: 'exact', head: true })
          .gte('sample_date', thirtyDaysAgo.toISOString().split('T')[0]),

        // Recent lab results (last 30 days)
        supabase
          .from('lab_results')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo.toISOString()),

        // Exceedances in last 30 days (for trend)
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('detected_at', thirtyDaysAgo.toISOString()),

        // Exceedances in previous 30 days (for trend)
        supabase
          .from('exceedances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('detected_at', sixtyDaysAgo.toISOString())
          .lt('detected_at', thirtyDaysAgo.toISOString()),
      ]);

      // Calculate trend
      const last30 = last30DaysResult.count ?? 0;
      const prev30 = prev30DaysResult.count ?? 0;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let trendPct = 0;

      if (prev30 > 0) {
        trendPct = ((last30 - prev30) / prev30) * 100;
        if (trendPct > 5) trend = 'up';
        else if (trendPct < -5) trend = 'down';
      } else if (last30 > 0) {
        trend = 'up';
        trendPct = 100;
      }

      setStats({
        totalExceedances: totalResult.count ?? 0,
        openExceedances: openResult.count ?? 0,
        acknowledgedExceedances: acknowledgedResult.count ?? 0,
        criticalExceedances: criticalResult.count ?? 0,
        majorExceedances: majorResult.count ?? 0,
        moderateExceedances: moderateResult.count ?? 0,
        minorExceedances: minorResult.count ?? 0,
        exceedancesBySeverity: {
          critical: criticalResult.count ?? 0,
          major: majorResult.count ?? 0,
          moderate: moderateResult.count ?? 0,
          minor: minorResult.count ?? 0,
        },
        recentSamplingEvents: recentSamplingResult.count ?? 0,
        recentLabResults: recentLabResult.count ?? 0,
        exceedanceTrend: trend,
        exceedanceTrendPct: Math.abs(Math.round(trendPct)),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch stats';
      setError(message);
      console.error('[useMonitoringStats] Error:', message);
    } finally {
      setLoading(false);
    }
  }, [profile?.organization_id]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats,
  };
}

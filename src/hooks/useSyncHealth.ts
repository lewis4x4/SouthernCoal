import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useExternalSyncLogRealtime } from '@/hooks/useExternalSyncLogRealtime';

/** Matches weekly ECHO cron (5.14). */
export const ECHO_STALE_DAYS = 7;

export interface SyncRunRow {
  id: string;
  source: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_synced: number | null;
  records_failed: number | null;
  error_details: { errors?: string[] } | null;
  metadata: Record<string, unknown> | null;
}

export interface StaleFacilityRow {
  npdes_id: string;
  facility_name: string | null;
  state_code: string | null;
  synced_at: string;
  days_stale: number;
}

export function useSyncHealth(facilitiesSyncedAt: { npdes_id: string; facility_name: string | null; state_code: string | null; synced_at: string }[]) {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;
  const [recentRuns, setRecentRuns] = useState<SyncRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    if (!orgId) {
      setRecentRuns([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('external_sync_log')
      .select(
        'id, source, sync_type, status, started_at, completed_at, records_synced, records_failed, error_details, metadata',
      )
      .eq('organization_id', orgId)
      .like('source', 'echo%')
      .order('started_at', { ascending: false })
      .limit(25);

    if (error) {
      console.error('[useSyncHealth] fetch runs failed:', error.message);
      setRecentRuns([]);
    } else {
      setRecentRuns((data || []) as SyncRunRow[]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  useExternalSyncLogRealtime(orgId, fetchRuns);

  const staleFacilities = useMemo((): StaleFacilityRow[] => {
    const cutoff = Date.now() - ECHO_STALE_DAYS * 86_400_000;
    return facilitiesSyncedAt
      .filter((f) => new Date(f.synced_at).getTime() < cutoff)
      .map((f) => ({
        ...f,
        days_stale: Math.floor((Date.now() - new Date(f.synced_at).getTime()) / 86_400_000),
      }))
      .sort((a, b) => b.days_stale - a.days_stale);
  }, [facilitiesSyncedAt]);

  const lastCompleted = useMemo(
    () => recentRuns.find((r) => r.status === 'completed' && r.completed_at) ?? null,
    [recentRuns],
  );

  const runningRun = useMemo(
    () => recentRuns.find((r) => r.status === 'running') ?? null,
    [recentRuns],
  );

  const failedRuns30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    return recentRuns.filter(
      (r) =>
        new Date(r.started_at).getTime() >= cutoff &&
        (r.status === 'failed' || (r.records_failed ?? 0) > 0),
    );
  }, [recentRuns]);

  return {
    recentRuns,
    staleFacilities,
    staleCount: staleFacilities.length,
    lastCompleted,
    runningRun,
    failedRuns30d,
    loading,
    refetch: fetchRuns,
  };
}

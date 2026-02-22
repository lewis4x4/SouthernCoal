import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface CoverageFacility {
  id: string;
  npdes_id: string;
  facility_name: string | null;
  state_code: string | null;
  compliance_status: string | null;
  permit_status: string | null;
  qtrs_in_nc: number | null;
  synced_at: string;
  dmr_count: number;
}

export interface StateCoverage {
  state_code: string;
  facility_count: number;
  snc_count: number;
  dmr_total: number;
}

export interface SyncLogEntry {
  id: string;
  source: string;
  status: string;
  records_synced: number | null;
  records_failed: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export function useEchoCoverage() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [facilities, setFacilities] = useState<CoverageFacility[]>([]);
  const [stateCoverage, setStateCoverage] = useState<StateCoverage[]>([]);
  const [lastSync, setLastSync] = useState<SyncLogEntry | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Fetch all facilities
    const { data: facData, error: facErr } = await supabase
      .from('external_echo_facilities')
      .select('id, npdes_id, facility_name, state_code, compliance_status, permit_status, qtrs_in_nc, synced_at')
      .order('state_code')
      .order('npdes_id');

    if (facErr) {
      setError(facErr.message);
      setLoading(false);
      return;
    }

    const facRows = (facData || []) as Omit<CoverageFacility, 'dmr_count'>[];

    // Fetch DMR counts per facility
    const facilityIds = facRows.map((f) => f.id);
    const dmrCounts: Record<string, number> = {};

    if (facilityIds.length > 0) {
      const { data: dmrData } = await supabase
        .from('external_echo_dmrs')
        .select('facility_id')
        .in('facility_id', facilityIds);

      if (dmrData) {
        for (const row of dmrData as { facility_id: string }[]) {
          dmrCounts[row.facility_id] = (dmrCounts[row.facility_id] || 0) + 1;
        }
      }
    }

    const enriched: CoverageFacility[] = facRows.map((f) => ({
      ...f,
      dmr_count: dmrCounts[f.id] || 0,
    }));

    setFacilities(enriched);

    // Compute per-state coverage
    const stateMap: Record<string, StateCoverage> = {};
    for (const f of enriched) {
      const sc = f.state_code || 'Unknown';
      if (!stateMap[sc]) {
        stateMap[sc] = { state_code: sc, facility_count: 0, snc_count: 0, dmr_total: 0 };
      }
      stateMap[sc].facility_count++;
      if (f.compliance_status?.toLowerCase().includes('snc') || f.compliance_status?.toLowerCase().includes('significant')) {
        stateMap[sc].snc_count++;
      }
      stateMap[sc].dmr_total += f.dmr_count;
    }
    setStateCoverage(Object.values(stateMap).sort((a, b) => a.state_code.localeCompare(b.state_code)));

    // Fetch latest sync log
    const { data: syncData } = await supabase
      .from('external_sync_log')
      .select('id, source, status, records_synced, records_failed, started_at, completed_at')
      .in('source', ['echo_facility', 'echo_dmr'])
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setLastSync(syncData as SyncLogEntry | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  // Realtime subscription for sync_log changes (Part 6)
  useEffect(() => {
    if (!user || !profile?.organization_id) return;

    const channel = supabase
      .channel(`sync-log:${profile.organization_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'external_sync_log',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const entry = (payload.new ?? {}) as Record<string, unknown>;

          // Update syncing state
          if (entry.status === 'running') {
            setSyncing(true);
          }

          // Refresh data when sync completes
          if (entry.status === 'completed' || entry.status === 'failed') {
            setSyncing(false);
            fetchCoverage();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on stable IDs
  }, [user?.id, profile?.organization_id, fetchCoverage]);

  return { facilities, stateCoverage, lastSync, syncing, loading, error, refetch: fetchCoverage };
}

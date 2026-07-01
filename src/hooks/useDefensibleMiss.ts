import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { CollectorAccessAnomaly, DefensibleMissPacket } from '@/lib/defensibleMiss';

export function useDefensibleMiss() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [anomalies, setAnomalies] = useState<CollectorAccessAnomaly[]>([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnomalies = useCallback(async () => {
    if (!orgId) {
      setAnomalies([]);
      setLoadingAnomalies(false);
      return;
    }

    setLoadingAnomalies(true);
    const { data, error: rpcError } = await supabase.rpc('get_collector_access_anomalies', {
      p_org_id: orgId,
      p_lookback_days: 365,
    });

    if (rpcError) {
      setError(rpcError.message);
      setAnomalies([]);
    } else {
      setAnomalies((data ?? []) as CollectorAccessAnomaly[]);
    }
    setLoadingAnomalies(false);
  }, [orgId]);

  useEffect(() => {
    void fetchAnomalies();
  }, [fetchAnomalies]);

  const generatePacket = useCallback(
    async (gapId: string): Promise<DefensibleMissPacket | null> => {
      setGenerating(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_flanking_samples_for_gap', {
        p_gap_id: gapId,
      });

      setGenerating(false);

      if (rpcError) {
        setError(rpcError.message);
        return null;
      }

      log(
        'defensible_miss_packet_generated',
        { gap_id: gapId },
        {
          module: 'environmental_compliance',
          tableName: 'sampling_gap_records',
          recordId: gapId,
          newValues: data as Record<string, unknown>,
        },
      );

      return data as DefensibleMissPacket;
    },
    [log],
  );

  return {
    anomalies,
    loadingAnomalies,
    generating,
    error,
    generatePacket,
    refetchAnomalies: fetchAnomalies,
  };
}

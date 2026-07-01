import { useCallback, useEffect, useState } from 'react';
import { supabase, getFreshToken } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import type {
  CollectorAccessAnomaly,
  DefensibleMissPacket,
  DefensibleMissPdfResult,
  DefensibleMissStoredPacket,
} from '@/lib/defensibleMiss';

export function useDefensibleMiss() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [anomalies, setAnomalies] = useState<CollectorAccessAnomaly[]>([]);
  const [storedPackets, setStoredPackets] = useState<DefensibleMissStoredPacket[]>([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState(true);
  const [loadingStored, setLoadingStored] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
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

  const fetchStoredPackets = useCallback(async (gapId: string) => {
    if (!orgId) {
      setStoredPackets([]);
      return;
    }

    setLoadingStored(true);
    const { data, error: fetchError } = await supabase
      .from('defensible_miss_packets')
      .select('id, gap_id, file_name, storage_path, sha256_hash, format, created_at')
      .eq('gap_id', gapId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setStoredPackets([]);
    } else {
      setStoredPackets((data ?? []) as DefensibleMissStoredPacket[]);
    }
    setLoadingStored(false);
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

      void fetchStoredPackets(gapId);
      return data as DefensibleMissPacket;
    },
    [log, fetchStoredPackets],
  );

  const generatePdfPacket = useCallback(
    async (gapId: string): Promise<DefensibleMissPdfResult | null> => {
      setGeneratingPdf(true);
      setError(null);

      try {
        const token = await getFreshToken();
        const { data, error: fnError } = await supabase.functions.invoke(
          'generate-defensible-miss-pdf',
          {
            body: { gap_id: gapId },
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (fnError) {
          setError(fnError.message ?? 'PDF generation failed');
          return null;
        }

        const result = data as DefensibleMissPdfResult;

        log(
          'defensible_miss_packet_pdf_generated',
          { gap_id: gapId, storage_path: result.storage_path },
          {
            module: 'environmental_compliance',
            tableName: 'defensible_miss_packets',
            recordId: result.packet_id ?? gapId,
            newValues: result as unknown as Record<string, unknown>,
          },
        );

        await fetchStoredPackets(gapId);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'PDF generation failed');
        return null;
      } finally {
        setGeneratingPdf(false);
      }
    },
    [log, fetchStoredPackets],
  );

  const getStoredPacketUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error: urlError } = await supabase.storage
      .from('defensible-miss-packets')
      .createSignedUrl(storagePath, 3600);

    if (urlError) {
      setError(urlError.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  return {
    anomalies,
    storedPackets,
    loadingAnomalies,
    loadingStored,
    generating,
    generatingPdf,
    error,
    generatePacket,
    generatePdfPacket,
    fetchStoredPackets,
    getStoredPacketUrl,
    refetchAnomalies: fetchAnomalies,
  };
}

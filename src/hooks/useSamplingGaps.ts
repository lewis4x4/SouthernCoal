import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  DEFAULT_SAMPLING_GAP_READINESS,
  parseSamplingGapReadiness,
  type SamplingGapReadiness,
} from '@/lib/samplingGapReadiness';
import type { SamplingGapRecord, SamplingGapReviewStatus } from '@/types/samplingGaps';

interface GapCounts {
  missed: number;
  at_risk: number;
  pending: number;
  critical: number;
}

export function useSamplingGaps() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [rows, setRows] = useState<SamplingGapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<SamplingGapReadiness>(
    DEFAULT_SAMPLING_GAP_READINESS,
  );
  const [counts, setCounts] = useState<GapCounts>({
    missed: 0,
    at_risk: 0,
    pending: 0,
    critical: 0,
  });

  const fetchRows = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('sampling_gap_records')
      .select(
        `
        *,
        outfalls ( outfall_number, description ),
        parameters ( short_name, name )
      `,
      )
      .eq('organization_id', orgId)
      .neq('review_status', 'resolved')
      .order('days_late', { ascending: false })
      .order('scheduled_date', { ascending: true })
      .limit(500);

    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as SamplingGapRecord[]);
    }

    setLoading(false);
  }, [orgId]);

  const fetchReadiness = useCallback(async () => {
    if (!orgId) {
      setReadiness(DEFAULT_SAMPLING_GAP_READINESS);
      setReadinessLoading(false);
      return DEFAULT_SAMPLING_GAP_READINESS;
    }

    setReadinessLoading(true);

    const { data, error: readinessError } = await supabase.rpc(
      'get_sampling_gap_detection_readiness',
      { p_organization_id: orgId },
    );

    if (readinessError) {
      const fallback = {
        ...DEFAULT_SAMPLING_GAP_READINESS,
        error: readinessError.message,
      };
      setReadiness(fallback);
      setReadinessLoading(false);
      return fallback;
    }

    const parsed = parseSamplingGapReadiness(data);
    setReadiness(parsed);
    setReadinessLoading(false);
    return parsed;
  }, [orgId]);

  const fetchCounts = useCallback(async () => {
    if (!orgId) {
      setCounts({
        missed: 0,
        at_risk: 0,
        pending: 0,
        critical: 0,
      });
      return;
    }

    const base = supabase
      .from('sampling_gap_records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .neq('review_status', 'resolved');

    const [missed, atRisk, pending, critical] = await Promise.all([
      base.eq('gap_kind', 'missed'),
      supabase
        .from('sampling_gap_records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('review_status', 'resolved')
        .eq('gap_kind', 'at_risk'),
      supabase
        .from('sampling_gap_records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('review_status', 'resolved')
        .eq('review_status', 'pending'),
      supabase
        .from('sampling_gap_records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('review_status', 'resolved')
        .eq('severity', 'critical'),
    ]);

    setCounts({
      missed: missed.count ?? 0,
      at_risk: atRisk.count ?? 0,
      pending: pending.count ?? 0,
      critical: critical.count ?? 0,
    });
  }, [orgId]);

  useEffect(() => {
    void fetchRows();
    void fetchCounts();
    void fetchReadiness();
  }, [fetchRows, fetchCounts, fetchReadiness]);

  const runDetection = useCallback(async () => {
    if (!orgId) return null;

    setDetecting(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('detect_sampling_calendar_gaps', {
      p_organization_id: orgId,
      p_source: 'manual',
    });

    setDetecting(false);

    if (rpcError) {
      setError(rpcError.message);
      return null;
    }

    log(
      'sampling_gap_detection_manual',
      { source: 'manual' },
      {
        module: 'environmental_compliance',
        tableName: 'sampling_gap_detection_runs',
        recordId: (data as { run_id?: string })?.run_id,
        newValues: data as Record<string, unknown>,
      },
    );

    await fetchRows();
    await fetchCounts();
    await fetchReadiness();

    return data as {
      run_id: string;
      calendars_scanned: number;
      gaps_opened: number;
      gaps_updated: number;
      gaps_resolved: number;
      readiness_state?: SamplingGapReadiness['state'];
    };
  }, [orgId, log, fetchRows, fetchCounts, fetchReadiness]);

  const updateReviewStatus = useCallback(
    async (gapId: string, status: SamplingGapReviewStatus, notes?: string) => {
      const { error: rpcError } = await supabase.rpc('update_sampling_gap_review_status', {
        p_gap_id: gapId,
        p_review_status: status,
        p_review_notes: notes ?? null,
      });

      if (rpcError) return rpcError.message;

      log(
        'sampling_gap_review_updated',
        { review_status: status },
        {
          module: 'environmental_compliance',
          tableName: 'sampling_gap_records',
          recordId: gapId,
          newValues: { review_status: status, review_notes: notes ?? null },
        },
      );

      await fetchRows();
      await fetchCounts();
      await fetchReadiness();
      return null;
    },
    [log, fetchRows, fetchCounts, fetchReadiness],
  );

  return {
    rows,
    loading,
    readiness,
    readinessLoading,
    detecting,
    error,
    counts,
    refetch: fetchRows,
    runDetection,
    updateReviewStatus,
  };
}

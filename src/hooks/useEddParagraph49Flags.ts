import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { EddParagraph49ReviewStatus } from '@/lib/eddParagraph49';
import type { EddParagraph49Evaluation } from '@/types/eddParagraph49';

interface EddCounts {
  late: number;
  exceedanceOnly: number;
  pending: number;
  flagged: number;
}

export function useEddParagraph49Flags() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [rows, setRows] = useState<EddParagraph49Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<EddCounts>({
    late: 0,
    exceedanceOnly: 0,
    pending: 0,
    flagged: 0,
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
      .from('edd_paragraph49_evaluations')
      .select('*')
      .eq('organization_id', orgId)
      .neq('review_status', 'resolved')
      .order('arrival_at', { ascending: false })
      .limit(500);

    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as EddParagraph49Evaluation[]);
    }

    setLoading(false);
  }, [orgId]);

  const fetchCounts = useCallback(async () => {
    if (!orgId) return;

    const base = supabase
      .from('edd_paragraph49_evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .neq('review_status', 'resolved');

    const [late, exceedanceOnly, pending, flagged] = await Promise.all([
      base.eq('is_late_48h', true),
      supabase
        .from('edd_paragraph49_evaluations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('review_status', 'resolved')
        .eq('is_exceedance_only', true),
      supabase
        .from('edd_paragraph49_evaluations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('review_status', 'resolved')
        .eq('review_status', 'pending'),
      supabase
        .from('edd_paragraph49_evaluations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('review_status', 'resolved')
        .or('is_late_48h.eq.true,is_exceedance_only.eq.true'),
    ]);

    setCounts({
      late: late.count ?? 0,
      exceedanceOnly: exceedanceOnly.count ?? 0,
      pending: pending.count ?? 0,
      flagged: flagged.count ?? 0,
    });
  }, [orgId]);

  useEffect(() => {
    void fetchRows();
    void fetchCounts();
  }, [fetchRows, fetchCounts]);

  const updateReviewStatus = useCallback(
    async (evaluationId: string, status: EddParagraph49ReviewStatus, notes?: string) => {
      const { error: rpcError } = await supabase.rpc('update_edd_paragraph49_review_status', {
        p_evaluation_id: evaluationId,
        p_review_status: status,
        p_review_notes: notes ?? null,
      });

      if (rpcError) return rpcError.message;

      log(
        'edd_paragraph49_review_updated',
        { review_status: status },
        {
          module: 'environmental_compliance',
          tableName: 'edd_paragraph49_evaluations',
          recordId: evaluationId,
          newValues: { review_status: status, review_notes: notes ?? null },
        },
      );

      await fetchRows();
      await fetchCounts();
      return null;
    },
    [log, fetchRows, fetchCounts],
  );

  return {
    rows,
    loading,
    error,
    counts,
    refetch: fetchRows,
    updateReviewStatus,
  };
}

import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  downloadSyntheticLimitsCsv,
  mapSyntheticLimitRows,
  SYNTHETIC_LIMIT_NOTES_FILTER,
  SYNTHETIC_LIMIT_SELECT,
  type PermitLimitReviewStatus,
  type SyntheticPermitLimitRow,
} from '@/lib/syntheticPermitLimits';

export function useSyntheticPermitLimits() {
  const [rows, setRows] = useState<SyntheticPermitLimitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { log } = useAuditLog();

  const fetchRows = useCallback(async (unverifiedOnly = true) => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('permit_limits')
      .select(SYNTHETIC_LIMIT_SELECT)
      .ilike('condition_notes', `%${SYNTHETIC_LIMIT_NOTES_FILTER}%`)
      .order('review_status')
      .limit(100);

    if (unverifiedOnly) {
      query = query.neq('review_status', 'verified');
    }

    const { data, error: queryError } = await query;
    setLoading(false);

    if (queryError) {
      setError(queryError.message);
      return { ok: false as const, error: queryError.message };
    }

    const mapped = mapSyntheticLimitRows((data ?? []) as unknown as Parameters<typeof mapSyntheticLimitRows>[0]);
    setRows(mapped);
    return { ok: true as const, count: mapped.length };
  }, []);

  const exportCsv = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('permit_limits')
      .select(SYNTHETIC_LIMIT_SELECT)
      .ilike('condition_notes', `%${SYNTHETIC_LIMIT_NOTES_FILTER}%`)
      .order('review_status')
      .limit(2000);

    setLoading(false);
    if (queryError) {
      setError(queryError.message);
      return { ok: false as const, error: queryError.message };
    }

    const mapped = mapSyntheticLimitRows((data ?? []) as unknown as Parameters<typeof mapSyntheticLimitRows>[0]);
    downloadSyntheticLimitsCsv(mapped);
    return { ok: true as const, count: mapped.length };
  }, []);

  const updateReviewStatus = useCallback(
    async (limitId: string, status: PermitLimitReviewStatus, notes?: string) => {
      setUpdatingId(limitId);
      const { error: rpcError } = await supabase.rpc('update_permit_limit_review_status', {
        p_limit_id: limitId,
        p_review_status: status,
        p_review_notes: notes ?? null,
      });
      setUpdatingId(null);

      if (rpcError) {
        return { ok: false as const, error: rpcError.message };
      }

      setRows((prev) =>
        prev.map((row) => (row.id === limitId ? { ...row, review_status: status } : row)),
      );

      void log(
        'permit_limit_review_updated',
        { limit_id: limitId, review_status: status },
        { module: 'external_data', tableName: 'permit_limits', recordId: limitId },
      );

      return { ok: true as const };
    },
    [log],
  );

  return {
    rows,
    loading,
    error,
    updatingId,
    fetchRows,
    exportCsv,
    updateReviewStatus,
  };
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useQueueStore } from '@/stores/queue';

export interface UploadDashboardDomainStats {
  totalPermits: number;
  totalOutfalls: number;
  totalLimits: number;
  computedAt?: string;
  loading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

/**
 * Live domain-table counts for Upload Dashboard summary stat cards (v6 §12 #5).
 */
export function useUploadDashboardDomainStats(): UploadDashboardDomainStats {
  const { profile } = useUserProfile();
  const entries = useQueueStore((s) => s.entries);
  const [stats, setStats] = useState<Omit<UploadDashboardDomainStats, 'loading' | 'refetch'>>({
    totalPermits: 0,
    totalOutfalls: 0,
    totalLimits: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  /** Refetch when any queue row lands in imported (v6 §12 #5 live stat cards). */
  const importSignature = useMemo(
    () =>
      entries
        .filter((e) => e.status === 'imported')
        .map((e) => `${e.id}:${e.records_imported ?? 0}`)
        .sort()
        .join('|'),
    [entries],
  );

  const refetch = useCallback(async () => {
    if (!profile?.organization_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('get_upload_dashboard_domain_stats');

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const payload = data as Record<string, unknown> | null;
    if (payload?.error) {
      setError(String(payload.error));
      setLoading(false);
      return;
    }

    setStats({
      totalPermits: Number(payload?.total_permits ?? 0),
      totalOutfalls: Number(payload?.total_outfalls ?? 0),
      totalLimits: Number(payload?.total_limits ?? 0),
      computedAt: payload?.computed_at as string | undefined,
    });
    setError(undefined);
    setLoading(false);
  }, [profile?.organization_id]);

  useEffect(() => {
    void refetch();
  }, [refetch, importSignature]);

  return { ...stats, loading, error, refetch };
}

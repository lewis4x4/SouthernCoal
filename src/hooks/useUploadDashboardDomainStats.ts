import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';

export interface UploadDashboardDomainStats {
  totalPermits: number;
  totalOutfalls: number;
  totalLimits: number;
  computedAt?: string;
  loading: boolean;
  error?: string;
}

/**
 * Live domain-table counts for Upload Dashboard summary stat cards (v6 §12 #5).
 */
export function useUploadDashboardDomainStats(): UploadDashboardDomainStats {
  const { profile } = useUserProfile();
  const [stats, setStats] = useState<Omit<UploadDashboardDomainStats, 'loading'>>({
    totalPermits: 0,
    totalOutfalls: 0,
    totalLimits: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

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
  }, [refetch]);

  return { ...stats, loading, error };
}

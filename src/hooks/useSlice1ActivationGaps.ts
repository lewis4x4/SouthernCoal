import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Slice1ActivationGapsReport } from '@/lib/slice1ActivationGaps';

export function useSlice1ActivationGaps() {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id;
  const [loading, setLoading] = useState(false);
  const [gaps, setGaps] = useState<Slice1ActivationGapsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('report_slice1_activation_gaps', {
        p_organization_id: orgId,
      });
      if (rpcError) {
        setError(rpcError.message);
        setGaps(null);
        return;
      }
      setGaps(data as Slice1ActivationGapsReport);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { loading, gaps, error, refetch };
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';

export type PenaltyRegimeStatus = 'not_configured' | 'draft' | 'verified' | 'disputed';

export interface PenaltyRegimeRow {
  id: string;
  organization_id: string | null;
  regime_key: string;
  label: string;
  citation: string;
  verification_status: PenaltyRegimeStatus;
  notes: string | null;
}

export function usePenaltyRegimes() {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;
  const [regimes, setRegimes] = useState<PenaltyRegimeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRegimes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('penalty_regimes')
      .select('id, organization_id, regime_key, label, citation, verification_status, notes')
      .is('valid_to', null)
      .order('regime_key', { ascending: true });

    if (error) {
      console.error('[penalty-regimes] fetch failed:', error.message);
      setRegimes([]);
    } else {
      setRegimes((data ?? []) as PenaltyRegimeRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchRegimes();
  }, [fetchRegimes, orgId]);

  const hasVerifiedRegime = regimes.some((r) => r.verification_status === 'verified');

  return {
    regimes,
    loading,
    hasVerifiedRegime,
    refetch: fetchRegimes,
  };
}

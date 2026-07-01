import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';

export interface MshaAbatementAtRisk {
  id: string;
  mine_id: string;
  violation_number: string | null;
  event_number: string | null;
  inspection_date: string | null;
  abatement_due_date: string;
  days_until_due: number;
  significant_substantial: boolean;
  proposed_penalty: number | null;
  current_status: string | null;
  urgency: 'overdue' | 'due_soon' | 'ok';
}

export function useMshaAbatement(daysAhead = 14) {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;
  const [rows, setRows] = useState<MshaAbatementAtRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('get_msha_abatement_at_risk', {
      p_org_id: orgId,
      p_days_ahead: daysAhead,
    });

    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as MshaAbatementAtRisk[]);
    }

    setLoading(false);
  }, [orgId, daysAhead]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  return { rows, loading, error, refetch: fetchRows };
}

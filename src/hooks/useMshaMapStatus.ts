import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface MshaMapStatus {
  active_mines: number;
  review_mines: number;
  active_orgs: number;
  last_refresh: string | null;
  last_reconcile: string | null;
}

export interface MshaMapDrift {
  id?: string;
  run_type?: string;
  status?: string;
  summary?: Record<string, unknown>;
  created_at?: string;
}

export interface MshaReviewMine {
  mine_id: string;
  operator_name: string | null;
  controller_id: string | null;
  mine_name: string | null;
  state: string | null;
  mine_status: string | null;
  last_seen: string;
}

export function useMshaMapStatus() {
  const [status, setStatus] = useState<MshaMapStatus | null>(null);
  const [drift, setDrift] = useState<MshaMapDrift | null>(null);
  const [reviewMines, setReviewMines] = useState<MshaReviewMine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [statusRes, driftRes, reviewRes] = await Promise.all([
      supabase.rpc('get_msha_map_status'),
      supabase.rpc('get_msha_map_drift_latest'),
      supabase
        .from('msha_mine_review')
        .select('mine_id, operator_name, controller_id, mine_name, state, mine_status, last_seen')
        .order('last_seen', { ascending: false })
        .limit(20),
    ]);

    if (statusRes.error) setError(statusRes.error.message);
    else setStatus(statusRes.data as MshaMapStatus);

    if (!driftRes.error) setDrift(driftRes.data as MshaMapDrift);

    if (reviewRes.error) setError(reviewRes.error.message);
    else setReviewMines((reviewRes.data ?? []) as MshaReviewMine[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const refreshMap = useCallback(async (action: 'refresh' | 'reconcile' = 'refresh') => {
    setRefreshing(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('refresh-msha-mine-map', {
      body: { action, run_tag: `manual-${action}` },
    });
    setRefreshing(false);
    if (fnError) {
      setError(fnError.message);
      return null;
    }
    await fetchAll();
    return data as Record<string, unknown>;
  }, [fetchAll]);

  return {
    status,
    drift,
    reviewMines,
    loading,
    refreshing,
    error,
    refreshMap,
    refetch: fetchAll,
  };
}

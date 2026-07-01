import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  parseSamplingObligationLedger,
  type ObligationStatus,
  type SamplingObligationLedger,
} from '@/lib/samplingObligationLedger';
import { useAuditLog } from '@/hooks/useAuditLog';

export function useSamplingObligationLedger() {
  const { log } = useAuditLog();
  const [ledger, setLedger] = useState<SamplingObligationLedger | null>(null);
  const [statusFilter, setStatusFilter] = useState<ObligationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedger = useCallback(async (filter: ObligationStatus | null = statusFilter) => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('get_sampling_obligation_ledger', {
      p_status_filter: filter,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      setLedger(null);
      return null;
    }

    const parsed = parseSamplingObligationLedger(data);
    setLedger(parsed);
    if (parsed?.error) setError(parsed.error);
    return parsed;
  }, [statusFilter]);

  useEffect(() => {
    void fetchLedger(statusFilter);
  }, [fetchLedger, statusFilter]);

  const applyStatusFilter = useCallback(
    (next: ObligationStatus | null) => {
      setStatusFilter(next);
      log(
        'filter_change',
        { view: 'sampling_obligation_ledger', status_filter: next ?? 'all' },
        { module: 'environmental_compliance', tableName: 'sampling_calendar' },
      );
    },
    [log],
  );

  return {
    ledger,
    loading,
    error,
    statusFilter,
    applyStatusFilter,
    refetch: () => fetchLedger(statusFilter),
  };
}

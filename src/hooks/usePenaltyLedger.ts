import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { parsePenaltyLedgerSummary, type PenaltyLedgerSummary } from '@/lib/penaltyLedger';

export function usePenaltyLedger() {
  const [summary, setSummary] = useState<PenaltyLedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOff, setSigningOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('get_penalty_ledger_summary');
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      setSummary(null);
      return null;
    }

    const parsed = parsePenaltyLedgerSummary(data);
    setSummary(parsed);
    return parsed;
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const signOff = useCallback(async (note?: string) => {
    setSigningOff(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('record_penalty_ledger_verification', {
      p_note: note?.trim() || null,
    });

    setSigningOff(false);

    if (rpcError) {
      setError(rpcError.message);
      return null;
    }

    await fetchSummary();
    return data as Record<string, unknown>;
  }, [fetchSummary]);

  return {
    summary,
    loading,
    signingOff,
    error,
    refetch: fetchSummary,
    signOff,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  parseSamplingObligationLedger,
  type ObligationDomain,
  type ObligationStatus,
  type SamplingObligationLedger,
} from '@/lib/samplingObligationLedger';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useUserProfile } from '@/hooks/useUserProfile';

export function useSamplingObligationLedger() {
  const { log } = useAuditLog();
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;
  const [ledger, setLedger] = useState<SamplingObligationLedger | null>(null);
  const [statusFilter, setStatusFilter] = useState<ObligationStatus | null>(null);
  const [domainFilter, setDomainFilter] = useState<ObligationDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingClocks, setRefreshingClocks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchLedger = useCallback(
    async (filter: ObligationStatus | null = statusFilter, domain: ObligationDomain | null = domainFilter) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('get_statutory_obligation_ledger', {
        p_status_filter: filter,
        p_domain_filter: domain,
      });

      if (requestId !== requestIdRef.current) return null;

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
    },
    [domainFilter, statusFilter],
  );

  const refreshClocksAndLedger = useCallback(async () => {
    if (!orgId) return fetchLedger();
    setRefreshingClocks(true);
    await supabase.rpc('refresh_statutory_obligation_clocks', { p_organization_id: orgId });
    setRefreshingClocks(false);
    log(
      'obligation_ledger_clocks_refreshed',
      { domain_filter: domainFilter ?? 'all' },
      { module: 'environmental_compliance', tableName: 'statutory_obligation_clocks' },
    );
    return fetchLedger();
  }, [domainFilter, fetchLedger, log, orgId]);

  useEffect(() => {
    void fetchLedger(statusFilter, domainFilter);
  }, [domainFilter, fetchLedger, statusFilter]);

  const applyStatusFilter = useCallback(
    (next: ObligationStatus | null) => {
      setStatusFilter(next);
      log(
        'filter_change',
        { view: 'statutory_obligation_ledger', status_filter: next ?? 'all' },
        { module: 'environmental_compliance', tableName: 'statutory_obligation_clocks' },
      );
    },
    [log],
  );

  const applyDomainFilter = useCallback(
    (next: ObligationDomain | null) => {
      setDomainFilter(next);
      log(
        'filter_change',
        { view: 'statutory_obligation_ledger', domain_filter: next ?? 'all' },
        { module: 'environmental_compliance', tableName: 'statutory_obligation_clocks' },
      );
    },
    [log],
  );

  return {
    ledger,
    loading,
    refreshingClocks,
    error,
    statusFilter,
    domainFilter,
    applyStatusFilter,
    applyDomainFilter,
    refetch: () => refreshClocksAndLedger(),
  };
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  assessDiscrepancyDetectionReadiness,
  type DiscrepancyReadinessAssessment,
  type DiscrepancyReadinessCounts,
} from '@/lib/discrepancyDetectionReadiness';

const EMPTY_COUNTS: DiscrepancyReadinessCounts = {
  echoFacilities: 0,
  echoViolations: 0,
  internalPermits: 0,
  exceedances: 0,
  dmrSubmissions: 0,
  dmrLineItems: 0,
};

async function headCount(table: string, orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  if (error) {
    console.error(`[discrepancy-readiness] ${table} count error:`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function fetchCounts(orgId: string): Promise<DiscrepancyReadinessCounts> {
  const [
    echoFacilities,
    echoViolationsResult,
    internalPermits,
    exceedances,
    dmrSubmissions,
    dmrLineItemsResult,
  ] = await Promise.all([
    headCount('external_echo_facilities', orgId),
    supabase
      .from('external_echo_dmrs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .not('violation_code', 'is', null),
    headCount('npdes_permits', orgId),
    headCount('exceedances', orgId),
    headCount('dmr_submissions', orgId),
    supabase
      .from('dmr_line_items')
      .select('id, dmr_submissions!inner(organization_id)', { count: 'exact', head: true })
      .eq('dmr_submissions.organization_id', orgId),
  ]);

  const echoViolations = echoViolationsResult.error
    ? (() => {
        console.error('[discrepancy-readiness] echo violations count error:', echoViolationsResult.error.message);
        return 0;
      })()
    : (echoViolationsResult.count ?? 0);

  const dmrLineItems = dmrLineItemsResult.error
    ? (() => {
        console.error('[discrepancy-readiness] dmr_line_items count error:', dmrLineItemsResult.error.message);
        return 0;
      })()
    : (dmrLineItemsResult.count ?? 0);

  return {
    echoFacilities,
    echoViolations,
    internalPermits,
    exceedances,
    dmrSubmissions,
    dmrLineItems,
  };
}

export function useDiscrepancyReadiness() {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id;
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<DiscrepancyReadinessCounts>(EMPTY_COUNTS);
  const [assessment, setAssessment] = useState<DiscrepancyReadinessAssessment>(
    () => assessDiscrepancyDetectionReadiness(EMPTY_COUNTS),
  );

  const refetch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const next = await fetchCounts(orgId);
      setCounts(next);
      setAssessment(assessDiscrepancyDetectionReadiness(next));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { loading, counts, assessment, refetch };
}

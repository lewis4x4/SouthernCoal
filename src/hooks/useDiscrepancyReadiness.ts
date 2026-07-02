import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  assessDiscrepancyDetectionReadiness,
  type DiscrepancyReadinessAssessment,
  type DiscrepancyReadinessCounts,
} from '@/lib/discrepancyDetectionReadiness';
import type { Slice1ActivationGapsReport } from '@/lib/slice1ActivationGaps';

const EMPTY_COUNTS: DiscrepancyReadinessCounts = {
  echoFacilities: 0,
  echoViolations: 0,
  internalPermits: 0,
  exceedances: 0,
  dmrSubmissions: 0,
  dmrLineItems: 0,
  mshaOpenCitations: 0,
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

async function countDmrSubmissions(orgId: string): Promise<number> {
  const modern = await supabase
    .from('dmr_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  if (!modern.error) return modern.count ?? 0;

  const cms = await supabase
    .from('dmr_submissions')
    .select('id, npdes_permits!inner(organization_id)', { count: 'exact', head: true })
    .eq('npdes_permits.organization_id', orgId);
  if (cms.error) {
    console.error('[discrepancy-readiness] dmr_submissions count error:', cms.error.message);
    return 0;
  }
  return cms.count ?? 0;
}

async function countDmrLineItems(orgId: string): Promise<number> {
  const modern = await supabase
    .from('dmr_line_items')
    .select('id, dmr_submissions!inner(organization_id)', { count: 'exact', head: true })
    .eq('dmr_submissions.organization_id', orgId);
  if (!modern.error) return modern.count ?? 0;

  const cms = await supabase
    .from('dmr_line_items')
    .select('id, dmr_submissions!inner(npdes_permits!inner(organization_id))', {
      count: 'exact',
      head: true,
    })
    .eq('dmr_submissions.npdes_permits.organization_id', orgId);
  if (cms.error) {
    console.error('[discrepancy-readiness] dmr_line_items count error:', cms.error.message);
    return 0;
  }
  return cms.count ?? 0;
}

async function fetchCounts(orgId: string): Promise<DiscrepancyReadinessCounts> {
  const [
    echoFacilities,
    echoViolationsResult,
    internalPermits,
    exceedances,
    dmrSubmissions,
    dmrLineItems,
    mshaOpenCitations,
  ] = await Promise.all([
    headCount('external_echo_facilities', orgId),
    supabase
      .from('external_echo_dmrs')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .not('violation_code', 'is', null),
    headCount('npdes_permits', orgId),
    headCount('exceedances', orgId),
    countDmrSubmissions(orgId),
    countDmrLineItems(orgId),
    supabase
      .from('external_msha_inspections')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('termination_date', null),
  ]);

  const echoViolations = echoViolationsResult.error
    ? (() => {
        console.error('[discrepancy-readiness] echo violations count error:', echoViolationsResult.error.message);
        return 0;
      })()
    : (echoViolationsResult.count ?? 0);

  const mshaCount = mshaOpenCitations.error
    ? (() => {
        console.error('[discrepancy-readiness] msha citations count error:', mshaOpenCitations.error.message);
        return 0;
      })()
    : (mshaOpenCitations.count ?? 0);

  return {
    echoFacilities,
    echoViolations,
    internalPermits,
    exceedances,
    dmrSubmissions,
    dmrLineItems,
    mshaOpenCitations: mshaCount,
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
  const [activationGaps, setActivationGaps] = useState<Slice1ActivationGapsReport | null>(null);

  const refetch = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [next, gapsResult] = await Promise.all([
        fetchCounts(orgId),
        supabase.rpc('report_slice1_activation_gaps', { p_organization_id: orgId }),
      ]);
      setCounts(next);
      setAssessment(assessDiscrepancyDetectionReadiness(next));
      if (gapsResult.error) {
        console.error('[discrepancy-readiness] activation gaps error:', gapsResult.error.message);
        setActivationGaps(null);
      } else {
        setActivationGaps(gapsResult.data as Slice1ActivationGapsReport);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { loading, counts, assessment, activationGaps, refetch };
}

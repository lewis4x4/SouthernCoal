import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface EchoFacility {
  id: string;
  npdes_id: string;
  facility_name: string | null;
  permit_status: string | null;
  compliance_status: string | null;
  qtrs_in_nc: number | null;
  last_inspection_date: string | null;
  last_penalty_amount: number | null;
  last_penalty_date: string | null;
  permit_effective_date: string | null;
  permit_expiration_date: string | null;
  state_code: string | null;
  synced_at: string;
}

export interface EchoDmrSummary {
  total: number;
  withViolations: number;
  latestPeriod: string | null;
}

export interface MshaInspection {
  id: string;
  mine_id: string;
  event_number: string | null;
  inspection_date: string | null;
  inspection_type: string | null;
  violation_number: string | null;
  significant_substantial: boolean;
  proposed_penalty: number | null;
  current_status: string | null;
  synced_at: string;
}

export function useExternalData(npdesId?: string, mineId?: string) {
  const [echoFacility, setEchoFacility] = useState<EchoFacility | null>(null);
  const [dmrSummary, setDmrSummary] = useState<EchoDmrSummary | null>(null);
  const [mshaInspections, setMshaInspections] = useState<MshaInspection[]>([]);
  const [echoLoading, setEchoLoading] = useState(false);
  const [dmrLoading, setDmrLoading] = useState(false);
  const [mshaLoading, setMshaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Backward-compatible aggregate loading flag */
  const loading = echoLoading || dmrLoading || mshaLoading;

  const fetchEcho = useCallback(async () => {
    if (!npdesId) return;
    setEchoLoading(true);
    setError(null);

    const { data: facility, error: facErr } = await supabase
      .from('external_echo_facilities')
      .select('*')
      .eq('npdes_id', npdesId)
      .limit(1)
      .maybeSingle();

    if (facErr) {
      setError(facErr.message);
      setEchoLoading(false);
      return;
    }

    setEchoFacility(facility as EchoFacility | null);
    setEchoLoading(false);

    if (facility) {
      setDmrLoading(true);

      const [totalRes, violRes, latestRes] = await Promise.all([
        supabase
          .from('external_echo_dmrs')
          .select('id', { count: 'exact', head: true })
          .eq('npdes_id', npdesId),
        supabase
          .from('external_echo_dmrs')
          .select('id', { count: 'exact', head: true })
          .eq('npdes_id', npdesId)
          .not('violation_code', 'is', null),
        supabase
          .from('external_echo_dmrs')
          .select('monitoring_period_end')
          .eq('npdes_id', npdesId)
          .order('monitoring_period_end', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (totalRes.error || violRes.error || latestRes.error) {
        setError(totalRes.error?.message || violRes.error?.message || latestRes.error?.message || 'Failed to fetch DMR summary');
      } else {
        setDmrSummary({
          total: totalRes.count ?? 0,
          withViolations: violRes.count ?? 0,
          latestPeriod: latestRes.data?.monitoring_period_end ?? null,
        });
      }

      setDmrLoading(false);
    }
  }, [npdesId]);

  const fetchMsha = useCallback(async () => {
    if (!mineId) return;
    setMshaLoading(true);
    setError(null);

    const { data, error: mshaErr } = await supabase
      .from('external_msha_inspections')
      .select('*')
      .eq('mine_id', mineId)
      .order('inspection_date', { ascending: false })
      .limit(20);

    if (mshaErr) {
      setError(mshaErr.message);
      setMshaLoading(false);
      return;
    }

    setMshaInspections((data || []) as MshaInspection[]);
    setMshaLoading(false);
  }, [mineId]);

  useEffect(() => {
    fetchEcho();
  }, [fetchEcho]);

  useEffect(() => {
    fetchMsha();
  }, [fetchMsha]);

  return { echoFacility, dmrSummary, mshaInspections, loading, echoLoading, dmrLoading, mshaLoading, error, refetchEcho: fetchEcho, refetchMsha: fetchMsha };
}

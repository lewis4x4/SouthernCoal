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
  const [loading, setLoading] = useState(false);

  const fetchEcho = useCallback(async () => {
    if (!npdesId) return;
    setLoading(true);

    const { data: facility } = await supabase
      .from('external_echo_facilities')
      .select('*')
      .eq('npdes_id', npdesId)
      .limit(1)
      .maybeSingle();

    setEchoFacility(facility as EchoFacility | null);

    if (facility) {
      const { count: total } = await supabase
        .from('external_echo_dmrs')
        .select('id', { count: 'exact', head: true })
        .eq('npdes_id', npdesId);

      const { count: withViolations } = await supabase
        .from('external_echo_dmrs')
        .select('id', { count: 'exact', head: true })
        .eq('npdes_id', npdesId)
        .not('violation_code', 'is', null);

      const { data: latest } = await supabase
        .from('external_echo_dmrs')
        .select('monitoring_period_end')
        .eq('npdes_id', npdesId)
        .order('monitoring_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      setDmrSummary({
        total: total ?? 0,
        withViolations: withViolations ?? 0,
        latestPeriod: latest?.monitoring_period_end ?? null,
      });
    }

    setLoading(false);
  }, [npdesId]);

  const fetchMsha = useCallback(async () => {
    if (!mineId) return;
    setLoading(true);

    const { data } = await supabase
      .from('external_msha_inspections')
      .select('*')
      .eq('mine_id', mineId)
      .order('inspection_date', { ascending: false })
      .limit(20);

    setMshaInspections((data || []) as MshaInspection[]);
    setLoading(false);
  }, [mineId]);

  useEffect(() => {
    fetchEcho();
  }, [fetchEcho]);

  useEffect(() => {
    fetchMsha();
  }, [fetchMsha]);

  return { echoFacility, dmrSummary, mshaInspections, loading, refetchEcho: fetchEcho, refetchMsha: fetchMsha };
}

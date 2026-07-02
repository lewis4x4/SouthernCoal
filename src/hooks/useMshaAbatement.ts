import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';

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

export interface MshaAbatementAlert {
  id: string;
  organization_id: string;
  inspection_id: string;
  mine_id: string;
  violation_number: string;
  abatement_due_date: string;
  days_until_due: number;
  urgency: 'overdue' | 'due_soon';
  significant_substantial: boolean;
  review_status: string;
  work_order_id: string | null;
  created_at: string;
}

export function useMshaAbatement(daysAhead = 14) {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;
  const [rows, setRows] = useState<MshaAbatementAtRisk[]>([]);
  const [alerts, setAlerts] = useState<MshaAbatementAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      return;
    }

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
  }, [orgId, daysAhead]);

  const fetchAlerts = useCallback(async () => {
    if (!orgId) {
      setAlerts([]);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('msha_abatement_alerts')
      .select(
        'id, organization_id, inspection_id, mine_id, violation_number, abatement_due_date, days_until_due, urgency, significant_substantial, review_status, work_order_id, created_at',
      )
      .eq('organization_id', orgId)
      .eq('review_status', 'pending')
      .order('abatement_due_date', { ascending: true });

    if (fetchError) {
      console.error('[msha] abatement alerts fetch failed:', fetchError.message);
      return;
    }
    setAlerts((data ?? []) as MshaAbatementAlert[]);
  }, [orgId]);

  const refetch = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setAlerts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    await Promise.all([fetchRows(), fetchAlerts()]);
    setLoading(false);
  }, [fetchAlerts, fetchRows, orgId]);

  const runAbatementDetection = useCallback(async () => {
    if (!orgId) return { error: 'No org', opened: 0 };

    setDetecting(true);
    const { data, error: rpcError } = await supabase.rpc('detect_msha_abatement_alerts', {
      p_organization_id: orgId,
      p_days_ahead: daysAhead,
      p_source: 'manual',
    });
    setDetecting(false);

    if (rpcError) {
      toast.error('Abatement detection failed');
      return { error: rpcError.message, opened: 0 };
    }

    const opened = (data as { opened?: number })?.opened ?? 0;
    toast.success(`Abatement detection complete — ${opened} alert(s) opened`);
    log('msha_abatement_detection_run', { opened }, {
      module: 'external_data',
      tableName: 'msha_abatement_alerts',
    });
    await Promise.all([fetchRows(), fetchAlerts()]);
    return { error: null, opened };
  }, [daysAhead, fetchAlerts, fetchRows, log, orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    rows,
    alerts,
    loading,
    detecting,
    error,
    refetch,
    runAbatementDetection,
  };
}

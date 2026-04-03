import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  DataIntegrityCheck,
  RetentionPolicy,
  SystemHealthLog,
} from '@/types/database';

export function useSystemHealth() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [integrityChecks, setIntegrityChecks] = useState<DataIntegrityCheck[]>([]);
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);
  const [healthLogs, setHealthLogs] = useState<SystemHealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);

  // -- Data Integrity Checks --

  const fetchIntegrityChecks = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('data_integrity_checks')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[health] integrity checks fetch error:', error.message);
    } else {
      setIntegrityChecks((data ?? []) as DataIntegrityCheck[]);
    }
  }, [orgId]);

  const runIntegrityCheck = useCallback(async () => {
    if (!orgId) return;
    setRunningCheck(true);
    try {
      const { data, error } = await supabase.rpc('run_data_integrity_check', {
        p_org_id: orgId,
      });
      if (error) {
        toast.error('Integrity check failed');
        console.error('[health] integrity check error:', error.message);
        return;
      }
      toast.success('Data integrity check complete');
      log('integrity_check_run', { check_id: data }, { module: 'system_health', tableName: 'data_integrity_checks', recordId: data as string });
      fetchIntegrityChecks();
    } finally {
      setRunningCheck(false);
    }
  }, [orgId, fetchIntegrityChecks, log]);

  // -- Retention Policies --

  const fetchRetentionPolicies = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('retention_policies')
      .select('*')
      .eq('organization_id', orgId)
      .order('record_type');

    if (error) {
      console.error('[health] retention policies fetch error:', error.message);
    } else {
      setRetentionPolicies((data ?? []) as RetentionPolicy[]);
    }
  }, [orgId]);

  const updateRetentionPolicy = useCallback(async (id: string, updates: Partial<RetentionPolicy>) => {
    const { error } = await supabase.from('retention_policies').update(updates).eq('id', id);
    if (error) {
      toast.error('Failed to update retention policy');
      return;
    }
    toast.success('Retention policy updated');
    log('retention_policy_updated', { id }, { module: 'system_health', tableName: 'retention_policies', recordId: id });
    fetchRetentionPolicies();
  }, [fetchRetentionPolicies, log]);

  // -- System Health Logs --

  const fetchHealthLogs = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('system_health_logs')
      .select('*')
      .eq('organization_id', orgId)
      .order('snapshot_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('[health] health logs fetch error:', error.message);
    } else {
      setHealthLogs((data ?? []) as SystemHealthLog[]);
    }
  }, [orgId]);

  // -- Init --

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([
      fetchIntegrityChecks(),
      fetchRetentionPolicies(),
      fetchHealthLogs(),
    ]).finally(() => setLoading(false));
  }, [orgId, fetchIntegrityChecks, fetchRetentionPolicies, fetchHealthLogs]);

  return {
    integrityChecks,
    retentionPolicies,
    healthLogs,
    loading,
    runningCheck,
    runIntegrityCheck,
    updateRetentionPolicy,
    fetchIntegrityChecks,
    fetchRetentionPolicies,
    fetchHealthLogs,
  };
}

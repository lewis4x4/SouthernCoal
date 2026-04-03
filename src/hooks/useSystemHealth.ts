import { useState, useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
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
  const [capturingSnapshot, setCapturingSnapshot] = useState(false);
  const [runningRetentionAudit, setRunningRetentionAudit] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const reportFetchError = useCallback((label: string, error: { message: string }) => {
    setFetchError(`Failed to load ${label}: ${error.message}`);
    console.error(`[health] ${label} fetch error:`, error.message);
  }, []);

  const fetchScopedRows = useCallback(
    async <T,>(options: {
      table: string;
      orderColumn: string;
      label: string;
      limit?: number;
      setRows: Dispatch<SetStateAction<T[]>>;
    }) => {
      if (!orgId) return;

      let query = supabase
        .from(options.table)
        .select('*')
        .eq('organization_id', orgId)
        .order(options.orderColumn, { ascending: false });

      if (typeof options.limit === 'number') {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        reportFetchError(options.label, error);
        return;
      }

      options.setRows((data ?? []) as T[]);
    },
    [orgId, reportFetchError],
  );

  // -- Data Integrity Checks --

  const fetchIntegrityChecks = useCallback(async () => {
    await fetchScopedRows<DataIntegrityCheck>({
      table: 'data_integrity_checks',
      orderColumn: 'created_at',
      label: 'integrity checks',
      limit: 20,
      setRows: setIntegrityChecks,
    });
  }, [fetchScopedRows]);

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
    await fetchScopedRows<RetentionPolicy>({
      table: 'retention_policies',
      orderColumn: 'record_type',
      label: 'retention policies',
      setRows: setRetentionPolicies,
    });
  }, [fetchScopedRows]);

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

  const runRetentionAudit = useCallback(async () => {
    if (!orgId) return null;

    setRunningRetentionAudit(true);
    try {
      const { data, error } = await supabase.rpc('run_retention_policy_audit', {
        p_org_id: orgId,
      });

      if (error) {
        toast.error('Retention audit failed');
        console.error('[health] retention audit error:', error.message);
        return null;
      }

      toast.success('Retention audit complete');
      await fetchRetentionPolicies();
      return data as number;
    } finally {
      setRunningRetentionAudit(false);
    }
  }, [fetchRetentionPolicies, orgId]);

  // -- System Health Logs --

  const fetchHealthLogs = useCallback(async () => {
    await fetchScopedRows<SystemHealthLog>({
      table: 'system_health_logs',
      orderColumn: 'snapshot_at',
      label: 'system health logs',
      limit: 30,
      setRows: setHealthLogs,
    });
  }, [fetchScopedRows]);

  const captureHealthSnapshot = useCallback(async () => {
    if (!orgId) return null;

    setCapturingSnapshot(true);
    try {
      const { data, error } = await supabase.rpc('capture_system_health_snapshot', {
        p_org_id: orgId,
      });

      if (error) {
        toast.error('Failed to capture system snapshot');
        console.error('[health] capture snapshot error:', error.message);
        return null;
      }

      toast.success('System health snapshot captured');
      await fetchHealthLogs();
      return data as string;
    } finally {
      setCapturingSnapshot(false);
    }
  }, [fetchHealthLogs, orgId]);

  // -- Init --

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      setFetchError('Your user profile is not assigned to an organization.');
      return;
    }
    setLoading(true);
    setFetchError(null);
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
    capturingSnapshot,
    runningRetentionAudit,
    fetchError,
    runIntegrityCheck,
    captureHealthSnapshot,
    runRetentionAudit,
    updateRetentionPolicy,
    fetchIntegrityChecks,
    fetchRetentionPolicies,
    fetchHealthLogs,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  ComplianceSnapshot,
  ComplianceTrendPoint,
  KPITarget,
} from '@/types/database';

// ---------------------------------------------------------------------------
// KPI evaluation helper
// ---------------------------------------------------------------------------

export type KPIStatus = 'green' | 'yellow' | 'red' | 'unknown';

export function evaluateKPI(
  value: number,
  target: KPITarget,
): KPIStatus {
  const { target_value, warning_threshold, direction } = target;

  if (direction === 'above') {
    if (value >= target_value) return 'green';
    if (warning_threshold != null && value >= warning_threshold) return 'yellow';
    return 'red';
  } else {
    if (value <= target_value) return 'green';
    if (warning_threshold != null && value <= warning_threshold) return 'yellow';
    return 'red';
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useComplianceSnapshots() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [latestSnapshot, setLatestSnapshot] = useState<ComplianceSnapshot | null>(null);
  const [trend, setTrend] = useState<ComplianceTrendPoint[]>([]);
  const [kpiTargets, setKpiTargets] = useState<KPITarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // ── Fetch latest snapshot ───────────────────────────────────────────────
  const fetchLatest = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('compliance_snapshots')
      .select('*')
      .eq('organization_id', orgId)
      .eq('snapshot_type', 'daily')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[snapshots] fetch error:', error.message);
    } else {
      setLatestSnapshot(data as ComplianceSnapshot | null);
    }
  }, [orgId]);

  // ── Fetch trend ─────────────────────────────────────────────────────────
  const fetchTrend = useCallback(async (days: number = 30) => {
    if (!orgId) return;
    const { data, error } = await supabase
      .rpc('get_compliance_trend', {
        p_org_id: orgId,
        p_days: days,
      });

    if (error) {
      console.error('[trend] fetch error:', error.message);
    } else {
      setTrend((data ?? []) as ComplianceTrendPoint[]);
    }
  }, [orgId]);

  // ── Fetch KPI targets ──────────────────────────────────────────────────
  const fetchKPITargets = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('kpi_targets')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('display_name');

    if (error) {
      console.error('[kpi_targets] fetch error:', error.message);
    } else {
      setKpiTargets((data ?? []) as KPITarget[]);
    }
  }, [orgId]);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchLatest(), fetchTrend(30), fetchKPITargets()]);
      setLoading(false);
    };
    load();
  }, [fetchLatest, fetchTrend, fetchKPITargets]);

  // ── Generate snapshot ───────────────────────────────────────────────────
  const generateSnapshot = useCallback(async (date?: string) => {
    if (!orgId) return null;
    setGenerating(true);
    const { data, error } = await supabase
      .rpc('generate_compliance_snapshot', {
        p_org_id: orgId,
        p_snapshot_date: date ?? new Date().toISOString().split('T')[0],
      });

    setGenerating(false);

    if (error) {
      toast.error('Failed to generate snapshot: ' + error.message);
      return null;
    }

    log('compliance_snapshot_generated', { date: date ?? 'today' }, {
      module: 'compliance_dashboard',
      tableName: 'compliance_snapshots',
      recordId: data as string,
    });

    toast.success('Compliance snapshot generated');
    await fetchLatest();
    await fetchTrend(30);
    return data;
  }, [orgId, log, fetchLatest, fetchTrend]);

  // ── Update KPI target ──────────────────────────────────────────────────
  const updateKPITarget = useCallback(async (
    id: string,
    updates: { target_value?: number; warning_threshold?: number; critical_threshold?: number },
  ) => {
    if (!profile) return;
    const { error } = await supabase
      .from('kpi_targets')
      .update({ ...updates, updated_by: profile.id })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update KPI target');
      return;
    }

    log('kpi_target_updated', updates, {
      module: 'compliance_dashboard',
      tableName: 'kpi_targets',
      recordId: id,
    });

    toast.success('KPI target updated');
    fetchKPITargets();
  }, [profile, log, fetchKPITargets]);

  // ── Map KPI key to snapshot value ──────────────────────────────────────
  const getKPIValue = useCallback((kpiKey: string): number | null => {
    if (!latestSnapshot) return null;
    const map: Record<string, number | null> = {
      sampling_compliance: latestSnapshot.sampling_compliance_pct,
      exceedance_rate: latestSnapshot.exceedance_rate_pct,
      ca_closure_days: latestSnapshot.avg_ca_closure_days,
      dmr_submission_rate: latestSnapshot.dmr_submission_rate_pct,
      open_violations: latestSnapshot.open_violations,
      compliance_score: latestSnapshot.compliance_score,
    };
    return map[kpiKey] ?? null;
  }, [latestSnapshot]);

  return {
    latestSnapshot,
    trend,
    kpiTargets,
    loading,
    generating,
    generateSnapshot,
    updateKPITarget,
    getKPIValue,
    fetchTrend,
    refresh: () => {
      fetchLatest();
      fetchTrend(30);
      fetchKPITargets();
    },
  };
}

export default useComplianceSnapshots;

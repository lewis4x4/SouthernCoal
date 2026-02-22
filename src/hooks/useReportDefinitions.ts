import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { usePermissions } from './usePermissions';

export interface ReportDefinition {
  id: string;
  report_key: string;
  report_number: number;
  title: string;
  description: string;
  tier: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  formats_available: string[];
  prerequisite_condition: string | null;
  prerequisite_table: string | null;
  is_locked: boolean;
}

export interface ReportDefinitionWithAccess extends ReportDefinition {
  has_access: boolean;
}

const TIER_LABELS: Record<number, string> = {
  1: 'Generate Now',
  2: 'After Lab Import',
  3: 'After Exceedance Detection',
  4: 'Quarterly / Annual',
  5: 'Specialized / On-Demand',
};

export { TIER_LABELS };

export function useReportDefinitions() {
  const { getEffectiveRole } = usePermissions();
  const [definitions, setDefinitions] = useState<ReportDefinitionWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const role = getEffectiveRole();

  const fetchDefinitions = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [defsResult, permsResult] = await Promise.all([
      supabase
        .from('report_definitions')
        .select('id, report_key, report_number, title, description, tier, priority, formats_available, prerequisite_condition, prerequisite_table, is_locked')
        .order('report_number'),
      supabase
        .from('report_role_permissions')
        .select('report_definition_id')
        .eq('role_name', role),
    ]);

    if (defsResult.error) {
      setError(defsResult.error.message);
      setLoading(false);
      return;
    }

    if (permsResult.error) {
      setError(permsResult.error.message);
      setLoading(false);
      return;
    }

    const permittedIds = new Set(
      (permsResult.data ?? []).map((p) => p.report_definition_id),
    );

    const withAccess: ReportDefinitionWithAccess[] = (defsResult.data ?? []).map((d) => ({
      ...d,
      has_access: role === 'admin' || permittedIds.has(d.id),
    }));

    setDefinitions(withAccess);
    setLoading(false);
  }, [role]);

  useEffect(() => {
    fetchDefinitions();
  }, [fetchDefinitions]);

  const byTier = useCallback(
    (tier: number) => definitions.filter((d) => d.tier === tier),
    [definitions],
  );

  const accessible = useMemo(() => definitions.filter((d) => d.has_access), [definitions]);
  const unlocked = useMemo(() => definitions.filter((d) => !d.is_locked), [definitions]);
  const locked = useMemo(() => definitions.filter((d) => d.is_locked), [definitions]);

  return {
    definitions,
    accessible,
    unlocked,
    locked,
    byTier,
    loading,
    error,
    refetch: fetchDefinitions,
    TIER_LABELS,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  OutfallAlias,
  OutfallAliasSource,
  OutfallMatchMethod,
  ParameterAliasWithName,
} from '@/types/database';

export interface OutfallAliasRow extends OutfallAlias {
  outfalls: { outfall_number: string; npdes_permits: { permit_number: string } | null } | null;
}

export interface OutfallPickerOption {
  id: string;
  outfall_number: string;
  permit_number: string;
  permit_id: string;
}

export function useAliasRegistry() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [parameterAliases, setParameterAliases] = useState<ParameterAliasWithName[]>([]);
  const [outfallAliases, setOutfallAliases] = useState<OutfallAliasRow[]>([]);
  const [outfallOptions, setOutfallOptions] = useState<OutfallPickerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchParameterAliases = useCallback(async () => {
    const { data, error } = await supabase
      .from('parameter_aliases')
      .select('id, parameter_id, alias, source, state_code, created_at, parameters(name)')
      .order('alias')
      .limit(2000);

    if (error) {
      console.warn('[useAliasRegistry] parameter_aliases fetch failed:', error.message);
      return;
    }
    setParameterAliases(
      (data ?? []).map((row) => {
        const paramJoin = row.parameters as { name?: string } | { name?: string }[] | null;
        const param = Array.isArray(paramJoin) ? paramJoin[0] : paramJoin;
        return {
          id: row.id as string,
          parameter_id: row.parameter_id as string,
          alias: row.alias as string,
          source: row.source as ParameterAliasWithName['source'],
          state_code: row.state_code as string | null,
          created_at: row.created_at as string,
          parameters: param?.name ? { name: param.name } : null,
        };
      }),
    );
  }, []);

  const fetchOutfallAliases = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('outfall_aliases')
      .select(
        'id, outfall_id, alias, source, match_method, organization_id, permit_id, created_at, outfalls(outfall_number, npdes_permits(permit_number))',
      )
      .eq('organization_id', orgId)
      .order('alias')
      .limit(500);

    if (error) {
      console.warn('[useAliasRegistry] outfall_aliases fetch failed:', error.message);
      return;
    }
    setOutfallAliases(
      (data ?? []).map((row) => {
        const outfallJoin = row.outfalls as
          | { outfall_number?: string; npdes_permits?: { permit_number?: string } | { permit_number?: string }[] | null }
          | { outfall_number?: string; npdes_permits?: { permit_number?: string } | { permit_number?: string }[] | null }[]
          | null;
        const outfall = Array.isArray(outfallJoin) ? outfallJoin[0] : outfallJoin;
        const permitJoin = outfall?.npdes_permits;
        const permit = Array.isArray(permitJoin) ? permitJoin[0] : permitJoin;
        return {
          id: row.id as string,
          outfall_id: row.outfall_id as string,
          alias: row.alias as string,
          source: row.source as OutfallAliasRow['source'],
          match_method: row.match_method as OutfallAliasRow['match_method'],
          organization_id: row.organization_id as string,
          permit_id: row.permit_id as string | null,
          created_at: row.created_at as string,
          outfalls: outfall?.outfall_number
            ? {
                outfall_number: outfall.outfall_number,
                npdes_permits: permit?.permit_number ? { permit_number: permit.permit_number } : null,
              }
            : null,
        };
      }),
    );
  }, [orgId]);

  const fetchOutfallOptions = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('outfalls')
      .select('id, outfall_number, permit_id, npdes_permits!inner(permit_number, organization_id)')
      .eq('npdes_permits.organization_id', orgId)
      .order('outfall_number')
      .limit(500);

    if (error) {
      console.warn('[useAliasRegistry] outfall picker fetch failed:', error.message);
      return;
    }

    setOutfallOptions(
      (data ?? []).map((row) => {
        const permitJoin = row.npdes_permits as
          | { permit_number?: string; organization_id?: string }
          | { permit_number?: string; organization_id?: string }[]
          | null;
        const permit = Array.isArray(permitJoin) ? permitJoin[0] : permitJoin;
        return {
          id: row.id as string,
          outfall_number: row.outfall_number as string,
          permit_id: row.permit_id as string,
          permit_number: permit?.permit_number ?? '—',
        };
      }),
    );
  }, [orgId]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchParameterAliases(), fetchOutfallAliases(), fetchOutfallOptions()]);
    setLoading(false);
  }, [fetchParameterAliases, fetchOutfallAliases, fetchOutfallOptions]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const createOutfallAlias = useCallback(
    async (alias: string, outfallId: string, permitId: string | null) => {
      if (!orgId) return { error: 'No organization' };
      const trimmed = alias.trim();
      if (!trimmed) return { error: 'Alias is required' };

      setSaving(true);
      const { error } = await supabase.from('outfall_aliases').insert({
        organization_id: orgId,
        outfall_id: outfallId,
        permit_id: permitId,
        alias: trimmed,
        source: 'manual' satisfies OutfallAliasSource,
        match_method: 'user_confirmed' satisfies OutfallMatchMethod,
      });
      setSaving(false);

      if (error) {
        return { error: error.message };
      }

      log(
        'outfall_alias_created',
        { alias: trimmed, outfall_id: outfallId },
        { module: 'compliance', tableName: 'outfall_aliases' },
      );
      toast.success(`Outfall alias "${trimmed}" saved`);
      await fetchOutfallAliases();
      return { error: null };
    },
    [orgId, fetchOutfallAliases, log],
  );

  return {
    parameterAliases,
    outfallAliases,
    outfallOptions,
    loading,
    saving,
    refetch,
    createOutfallAlias,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';

export interface NpdesOverride {
  id: string;
  organization_id: string;
  state_code: string;
  source_permit_id: string;
  npdes_id: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface UnmatchedPermit {
  source_permit_id: string;
  state_code: string;
}

export function useNpdesOverrides() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [overrides, setOverrides] = useState<NpdesOverride[]>([]);
  const [unmatchedPermits, setUnmatchedPermits] = useState<UnmatchedPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const orgId = profile?.organization_id;

  const fetchOverrides = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    // Fetch existing overrides
    const { data: overrideData } = await supabase
      .from('npdes_id_overrides')
      .select('*')
      .eq('organization_id', orgId)
      .order('state_code')
      .order('source_permit_id');

    setOverrides((overrideData || []) as NpdesOverride[]);

    // Fetch permits that failed ECHO sync (no matching facility row)
    // These are permits in file_processing_queue that have no external_echo_facilities match
    const { data: queuePermits } = await supabase
      .from('file_processing_queue')
      .select('extracted_data, state_code')
      .in('status', ['parsed', 'embedded', 'imported'])
      .eq('file_category', 'npdes_permit')
      .not('extracted_data->permit_number', 'is', null);

    const { data: echoFacilities } = await supabase
      .from('external_echo_facilities')
      .select('npdes_id');

    const echoSet = new Set((echoFacilities || []).map((f) => (f.npdes_id as string).toUpperCase()));
    const overrideSourceSet = new Set((overrideData || []).map((o) => (o as NpdesOverride).source_permit_id.toUpperCase()));

    // Find permits that are neither in ECHO nor already have an override
    const unmatched: UnmatchedPermit[] = [];
    const seen = new Set<string>();
    for (const row of queuePermits || []) {
      const permitNum = (row.extracted_data as Record<string, unknown>)?.permit_number as string | undefined;
      if (!permitNum) continue;

      const cleaned = permitNum.trim().toUpperCase();
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);

      // Skip if already in ECHO or already has an override
      if (echoSet.has(cleaned) || overrideSourceSet.has(cleaned)) continue;

      unmatched.push({
        source_permit_id: cleaned,
        state_code: row.state_code || 'Unknown',
      });
    }

    setUnmatchedPermits(unmatched.sort((a, b) => a.state_code.localeCompare(b.state_code) || a.source_permit_id.localeCompare(b.source_permit_id)));
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const saveOverride = useCallback(
    async (sourcePermitId: string, npdesId: string, stateCode: string, notes?: string) => {
      if (!orgId || !user) return { error: 'Not authenticated' };
      setSaving(true);

      const { error } = await supabase
        .from('npdes_id_overrides')
        .upsert(
          {
            organization_id: orgId,
            state_code: stateCode,
            source_permit_id: sourcePermitId.trim().toUpperCase(),
            npdes_id: npdesId.trim().toUpperCase(),
            notes: notes || null,
            created_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,source_permit_id' },
        );

      setSaving(false);

      if (error) return { error: error.message };

      // Refresh data
      await fetchOverrides();
      return { error: null };
    },
    [orgId, user, fetchOverrides],
  );

  const deleteOverride = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('npdes_id_overrides').delete().eq('id', id);
      if (!error) await fetchOverrides();
      return { error: error?.message || null };
    },
    [fetchOverrides],
  );

  return { overrides, unmatchedPermits, loading, saving, saveOverride, deleteOverride, refetch: fetchOverrides };
}

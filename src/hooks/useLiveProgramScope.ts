import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { buildLiveProgramScope, type LiveProgramScopeRow } from '@/lib/liveProgramScope';

export function useLiveProgramScope() {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;
  const [rows, setRows] = useState<LiveProgramScopeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('live_program_roster')
        .select(`
          site_id,
          permit_id,
          outfall_id,
          state_code,
          source_row:cutover_matrix_rows (
            permit_number,
            outfall_number,
            state_code
          )
        `)
        .eq('organization_id', orgId);

      if (!cancelled) {
        if (error || !data) {
          setRows([]);
        } else {
          const normalized = (data ?? []).map((row) => ({
            site_id: row.site_id,
            permit_id: row.permit_id,
            outfall_id: row.outfall_id,
            state_code: row.state_code,
            source_row: Array.isArray(row.source_row) ? (row.source_row[0] ?? null) : row.source_row ?? null,
          }));
          setRows(normalized as LiveProgramScopeRow[]);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const scope = useMemo(() => buildLiveProgramScope(rows), [rows]);

  return {
    rows,
    scope,
    loading,
  };
}

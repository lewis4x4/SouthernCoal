import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  downloadSyntheticLimitsCsv,
  type SyntheticPermitLimitRow,
} from '@/lib/syntheticPermitLimits';

interface LimitQueryRow {
  limit_type: string;
  limit_value: number | null;
  unit: string;
  review_status: string;
  npdes_permits: { permit_number: string } | { permit_number: string }[] | null;
  outfalls: { outfall_number: string } | { outfall_number: string }[] | null;
  parameters:
    | { name: string; parameter_code: string | null }
    | { name: string; parameter_code: string | null }[]
    | null;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapRows(data: LimitQueryRow[]): SyntheticPermitLimitRow[] {
  return data.map((row) => {
    const permit = first(row.npdes_permits);
    const outfall = first(row.outfalls);
    const parameter = first(row.parameters);
    return {
      permit_number: permit?.permit_number ?? '',
      outfall_number: outfall?.outfall_number ?? '',
      parameter_code: parameter?.parameter_code ?? '',
      parameter_name: parameter?.name ?? '',
      limit_type: row.limit_type,
      limit_value: row.limit_value,
      unit: row.unit,
      review_status: row.review_status,
    };
  });
}

export function useSyntheticPermitLimitsExport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportCsv = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('permit_limits')
      .select(
        'limit_type, limit_value, unit, review_status, npdes_permits(permit_number), outfalls(outfall_number), parameters(name, parameter_code)',
      )
      .ilike('condition_notes', '%SYNTHETIC_UAT_SLICE1%')
      .order('review_status')
      .limit(2000);

    setLoading(false);
    if (queryError) {
      setError(queryError.message);
      return { ok: false as const, error: queryError.message };
    }

    const rows = mapRows((data ?? []) as unknown as LimitQueryRow[]);
    downloadSyntheticLimitsCsv(rows);
    return { ok: true as const, count: rows.length };
  }, []);

  return { exportCsv, loading, error };
}

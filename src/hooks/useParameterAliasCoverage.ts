import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PARAMETER_MAP } from '../../supabase/functions/_shared/lab-import-records.ts';
import {
  parseParameterAliasCoverage,
  validateParserParameterMap,
  type ParameterAliasCoverage,
  type ParameterMapValidationResult,
} from '@/lib/parameterAliasValidation';

export function useParameterAliasCoverage() {
  const [coverage, setCoverage] = useState<ParameterAliasCoverage | null>(null);
  const [parserCheck, setParserCheck] = useState<ParameterMapValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('get_parameter_alias_coverage');
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      setCoverage(null);
      return null;
    }

    const parsed = parseParameterAliasCoverage(data);
    setCoverage(parsed);
    setParserCheck(validateParserParameterMap(PARAMETER_MAP));
    return parsed;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const harnessOk = Boolean(coverage?.ok && parserCheck?.valid);

  return {
    coverage,
    parserCheck,
    loading,
    error,
    harnessOk,
    refresh,
  };
}

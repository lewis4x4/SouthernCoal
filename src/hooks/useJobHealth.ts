import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface JobHealthEntry {
  job_name: string;
  display_name: string;
  cadence_hours: number;
  last_run_id: string | null;
  last_status: 'running' | 'succeeded' | 'failed' | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  hours_since_last_run: number | null;
  is_stale: boolean;
  presumed_failed: boolean;
  rows_scanned: number | null;
  rows_affected: number | null;
  error_detail: string | null;
}

export function useJobHealth() {
  const [jobs, setJobs] = useState<JobHealthEntry[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobHealth = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('get_job_health');

    if (rpcError) {
      setError(rpcError.message);
      setJobs([]);
      setGeneratedAt(null);
    } else {
      const payload = data as { jobs?: JobHealthEntry[]; generated_at?: string } | null;
      setJobs(payload?.jobs ?? []);
      setGeneratedAt(payload?.generated_at ?? null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchJobHealth();
  }, [fetchJobHealth]);

  return { jobs, generatedAt, loading, error, refetch: fetchJobHealth };
}

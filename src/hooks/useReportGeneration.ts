import { useState, useCallback, useRef } from 'react';
import { getFreshToken } from '@/lib/supabase';
import { useAuditLog } from './useAuditLog';
import { toast } from 'sonner';

interface GenerateConfig {
  date_from?: string;
  date_to?: string;
  states?: string[];
  org_ids?: string[];
  format?: string;
}

interface DeliveryConfig {
  download?: boolean;
  email?: boolean;
  recipients?: string[];
}

interface GenerationJob {
  job_id: string;
  report_key: string;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  download_url?: string;
  row_count?: number;
  data_quality_flags?: Record<string, unknown>;
  error_message?: string;
  completed_at?: string;
}

export function useReportGeneration() {
  const { log } = useAuditLog();
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (jobId: string) => {
      const token = await getFreshToken();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-status?job_id=${jobId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await resp.json();

      if (data.status === 'complete' || data.status === 'failed') {
        stopPolling();
        setGenerating(false);

        const updated: GenerationJob = {
          job_id: jobId,
          report_key: job?.report_key ?? '',
          status: data.status,
          download_url: data.download_url,
          row_count: data.row_count,
          data_quality_flags: data.data_quality_flags,
          error_message: data.error_message,
          completed_at: data.completed_at,
        };
        setJob(updated);

        if (data.status === 'complete') {
          toast.success(`Report ready — ${data.row_count ?? 0} rows`);
        } else {
          toast.error(`Report failed: ${data.error_message ?? 'Unknown error'}`);
        }
      }
    },
    [job?.report_key, stopPolling],
  );

  const generate = useCallback(
    async (
      reportKey: string,
      config: GenerateConfig = {},
      format: 'csv' | 'pdf' | 'both' = 'csv',
      delivery: DeliveryConfig = { download: true },
    ): Promise<GenerationJob | null> => {
      setGenerating(true);
      stopPolling();

      try {
        const token = await getFreshToken();
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-report`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              report_key: reportKey,
              format,
              config,
              delivery,
            }),
          },
        );

        const data = await resp.json();

        if (!data.success) {
          setGenerating(false);
          toast.error(data.error ?? 'Failed to start report generation');
          return null;
        }

        const newJob: GenerationJob = {
          job_id: data.job_id,
          report_key: reportKey,
          status: 'pending',
        };
        setJob(newJob);

        log('filter_change', {
          action: 'report_generation_started',
          report_key: reportKey,
          job_id: data.job_id,
          format,
          config,
        });

        // Start polling every 3s
        pollRef.current = setInterval(() => {
          pollStatus(data.job_id);
        }, 3000);

        // Also do an immediate check after 1s
        setTimeout(() => pollStatus(data.job_id), 1000);

        return newJob;
      } catch (err) {
        setGenerating(false);
        toast.error(`Generation error: ${String(err)}`);
        return null;
      }
    },
    [log, stopPolling, pollStatus],
  );

  const download = useCallback((url: string) => {
    window.open(url, '_blank');
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setJob(null);
    setGenerating(false);
  }, [stopPolling]);

  return { generate, download, reset, job, generating };
}

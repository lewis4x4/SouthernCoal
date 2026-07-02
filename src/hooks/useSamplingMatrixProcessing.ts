import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { isSamplingMatrixTabularFile } from '@/lib/queueProcessorRouting';
import { useQueueStore } from '@/stores/queue';

/**
 * Sampling matrix processing — triggers parse-sampling-matrix Edge Function.
 * Applies to sampling_matrix queue rows whose filenames are .xlsx / .xls / .csv.
 */
export function useSamplingMatrixProcessing() {
  const { log } = useAuditLog();

  const processSamplingMatrix = useCallback(async (queueId: string) => {
    const entry = useQueueStore.getState().entries.find((e) => e.id === queueId);
    if (!entry) return;

    useQueueStore.getState().upsertEntry({
      ...entry,
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    });

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), 30_000),
      );

      const { error: fnError } = await Promise.race([
        supabase.functions.invoke('parse-sampling-matrix', {
          body: { queue_id: queueId },
        }),
        timeoutPromise,
      ]);

      if (fnError) {
        throw new Error(fnError.message || 'Edge Function error');
      }

      toast.info(`Sampling matrix parsing started for ${entry.file_name}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.info(`Processing ${entry.file_name}... (this may take a moment)`);
        return;
      }
      const message = err instanceof Error ? err.message : 'Processing failed';
      toast.error(`Failed to process ${entry.file_name}: ${message}`, {
        action: {
          label: 'View Details',
          onClick: () => useQueueStore.getState().setExpandedRow(queueId),
        },
      });
    }
  }, []);

  const processAllQueuedSamplingMatrices = useCallback(async () => {
    const queued = useQueueStore.getState().entries.filter(
      (e) =>
        e.status === 'queued' &&
        e.file_category === 'sampling_matrix' &&
        isSamplingMatrixTabularFile(e),
    );

    if (queued.length === 0) {
      toast.info('No queued sampling matrix files to process.');
      return;
    }

    log(
      'bulk_process',
      { action: 'sampling_matrix_parse_batch', count: queued.length },
      { module: 'upload_dashboard', tableName: 'file_processing_queue' },
    );

    toast.info(`Processing ${queued.length} sampling matrix file${queued.length === 1 ? '' : 's'}...`);

    for (const entry of queued) {
      await processSamplingMatrix(entry.id);
      await new Promise((r) => setTimeout(r, 300));
    }
  }, [log, processSamplingMatrix]);

  return { processSamplingMatrix, processAllQueuedSamplingMatrices };
}

import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { isParameterSheetFile } from '@/lib/queueProcessorRouting';
import { useQueueStore } from '@/stores/queue';
import type { QueueEntry } from '@/types/queue';

/**
 * WV parameter sheet processing — triggers parse-parameter-sheet Edge Function.
 * Applies to npdes_permit queue rows whose filenames are .xlsx / .xls.
 */
export function useParameterSheetProcessing() {
  const { log } = useAuditLog();

  const processParameterSheet = useCallback(async (queueId: string) => {
    const entry = useQueueStore
      .getState()
      .entries.find((e) => e.id === queueId);

    if (!entry) return;

    useQueueStore.getState().upsertEntry({
      ...entry,
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    });

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), 10_000),
      );

      try {
        const { error: fnError } = await Promise.race([
          supabase.functions.invoke('parse-parameter-sheet', {
            body: { queue_id: queueId },
          }),
          timeoutPromise,
        ]);

        if (fnError) {
          throw new Error(fnError.message || 'Edge Function error');
        }
      } catch (invokeErr) {
        if (invokeErr instanceof DOMException && invokeErr.name === 'AbortError') {
          toast.info(`Processing ${entry.file_name}... (this may take a moment)`);
          return;
        }
        throw invokeErr;
      }

      toast.info(`Parameter sheet processing started for ${entry.file_name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      toast.error(`Failed to process ${entry.file_name}: ${message}`, {
        action: {
          label: 'View Details',
          onClick: () => useQueueStore.getState().setExpandedRow(queueId),
        },
      });
    }
  }, []);

  const processAllQueued = useCallback(async () => {
    const entries = useQueueStore.getState().entries;
    const queued = entries.filter(
      (e) =>
        e.status === 'queued' &&
        e.file_category === 'npdes_permit' &&
        isParameterSheetFile(e),
    );

    if (queued.length === 0) {
      toast.info('No queued parameter sheets to process.');
      return;
    }

    log(
      'bulk_process_parameter_sheets',
      { count: queued.length, source: 'processing_queue' },
      { module: 'upload_dashboard', tableName: 'file_processing_queue' },
    );

    toast.info(
      `Processing ${queued.length} parameter sheet${queued.length > 1 ? 's' : ''}...`,
    );

    for (let i = 0; i < queued.length; i++) {
      const entry = queued[i]!;

      useQueueStore.getState().upsertEntry({
        ...entry,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      });

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), 180_000),
        );

        const { error: fnError } = await Promise.race([
          supabase.functions.invoke('parse-parameter-sheet', {
            body: { queue_id: entry.id },
          }),
          timeoutPromise,
        ]);

        if (fnError) {
          console.error(`[parameter-sheet] Failed ${entry.file_name}:`, fnError.message);
          toast.error(`Failed: ${entry.file_name}`);
        } else {
          toast.success(`Parsed ${entry.file_name} (${i + 1}/${queued.length})`);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          toast.warning(`${entry.file_name} timed out (still processing server-side)`);
        } else {
          console.error(`[parameter-sheet] Error ${entry.file_name}:`, err);
          toast.error(`Error processing ${entry.file_name}`);
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    toast.success(`Finished processing ${queued.length} parameter sheets.`);

    const { data: freshEntries } = await supabase
      .from('file_processing_queue')
      .select('*')
      .order('created_at', { ascending: false });
    if (freshEntries) {
      useQueueStore.getState().setEntries(freshEntries as QueueEntry[]);
    }
  }, [log]);

  const retryFailed = useCallback(
    async (queueId: string) => {
      await processParameterSheet(queueId);
    },
    [processParameterSheet],
  );

  return { processParameterSheet, processAllQueued, retryFailed };
}

import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';

/**
 * Lab data processing hook — triggers parse-lab-data-edd Edge Function.
 * Does NOT wait on HTTP response (fire-and-forget).
 * Status tracked via Realtime subscription.
 */
export function useLabDataProcessing() {
  /**
   * Process a single lab data file.
   */
  const processLabData = useCallback(async (queueId: string) => {
    const entry = useQueueStore
      .getState()
      .entries.find((e) => e.id === queueId);

    if (!entry) return;

    // Optimistic status update
    useQueueStore.getState().upsertEntry({
      ...entry,
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    });

    try {
      // Refresh the JWT before each Edge Function call
      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session) {
          window.location.href = '/login?reason=session_expired';
          return;
        }
        session = refreshed.session;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      // Fire with 10s timeout — just long enough to catch immediate HTTP errors.
      // Edge Function continues server-side; Realtime subscription handles status updates.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/parse-lab-data-edd`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ queue_id: queueId }),
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP ${response.status}`);
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        // AbortError = timeout, Edge Function still running server-side
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          toast.info(`Processing ${entry.file_name}... (this may take a moment)`);
          return;
        }
        throw fetchErr;
      }

      toast.info(`Processing started for ${entry.file_name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      toast.error(`Failed to process ${entry.file_name}: ${message}`, {
        action: {
          label: 'View Details',
          onClick: () =>
            useQueueStore.getState().setExpandedRow(queueId),
        },
      });

      // Revert optimistic update
      useQueueStore.getState().upsertEntry({
        ...entry,
        status: entry.status,
        processing_started_at: entry.processing_started_at,
      });
    }
  }, []);

  /**
   * Process all queued lab data files sequentially.
   */
  const processAllQueuedLabData = useCallback(async () => {
    const entries = useQueueStore.getState().entries;
    const queued = entries.filter(
      (e) =>
        e.status === 'queued' && e.file_category === 'lab_data',
    );

    if (queued.length === 0) {
      toast.info('No queued lab data files to process.');
      return;
    }

    toast.info(`Processing ${queued.length} queued lab data file${queued.length > 1 ? 's' : ''}...`);

    for (const entry of queued) {
      await processLabData(entry.id);
      // Small delay between sequential processing calls
      await new Promise((r) => setTimeout(r, 500));
    }
  }, [processLabData]);

  /**
   * Retry a failed lab data file.
   */
  const retryFailed = useCallback(
    async (queueId: string) => {
      await processLabData(queueId);
    },
    [processLabData],
  );

  return { processLabData, processAllQueuedLabData, retryFailed };
}

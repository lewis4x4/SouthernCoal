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
      // Refresh the JWT before each Edge Function call (per CLAUDE.md: getFreshToken)
      const {
        data: { session },
        error: refreshError,
      } = await supabase.auth.refreshSession();

      if (refreshError || !session) {
        window.location.href = '/login?reason=session_expired';
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      // Fire and forget — Realtime subscription handles status updates
      const response = await fetch(
        `${supabaseUrl}/functions/v1/parse-lab-data-edd`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ queue_id: queueId }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
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

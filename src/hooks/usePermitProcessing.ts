import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';

/**
 * Permit processing hook — triggers parse-permit-pdf Edge Function.
 * Does NOT wait on HTTP response (v5: 30-90s timeout).
 * Status tracked via Realtime subscription.
 */
export function usePermitProcessing() {
  /**
   * Process a single permit PDF.
   */
  const processPermit = useCallback(async (queueId: string) => {
    // Optimistic status update
    const entry = useQueueStore
      .getState()
      .entries.find((e) => e.id === queueId);

    if (!entry) return;

    // Update local state immediately
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
        `${supabaseUrl}/functions/v1/parse-permit-pdf`,
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

      // Response received — but actual status update comes via Realtime
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
   * Process all queued permits sequentially (not all at once).
   */
  const processAllQueued = useCallback(async () => {
    const entries = useQueueStore.getState().entries;
    const queued = entries.filter(
      (e) =>
        e.status === 'queued' && e.file_category === 'npdes_permit',
    );

    if (queued.length === 0) {
      toast.info('No queued permits to process.');
      return;
    }

    toast.info(`Processing ${queued.length} queued permit${queued.length > 1 ? 's' : ''}...`);

    for (const entry of queued) {
      await processPermit(entry.id);
      // Small delay between sequential processing calls
      await new Promise((r) => setTimeout(r, 500));
    }
  }, [processPermit]);

  /**
   * Retry a failed permit.
   */
  const retryFailed = useCallback(
    async (queueId: string) => {
      await processPermit(queueId);
    },
    [processPermit],
  );

  return { processPermit, processAllQueued, retryFailed };
}

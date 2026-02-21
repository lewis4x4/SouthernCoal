import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import type { QueueEntry } from '@/types/queue';

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
    const entry = useQueueStore
      .getState()
      .entries.find((e) => e.id === queueId);

    if (!entry) return;

    // Immediate UI feedback — Realtime subscription handles the real status
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
          `${supabaseUrl}/functions/v1/parse-permit-pdf`,
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
    }
  }, []);

  /**
   * Process all queued permits — truly sequential to avoid connection pool exhaustion.
   * Waits for each Edge Function to complete before starting the next.
   * Pool size is only 15, so we MUST limit to 1 concurrent Edge Function.
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

    for (let i = 0; i < queued.length; i++) {
      const entry = queued[i]!;

      // Optimistic UI update — show 'processing' immediately
      useQueueStore.getState().upsertEntry({
        ...entry,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      });

      // Refresh session before each call
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

      try {
        // Wait for the FULL response — ensures Edge Function finishes
        // and releases its DB connection before we start the next one.
        // 180s timeout prevents indefinite hangs on batch processing.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180_000);

        const response = await fetch(
          `${supabaseUrl}/functions/v1/parse-permit-pdf`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ queue_id: entry.id }),
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[permits] Failed ${entry.file_name}:`, errorText);
          toast.error(`Failed: ${entry.file_name}`);
        } else {
          toast.success(`Parsed ${entry.file_name} (${i + 1}/${queued.length})`);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.warn(`[permits] Timeout processing ${entry.file_name} — continuing batch`);
          toast.warning(`${entry.file_name} timed out (still processing server-side)`);
        } else {
          console.error(`[permits] Error processing ${entry.file_name}:`, err);
          toast.error(`Error processing ${entry.file_name}`);
        }
      }

      // Brief pause between files
      await new Promise((r) => setTimeout(r, 1000));
    }

    toast.success(`Finished processing ${queued.length} permits.`);

    // Force sync store with database — Realtime events may have been coalesced during batch
    const { data: freshEntries } = await supabase
      .from('file_processing_queue')
      .select('*')
      .order('created_at', { ascending: false });
    if (freshEntries) {
      useQueueStore.getState().setEntries(freshEntries as QueueEntry[]);
    }
  }, []);

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

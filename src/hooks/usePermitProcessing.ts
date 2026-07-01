import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase, getFreshToken, edgeFunctionFetchHeaders } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { isParameterSheetFile } from '@/lib/queueProcessorRouting';
import { useQueueStore } from '@/stores/queue';
import type { QueueEntry } from '@/types/queue';

const PARSE_PERMIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-permit-pdf`;

async function invokeParsePermitPdf(queueId: string, timeoutMs: number): Promise<void> {
  const token = await getFreshToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(PARSE_PERMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...edgeFunctionFetchHeaders(token),
      },
      body: JSON.stringify({ queue_id: queueId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `Edge Function HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Permit processing hook — triggers parse-permit-pdf Edge Function.
 * Uses explicit fetch + getFreshToken() (v6 §11) — same path as compliance-search.
 * Status tracked via Realtime subscription.
 */
export function usePermitProcessing() {
  const { log } = useAuditLog();

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
      try {
        await invokeParsePermitPdf(queueId, 10_000);
      } catch (invokeErr) {
        // AbortError = timeout, Edge Function still running server-side
        if (invokeErr instanceof DOMException && invokeErr.name === 'AbortError') {
          toast.info(`Processing ${entry.file_name}... (this may take a moment)`);
          return;
        }
        throw invokeErr;
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
        e.status === 'queued' &&
        e.file_category === 'npdes_permit' &&
        !isParameterSheetFile(e),
    );

    if (queued.length === 0) {
      toast.info('No queued permits to process.');
      return;
    }

    log(
      'bulk_process_permits',
      { count: queued.length, source: 'processing_queue' },
      { module: 'upload_dashboard', tableName: 'file_processing_queue' },
    );

    toast.info(`Processing ${queued.length} queued permit${queued.length > 1 ? 's' : ''}...`);

    for (let i = 0; i < queued.length; i++) {
      const entry = queued[i]!;

      // Optimistic UI update — show 'processing' immediately
      useQueueStore.getState().upsertEntry({
        ...entry,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      });

      try {
        await invokeParsePermitPdf(entry.id, 180_000);
        toast.success(`Parsed ${entry.file_name} (${i + 1}/${queued.length})`);
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
  }, [log]);

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

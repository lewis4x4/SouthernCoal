import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase, getFreshToken, edgeFunctionFetchHeaders } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { isArchiveDocumentCategory } from '@/lib/queueProcessorRouting';
import { useQueueStore } from '@/stores/queue';

const ARCHIVE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-compliance-archive`;

async function invokeArchiveProcessor(queueId: string): Promise<void> {
  const token = await getFreshToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(ARCHIVE_URL, {
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
      throw new Error(detail || `HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Archive document processing — field inspections, quarterly/audit reports, enforcement.
 * Marks queue rows parsed and triggers embedding generation via Realtime hook.
 */
export function useArchiveDocumentProcessing() {
  const { log } = useAuditLog();

  const processArchiveDocument = useCallback(async (queueId: string) => {
    const entry = useQueueStore.getState().entries.find((e) => e.id === queueId);
    if (!entry) return;

    if (!isArchiveDocumentCategory(entry.file_category)) {
      toast.error('Not an archive document category');
      return;
    }

    useQueueStore.getState().upsertEntry({
      ...entry,
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    });

    try {
      await invokeArchiveProcessor(queueId);
      log('bulk_process', {
        action: 'compliance_archive_processed',
        queue_id: queueId,
        file_name: entry.file_name,
        file_category: entry.file_category,
      });

      const { data: freshEntry } = await supabase
        .from('file_processing_queue')
        .select('*')
        .eq('id', queueId)
        .single();

      if (freshEntry) {
        useQueueStore.getState().upsertEntry(freshEntry);
      }

      toast.success(`Indexed ${entry.file_name} for search`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      toast.error(`Failed to process ${entry.file_name}: ${message}`);

      // The client fetch failed (often a 30s timeout), but the Edge Function
      // may have already advanced the row server-side. Re-read the row by id so
      // the UI reflects reality instead of resurrecting the pre-processing copy.
      const { data: refetched } = await supabase
        .from('file_processing_queue')
        .select('*')
        .eq('id', queueId)
        .single();

      useQueueStore.getState().upsertEntry(refetched ?? { ...entry });
    }
  }, [log]);

  const processAllQueuedArchiveDocuments = useCallback(async () => {
    const queued = useQueueStore.getState().entries.filter(
      (e) => e.status === 'queued' && isArchiveDocumentCategory(e.file_category),
    );

    if (queued.length === 0) {
      toast.info('No queued archive documents to process.');
      return;
    }

    toast.info(`Processing ${queued.length} archive document${queued.length === 1 ? '' : 's'}...`);

    for (const entry of queued) {
      await processArchiveDocument(entry.id);
      await new Promise((r) => setTimeout(r, 300));
    }
  }, [processArchiveDocument]);

  return { processArchiveDocument, processAllQueuedArchiveDocuments };
}

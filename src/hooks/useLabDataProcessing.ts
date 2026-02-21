import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import type { QueueEntry } from '@/types/queue';

/**
 * Pre-parse XLSX/XLS file client-side to avoid SheetJS memory crash in Edge Functions.
 * SheetJS is ~30MB loaded — exceeds the 256MB Edge Function memory limit when combined
 * with file data. Browser has no such constraint, so we parse here and send rows as JSON.
 */
async function clientSideParseExcel(
  entry: QueueEntry,
): Promise<{ pre_parsed_rows: string[][]; file_format: 'xlsx' | 'xls' } | null> {
  const isExcel = /\.xlsx?$/i.test(entry.file_name);
  if (!isExcel || !entry.storage_bucket || !entry.storage_path) return null;

  const { data: fileData, error: dlError } = await supabase.storage
    .from(entry.storage_bucket)
    .download(entry.storage_path);

  if (dlError || !fileData) {
    throw new Error(`Failed to download file: ${dlError?.message ?? 'no data'}`);
  }

  const XLSX = await import('xlsx');
  const arrayBuffer = await fileData.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
    type: 'array',
    raw: false,
  });

  if (!workbook.SheetNames.length) {
    throw new Error('No worksheet found in this file.');
  }

  const firstSheetName = workbook.SheetNames[0]!;
  const sheet = workbook.Sheets[firstSheetName]!;
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  return {
    pre_parsed_rows: rows,
    file_format: entry.file_name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'xls',
  };
}

/**
 * Lab data processing hook — triggers parse-lab-data-edd Edge Function.
 * For XLSX/XLS files, parses client-side first to avoid Edge Function memory limits.
 * Uses supabase.functions.invoke() for SDK-managed auth (same path as storage).
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

    // Immediate UI feedback — Realtime subscription handles the real status
    useQueueStore.getState().upsertEntry({
      ...entry,
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    });

    try {
      // Client-side XLSX/XLS pre-parsing — avoids SheetJS memory crash in Edge Functions
      let preParsePayload: { pre_parsed_rows?: string[][]; file_format?: string } = {};
      const isExcel = /\.xlsx?$/i.test(entry.file_name);
      if (isExcel) {
        toast.info(`Preparing ${entry.file_name}...`);
        const parsed = await clientSideParseExcel(entry);
        if (parsed) {
          preParsePayload = parsed;
        }
      }

      // 30s timeout — accounts for client-side parsing + Edge Function processing.
      // Edge Function continues server-side; Realtime subscription handles status updates.
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), 30_000),
      );

      try {
        const { error: fnError } = await Promise.race([
          supabase.functions.invoke('parse-lab-data-edd', {
            body: { queue_id: queueId, ...preParsePayload },
          }),
          timeoutPromise,
        ]);

        if (fnError) {
          throw new Error(fnError.message || `Edge Function error`);
        }
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
   * Process all queued lab data files — truly sequential to avoid connection pool exhaustion.
   * Waits for each Edge Function to complete before starting the next.
   * Pool size is only 15, so we MUST limit to 1 concurrent Edge Function.
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

    for (let i = 0; i < queued.length; i++) {
      const entry = queued[i]!;

      // Optimistic UI update — show 'processing' immediately
      useQueueStore.getState().upsertEntry({
        ...entry,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      });

      try {
        // Client-side XLSX/XLS pre-parsing
        let preParsePayload: { pre_parsed_rows?: string[][]; file_format?: string } = {};
        const isExcel = /\.xlsx?$/i.test(entry.file_name);
        if (isExcel) {
          try {
            const parsed = await clientSideParseExcel(entry);
            if (parsed) preParsePayload = parsed;
          } catch (parseErr) {
            console.error(`[lab-data] Client-side parse failed for ${entry.file_name}:`, parseErr);
          }
        }

        // Wait for the FULL response — ensures Edge Function finishes
        // and releases its DB connection before we start the next one.
        // 180s timeout prevents indefinite hangs on batch processing.
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), 180_000),
        );

        const { error: fnError } = await Promise.race([
          supabase.functions.invoke('parse-lab-data-edd', {
            body: { queue_id: entry.id, ...preParsePayload },
          }),
          timeoutPromise,
        ]);

        if (fnError) {
          console.error(`[lab-data] Failed ${entry.file_name}:`, fnError.message);
          toast.error(`Failed: ${entry.file_name}`);
        } else {
          toast.success(`Parsed ${entry.file_name} (${i + 1}/${queued.length})`);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.warn(`[lab-data] Timeout processing ${entry.file_name} — continuing batch`);
          toast.warning(`${entry.file_name} timed out (still processing server-side)`);
        } else {
          console.error(`[lab-data] Error processing ${entry.file_name}:`, err);
          toast.error(`Error processing ${entry.file_name}`);
        }
      }

      // Brief pause between files
      await new Promise((r) => setTimeout(r, 1000));
    }

    toast.success(`Finished processing ${queued.length} lab data files.`);

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

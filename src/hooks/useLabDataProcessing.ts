import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import type { QueueEntry } from '@/types/queue';

/** EDD marker columns — if a row contains all three, it's likely an EDD header row. */
const EDD_MARKERS = ['permit', 'parameter', 'value'] as const;

/**
 * Check if a row of strings contains EDD header markers.
 * Normalizes each cell (lowercase, trim, collapse whitespace) before matching.
 */
function rowHasEddHeaders(row: string[]): boolean {
  if (!row || row.length < 15) return false;
  const normalized = row.map((c) => String(c ?? '').toLowerCase().trim().replace(/[\s_]+/g, ' '));
  const joined = normalized.join(' ');
  return EDD_MARKERS.every((marker) => joined.includes(marker));
}

/**
 * Pre-parse XLSX file client-side to avoid spreadsheet parsing pressure in Edge Functions.
 * Legacy XLS files still route server-side because the browser parser only supports XLSX.
 *
 * Scans all sheets looking for EDD headers (permit, parameter, value).
 * Lab reports commonly have a summary/cover sheet first with EDD data on a later sheet.
 * Falls back to the first sheet if no EDD sheet is found.
 */
async function clientSideParseExcel(
  entry: QueueEntry,
): Promise<{ pre_parsed_rows: string[][]; file_format: 'xlsx' } | null> {
  const isXlsx = /\.xlsx$/i.test(entry.file_name);
  if (!isXlsx || !entry.storage_bucket || !entry.storage_path) return null;

  const { data: fileData, error: dlError } = await supabase.storage
    .from(entry.storage_bucket)
    .download(entry.storage_path);

  if (dlError || !fileData) {
    throw new Error(`Failed to download file: ${dlError?.message ?? 'no data'}`);
  }

  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const workbook = await readXlsxFile(fileData);

  if (!workbook.length) {
    throw new Error('No worksheet found in this file.');
  }

  // Scan all sheets looking for EDD headers — lab reports often have cover sheets first
  let bestRows: string[][] | null = null;

  for (const sheet of workbook) {
    const rows = sheet.data.map((row) =>
      row.map((cell) => {
        if (cell == null) return '';
        if (cell instanceof Date) return cell.toISOString();
        return String(cell);
      }),
    );

    // Check first 25 rows for EDD markers
    const maxScan = Math.min(rows.length, 25);
    for (let i = 0; i < maxScan; i++) {
      if (rowHasEddHeaders(rows[i]!)) {
        console.log(`[lab-data] EDD headers found on sheet "${sheet.sheet}" at row ${i + 1}`);
        bestRows = rows;
        break;
      }
    }

    if (bestRows) break;
  }

  // Fall back to first sheet if no EDD sheet found
  if (!bestRows) {
    console.warn(
      `[lab-data] No EDD headers found in any sheet — using first sheet "${workbook[0]?.sheet ?? 'unknown'}"`,
    );
    bestRows = (workbook[0]?.data ?? []).map((row) =>
      row.map((cell) => {
        if (cell == null) return '';
        if (cell instanceof Date) return cell.toISOString();
        return String(cell);
      }),
    );
  }

  return {
    pre_parsed_rows: bestRows,
    file_format: 'xlsx',
  };
}

/** Threshold for routing large files to bulk-import-lab-data (500KB). */
const BULK_IMPORT_SIZE_THRESHOLD = 500 * 1024;

/**
 * Lab data processing hook — triggers parse-lab-data-edd Edge Function.
 * For XLSX/XLS files, parses client-side first to avoid Edge Function memory limits.
 * Files >500KB are routed to bulk-import-lab-data (combined parse+import, server-side).
 * Uses supabase.functions.invoke() for SDK-managed auth (same path as storage).
 * Status tracked via Realtime subscription.
 */
export function useLabDataProcessing() {
  /**
   * Process a single lab data file.
   * Files >500KB → bulk-import-lab-data (combined parse+import, server-side SheetJS)
   * Files <=500KB → parse-lab-data-edd (client-side pre-parse → preview → import)
   */
  const processLabData = useCallback(async (queueId: string) => {
    const entry = useQueueStore
      .getState()
      .entries.find((e) => e.id === queueId);

    if (!entry) return;

    const fileSize = entry.file_size_bytes ?? 0;
    const useBulk = fileSize > BULK_IMPORT_SIZE_THRESHOLD;

    // DEBUG — remove after confirming routing works
    console.log(`[lab-data] ROUTING: file="${entry.file_name}" size=${fileSize} threshold=${BULK_IMPORT_SIZE_THRESHOLD} useBulk=${useBulk}`);

    // Immediate UI feedback — Realtime subscription handles the real status
    useQueueStore.getState().upsertEntry({
      ...entry,
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    });

    try {
      if (useBulk) {
        // Large file → bulk-import-lab-data (combined parse+import, no client-side parsing)
        toast.info(`Bulk importing ${entry.file_name} (${(fileSize / 1024 / 1024).toFixed(1)}MB)...`);

        // 180s timeout — bulk import processes server-side, may take up to 150s
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), 180_000),
        );

        try {
          const { data, error: fnError } = await Promise.race([
            supabase.functions.invoke('bulk-import-lab-data', {
              body: { queue_id: queueId },
            }),
            timeoutPromise,
          ]);

          if (fnError) {
            throw new Error(fnError.message || 'Bulk import Edge Function error');
          }

          if (data?.success) {
            toast.success(
              `Imported ${data.results_created} lab results from ${entry.file_name}`,
            );
          } else if (data?.timed_out) {
            toast.warning(
              `Partial import: ${data.results_created} results imported. Re-process for remaining records.`,
            );
          }
        } catch (invokeErr) {
          if (invokeErr instanceof DOMException && invokeErr.name === 'AbortError') {
            toast.info(`Bulk importing ${entry.file_name}... (large file, please wait)`);
            return;
          }
          throw invokeErr;
        }
      } else {
        // Small file → standard parse pipeline (client-side pre-parse → preview → import)
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
            throw new Error(fnError.message || 'Edge Function error');
          }
        } catch (invokeErr) {
          if (invokeErr instanceof DOMException && invokeErr.name === 'AbortError') {
            toast.info(`Processing ${entry.file_name}... (this may take a moment)`);
            return;
          }
          throw invokeErr;
        }

        toast.info(`Processing started for ${entry.file_name}`);
      }
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
   * Routes each file based on size: >500KB → bulk-import-lab-data, <=500KB → parse-lab-data-edd.
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

    const bulkCount = queued.filter((e) => (e.file_size_bytes ?? 0) > BULK_IMPORT_SIZE_THRESHOLD).length;
    const smallCount = queued.length - bulkCount;
    toast.info(
      `Processing ${queued.length} queued lab data file${queued.length > 1 ? 's' : ''}` +
      (bulkCount > 0 ? ` (${bulkCount} large, ${smallCount} small)` : '') +
      '...',
    );

    for (let i = 0; i < queued.length; i++) {
      const entry = queued[i]!;
      const fileSize = entry.file_size_bytes ?? 0;
      const useBulk = fileSize > BULK_IMPORT_SIZE_THRESHOLD;

      // Optimistic UI update — show 'processing' immediately
      useQueueStore.getState().upsertEntry({
        ...entry,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      });

      try {
        if (useBulk) {
          // Large file → bulk-import-lab-data (combined parse+import)
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), 180_000),
          );

          const { data, error: fnError } = await Promise.race([
            supabase.functions.invoke('bulk-import-lab-data', {
              body: { queue_id: entry.id },
            }),
            timeoutPromise,
          ]);

          if (fnError) {
            console.error(`[lab-data] Bulk import failed ${entry.file_name}:`, fnError.message);
            toast.error(`Failed: ${entry.file_name}`);
          } else if (data?.success) {
            toast.success(`Imported ${data.results_created} results from ${entry.file_name} (${i + 1}/${queued.length})`);
          } else if (data?.timed_out) {
            toast.warning(`Partial: ${entry.file_name} — ${data.results_created} results (re-process for remaining)`);
          }
        } else {
          // Small file → standard parse pipeline
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

      // Brief pause between files — longer for bulk imports to let triggers settle
      await new Promise((r) => setTimeout(r, useBulk ? 3000 : 1000));
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

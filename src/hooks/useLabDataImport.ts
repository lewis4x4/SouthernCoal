import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { QueueEntry } from '@/types/queue';

/**
 * Lab data import hook — triggers import-lab-data Edge Function.
 * Moves parsed data from extracted_data JSONB to domain tables.
 * Uses fire-and-forget with 30s timeout for larger imports.
 */
export function useLabDataImport() {
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const { log } = useAuditLog();

  /**
   * Import a single parsed lab data file to domain tables.
   */
  const importLabData = useCallback(
    async (queueId: string) => {
      const entry = useQueueStore
        .getState()
        .entries.find((e) => e.id === queueId);

      if (!entry) {
        toast.error('Queue entry not found');
        return;
      }

      if (entry.status !== 'parsed') {
        toast.error('File must be parsed before importing');
        return;
      }

      // Track importing state
      setImportingIds((prev) => new Set(prev).add(queueId));

      // Optimistic UI update
      useQueueStore.getState().upsertEntry({
        ...entry,
        status: 'processing',
      });

      try {
        // Refresh JWT before Edge Function call
        const sessionResult = await supabase.auth.getSession();
        let session = sessionResult.data?.session;

        if (!session) {
          const { data: refreshed, error: refreshError } =
            await supabase.auth.refreshSession();
          if (refreshError || !refreshed?.session) {
            window.location.href = '/login?reason=session_expired';
            return;
          }
          session = refreshed.session;
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

        // Notify user that import is starting
        toast.info(`Importing ${entry.file_name}...`);

        // Import can take longer than parsing — use 30s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/import-lab-data`,
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

          const result = await response.json();

          // Log successful import
          log('bulk_process', {
            action: 'lab_data_imported',
            queue_id: queueId,
            file_name: entry.file_name,
            events_created: result.events_created,
            results_created: result.results_created,
            import_id: result.import_id,
          });

          toast.success(
            `Imported ${result.results_created} lab results from ${entry.file_name}`,
          );

          // Refresh entry from database to get final status
          const { data: freshEntry } = await supabase
            .from('file_processing_queue')
            .select('*')
            .eq('id', queueId)
            .single();

          if (freshEntry) {
            useQueueStore.getState().upsertEntry(freshEntry as QueueEntry);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);

          // AbortError = timeout, Edge Function may still be running
          if (
            fetchErr instanceof DOMException &&
            fetchErr.name === 'AbortError'
          ) {
            toast.info(
              `Importing ${entry.file_name}... (this may take a moment)`,
            );
            return;
          }
          throw fetchErr;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed';
        toast.error(`Failed to import ${entry.file_name}: ${message}`, {
          action: {
            label: 'View Details',
            onClick: () => useQueueStore.getState().setExpandedRow(queueId),
          },
        });

        // Revert optimistic update
        useQueueStore.getState().upsertEntry({
          ...entry,
          status: 'parsed',
        });
      } finally {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(queueId);
          return next;
        });
      }
    },
    [log],
  );

  /**
   * Import all parsed lab data files — sequential to avoid pool exhaustion.
   * Includes batch-level timeout and stale state protection.
   */
  const importAllParsedLabData = useCallback(async () => {
    const BATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes total
    const startTime = Date.now();

    // Capture IDs at start, but re-fetch state each iteration to avoid stale closures
    const initialEntries = useQueueStore.getState().entries;
    const idsToImport = initialEntries
      .filter((e) => e.status === 'parsed' && e.file_category === 'lab_data')
      .map((e) => e.id);

    if (idsToImport.length === 0) {
      toast.info('No parsed lab data files to import.');
      return;
    }

    toast.info(
      `Importing ${idsToImport.length} parsed lab data file${idsToImport.length > 1 ? 's' : ''}...`,
    );

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const id of idsToImport) {
      // Check batch timeout
      if (Date.now() - startTime > BATCH_TIMEOUT_MS) {
        const remaining = idsToImport.length - successCount - failCount - skippedCount;
        toast.warning(`Batch timeout reached. ${remaining} files skipped. Please retry.`);
        break;
      }

      // Re-fetch fresh state each iteration to handle concurrent changes
      const freshEntry = useQueueStore.getState().entries.find((e) => e.id === id);

      // Skip if entry no longer exists or status changed (e.g., imported by another user)
      if (!freshEntry || freshEntry.status !== 'parsed') {
        skippedCount++;
        continue;
      }

      try {
        await importLabData(id);
        successCount++;
      } catch (err) {
        failCount++;
        // Log failure for debugging (importLabData already shows toast)
        console.error(
          '[useLabDataImport] Batch import failed for',
          id,
          err instanceof Error ? err.message : err,
        );
      }

      // Brief pause between imports
      await new Promise((r) => setTimeout(r, 500));
    }

    if (failCount === 0 && skippedCount === 0) {
      toast.success(`Successfully imported ${successCount} lab data files.`);
    } else {
      toast.warning(
        `Imported ${successCount}, failed ${failCount}, skipped ${skippedCount}. Check entries for details.`,
      );
    }

    // Sync store with database
    const { data: freshEntries } = await supabase
      .from('file_processing_queue')
      .select('*')
      .order('created_at', { ascending: false });

    if (freshEntries) {
      useQueueStore.getState().setEntries(freshEntries as QueueEntry[]);
    }
  }, [importLabData]);

  /**
   * Check if a specific entry is currently being imported.
   */
  const isImporting = useCallback(
    (queueId: string) => importingIds.has(queueId),
    [importingIds],
  );

  return {
    importLabData,
    importAllParsedLabData,
    isImporting,
    isAnyImporting: importingIds.size > 0,
  };
}

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { QueueEntry } from '@/types/queue';

/**
 * Permit limits import hook — triggers import-permit-limits Edge Function.
 * Moves parsed parameter sheet data from extracted_data JSONB to domain tables.
 * Uses fire-and-forget with 60s timeout for larger permit files.
 */
export function usePermitLimitsImport() {
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const { log } = useAuditLog();

  /**
   * Import a single parsed permit limits file to domain tables.
   */
  const importPermitLimits = useCallback(
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

      if (entry.file_category !== 'npdes_permit') {
        toast.error('This hook only handles NPDES permit files');
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
        toast.info(`Importing permit limits from ${entry.file_name}...`);

        // Permit imports can be larger — use 60s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60_000);

        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/import-permit-limits`,
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
            action: 'permit_limits_imported',
            queue_id: queueId,
            file_name: entry.file_name,
            permits_created: result.permits_created,
            outfalls_created: result.outfalls_created,
            limits_created: result.limits_created,
            import_batch_id: result.import_batch_id,
          });

          toast.success(
            `Imported ${result.limits_created} permit limits from ${entry.file_name}`,
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
   * Import all parsed permit files — sequential to avoid pool exhaustion.
   * Includes batch-level timeout and stale state protection.
   */
  const importAllParsedPermits = useCallback(async () => {
    const BATCH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes total (permits are larger)
    const startTime = Date.now();

    // Capture IDs at start, but re-fetch state each iteration
    const initialEntries = useQueueStore.getState().entries;
    const idsToImport = initialEntries
      .filter((e) => e.status === 'parsed' && e.file_category === 'npdes_permit')
      .map((e) => e.id);

    if (idsToImport.length === 0) {
      toast.info('No parsed permit files to import.');
      return;
    }

    toast.info(
      `Importing ${idsToImport.length} parsed permit file${idsToImport.length > 1 ? 's' : ''}...`,
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

      // Re-fetch fresh state each iteration
      const freshEntry = useQueueStore.getState().entries.find((e) => e.id === id);

      // Skip if entry no longer exists or status changed
      if (!freshEntry || freshEntry.status !== 'parsed') {
        skippedCount++;
        continue;
      }

      try {
        await importPermitLimits(id);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(
          '[usePermitLimitsImport] Batch import failed for',
          id,
          err instanceof Error ? err.message : err,
        );
      }

      // Brief pause between imports
      await new Promise((r) => setTimeout(r, 500));
    }

    if (failCount === 0 && skippedCount === 0) {
      toast.success(`Successfully imported ${successCount} permit files.`);
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
  }, [importPermitLimits]);

  /**
   * Check if a specific entry is currently being imported.
   */
  const isImporting = useCallback(
    (queueId: string) => importingIds.has(queueId),
    [importingIds],
  );

  return {
    importPermitLimits,
    importAllParsedPermits,
    isImporting,
    isAnyImporting: importingIds.size > 0,
  };
}

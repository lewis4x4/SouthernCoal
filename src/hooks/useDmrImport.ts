import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { edgeFunctionFetchHeaders, getFreshToken, supabase } from '@/lib/supabase';
import { useQueueStore } from '@/stores/queue';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { QueueEntry } from '@/types/queue';

/**
 * NetDMR import hook — triggers import-netdmr-dmr Edge Function.
 * Moves parsed bundle data from extracted_data / storage → dmr_submissions + dmr_line_items.
 */
export function useDmrImport() {
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const { log } = useAuditLog();

  const importNetDmr = useCallback(
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

      if (entry.file_category !== 'dmr') {
        toast.error('This hook only handles DMR category files');
        return;
      }

      const docType = (entry.extracted_data as Record<string, unknown> | null)?.document_type;
      if (docType !== 'netdmr_bundle') {
        toast.error('Parse the NetDMR export before importing');
        return;
      }

      setImportingIds((prev) => new Set(prev).add(queueId));

      useQueueStore.getState().upsertEntry({
        ...entry,
        status: 'processing',
      });

      try {
        const token = await getFreshToken();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

        toast.info(`Importing DMR data from ${entry.file_name}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/import-netdmr-dmr`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...edgeFunctionFetchHeaders(token),
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

          if (!result.success) {
            throw new Error(result.error ?? 'Import failed');
          }

          log(
            'bulk_process',
            {
              action: 'netdmr_dmr_imported',
              queue_id: queueId,
              file_name: entry.file_name,
              submissions_created: result.submissions_created,
              line_items_created: result.line_items_created,
              import_id: result.import_id,
            },
            { module: 'upload_dashboard', tableName: 'dmr_submissions' },
          );

          toast.success(
            `Imported ${result.line_items_created} DMR line items ` +
              `(${result.submissions_created} submissions) from ${entry.file_name}`,
          );

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

          if (
            fetchErr instanceof DOMException &&
            fetchErr.name === 'AbortError'
          ) {
            toast.info(
              `Importing ${entry.file_name}... (large bundle, still processing)`,
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

  const isImporting = useCallback(
    (queueId: string) => importingIds.has(queueId),
    [importingIds],
  );

  return { importNetDmr, isImporting };
}

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { edgeFunctionFetchHeaders, getFreshToken, supabase } from '@/lib/supabase';
import { showPostProcessFollowUpToast } from '@/lib/uploadPostProcessLinks';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useQueueStore } from '@/stores/queue';
import type { QueueEntry } from '@/types/queue';

/**
 * Sampling matrix import — moves parsed rows into sampling_schedules (DRAFT-labeled).
 */
export function useSamplingMatrixImport() {
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const { log } = useAuditLog();
  const navigate = useNavigate();

  const importSamplingMatrix = useCallback(
    async (queueId: string) => {
      const entry = useQueueStore.getState().entries.find((e) => e.id === queueId);
      if (!entry) {
        toast.error('Queue entry not found');
        return;
      }
      if (entry.status !== 'parsed') {
        toast.error('File must be parsed before importing');
        return;
      }
      if (entry.file_category !== 'sampling_matrix') {
        toast.error('This hook only handles sampling matrix files');
        return;
      }

      setImportingIds((prev) => new Set(prev).add(queueId));
      useQueueStore.getState().upsertEntry({ ...entry, status: 'processing' });

      try {
        const token = await getFreshToken();
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        toast.info(`Importing sampling schedules from ${entry.file_name}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/import-sampling-matrix`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...edgeFunctionFetchHeaders(token),
            },
            body: JSON.stringify({ queue_id: queueId }),
            signal: controller.signal,
          });
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
            'sampling_matrix_imported',
            {
              queue_id: queueId,
              file_name: entry.file_name,
              schedules_upserted: result.schedules_upserted,
              schedules_skipped: result.schedules_skipped,
              import_id: result.import_id,
            },
            { module: 'upload_dashboard', tableName: 'sampling_schedules', recordId: queueId },
          );

          showPostProcessFollowUpToast(
            `Imported ${result.schedules_upserted} sampling schedule${result.schedules_upserted === 1 ? '' : 's'} from ${entry.file_name}`,
            'sampling_matrix',
            navigate,
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
          if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
            toast.info(`Importing ${entry.file_name}... (still processing)`);
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
        useQueueStore.getState().upsertEntry({ ...entry, status: 'parsed' });
      } finally {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(queueId);
          return next;
        });
      }
    },
    [log, navigate],
  );

  const isImporting = useCallback(
    (queueId: string) => importingIds.has(queueId),
    [importingIds],
  );

  const importAllParsedSamplingMatrices = useCallback(async () => {
    const ids = useQueueStore
      .getState()
      .entries.filter(
        (e) =>
          e.status === 'parsed' &&
          e.file_category === 'sampling_matrix' &&
          (e.extracted_data as Record<string, unknown> | null)?.document_type ===
            'sampling_matrix',
      )
      .map((e) => e.id);

    if (ids.length === 0) {
      toast.info('No parsed sampling matrix files to import.');
      return;
    }

    for (const id of ids) {
      await importSamplingMatrix(id);
      await new Promise((r) => setTimeout(r, 500));
    }
  }, [importSamplingMatrix]);

  return {
    importSamplingMatrix,
    importAllParsedSamplingMatrices,
    isImporting,
    isAnyImporting: importingIds.size > 0,
  };
}

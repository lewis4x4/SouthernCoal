import { useCallback } from 'react';
import { toast } from 'sonner';
import { CATEGORY_BY_DB_KEY } from '@/lib/constants';
import {
  canProcessQueueEntry,
  isParameterSheetFile,
  resolveQueueParser,
} from '@/lib/queueProcessorRouting';
import { usePermitProcessing } from '@/hooks/usePermitProcessing';
import { useParameterSheetProcessing } from '@/hooks/useParameterSheetProcessing';
import { useLabDataProcessing } from '@/hooks/useLabDataProcessing';
import { useDmrProcessing } from '@/hooks/useDmrProcessing';
import { useQueueStore } from '@/stores/queue';

/**
 * Unified Upload Dashboard processor — routes queue rows to the correct Edge Function.
 */
export function useQueueProcessing() {
  const { processPermit, processAllQueued: processAllPermitPdfs } = usePermitProcessing();
  const { processParameterSheet, processAllQueued: processAllParameterSheets } =
    useParameterSheetProcessing();
  const { processLabData, processAllQueuedLabData } = useLabDataProcessing();
  const { processDmr, processAllQueuedDmrs } = useDmrProcessing();

  const processEntry = useCallback(
    async (queueId: string) => {
      const entry = useQueueStore.getState().entries.find((e) => e.id === queueId);
      if (!entry) return;

      const route = resolveQueueParser(entry);
      switch (route.kind) {
        case 'permit_pdf':
          return processPermit(queueId);
        case 'parameter_sheet':
          return processParameterSheet(queueId);
        case 'lab_data':
        case 'va_lab_csv':
        case 'al_lab_data':
        case 'osmre_monitoring':
          return processLabData(queueId);
        case 'netdmr_bundle':
          return processDmr(queueId);
        default: {
          const categoryLabel =
            CATEGORY_BY_DB_KEY[entry.file_category]?.label ?? entry.file_category;
          toast.error(
            `No automated parser for ${categoryLabel} (${entry.file_name}). Process manually or change category.`,
          );
        }
      }
    },
    [processPermit, processParameterSheet, processLabData, processDmr],
  );

  const retryFailed = useCallback(
    async (queueId: string) => {
      await processEntry(queueId);
    },
    [processEntry],
  );

  return {
    processEntry,
    retryFailed,
    processAllPermitPdfs,
    processAllParameterSheets,
    processAllQueuedLabData,
    processAllQueuedDmrs,
    canProcessQueueEntry,
    isParameterSheetFile,
    resolveQueueParser,
  };
}

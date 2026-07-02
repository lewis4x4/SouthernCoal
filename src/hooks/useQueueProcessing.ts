import { useCallback } from 'react';
import { toast } from 'sonner';
import { CATEGORY_BY_DB_KEY } from '@/lib/constants';
import {
  canProcessQueueEntry,
  isParameterSheetFile,
  resolveQueueParser,
} from '@/lib/queueProcessorRouting';
import { useAuditLog } from '@/hooks/useAuditLog';
import { usePermitProcessing } from '@/hooks/usePermitProcessing';
import { useParameterSheetProcessing } from '@/hooks/useParameterSheetProcessing';
import { useLabDataProcessing } from '@/hooks/useLabDataProcessing';
import { useDmrProcessing } from '@/hooks/useDmrProcessing';
import { useArchiveDocumentProcessing } from '@/hooks/useArchiveDocumentProcessing';
import { useQueueStore } from '@/stores/queue';

const UPLOAD_AUDIT_ENTITY = {
  module: 'upload_dashboard',
  tableName: 'file_processing_queue',
} as const;

/**
 * Unified Upload Dashboard processor — routes queue rows to the correct Edge Function.
 */
export function useQueueProcessing() {
  const { log } = useAuditLog();
  const { processPermit, processAllQueued: processAllPermitPdfs } = usePermitProcessing();
  const { processParameterSheet, processAllQueued: processAllParameterSheets } =
    useParameterSheetProcessing();
  const { processLabData, processAllQueuedLabData } = useLabDataProcessing();
  const { processDmr, processAllQueuedDmrs } = useDmrProcessing();
  const { processArchiveDocument, processAllQueuedArchiveDocuments } =
    useArchiveDocumentProcessing();

  const runProcess = useCallback(
    async (queueId: string, auditAction: 'process_queued' | 'retry_queued') => {
      const entry = useQueueStore.getState().entries.find((e) => e.id === queueId);
      if (!entry) return;

      const route = resolveQueueParser(entry);
      log(
        auditAction,
        {
          queue_id: queueId,
          file_category: entry.file_category,
          file_name: entry.file_name,
          parser_kind: route.kind,
          status: entry.status,
        },
        { ...UPLOAD_AUDIT_ENTITY, recordId: queueId },
      );

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
        case 'compliance_archive':
          return processArchiveDocument(queueId);
        default: {
          const categoryLabel =
            CATEGORY_BY_DB_KEY[entry.file_category]?.label ?? entry.file_category;
          toast.error(
            `No automated parser for ${categoryLabel} (${entry.file_name}). Process manually or change category.`,
          );
        }
      }
    },
    [
      log,
      processPermit,
      processParameterSheet,
      processLabData,
      processDmr,
      processArchiveDocument,
    ],
  );

  const processEntry = useCallback(
    (queueId: string) => runProcess(queueId, 'process_queued'),
    [runProcess],
  );

  const retryFailed = useCallback(
    (queueId: string) => runProcess(queueId, 'retry_queued'),
    [runProcess],
  );

  return {
    processEntry,
    retryFailed,
    processAllPermitPdfs,
    processAllParameterSheets,
    processAllQueuedLabData,
    processAllQueuedDmrs,
    processAllQueuedArchiveDocuments,
    canProcessQueueEntry,
    isParameterSheetFile,
    resolveQueueParser,
  };
}

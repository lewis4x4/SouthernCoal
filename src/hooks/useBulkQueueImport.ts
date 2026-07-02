import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePermitLimitsImport } from '@/hooks/usePermitLimitsImport';
import { useLabDataImport } from '@/hooks/useLabDataImport';
import { useDmrImport } from '@/hooks/useDmrImport';
import { useSamplingMatrixImport } from '@/hooks/useSamplingMatrixImport';
import { useQueueStore } from '@/stores/queue';
import { useAuditLog } from '@/hooks/useAuditLog';

/**
 * Bulk import parsed queue rows into domain tables (permits, lab data, DMRs).
 */
export function useBulkQueueImport() {
  const { importAllParsedPermits, isAnyImporting: permitsImporting } = usePermitLimitsImport();
  const { importAllParsedLabData, isAnyImporting: labImporting } = useLabDataImport();
  const { importAllParsedNetDmrs, isAnyImporting: dmrImporting } = useDmrImport();
  const { importAllParsedSamplingMatrices, isAnyImporting: matrixImporting } =
    useSamplingMatrixImport();
  const { log } = useAuditLog();
  const [batchRunning, setBatchRunning] = useState(false);

  const entries = useQueueStore((s) => s.entries);

  const parsedPermitCount = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.status === 'parsed' &&
          e.file_category === 'npdes_permit' &&
          e.extracted_data,
      ).length,
    [entries],
  );

  const parsedLabCount = useMemo(
    () => entries.filter((e) => e.status === 'parsed' && e.file_category === 'lab_data').length,
    [entries],
  );

  const parsedDmrCount = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.status === 'parsed' &&
          e.file_category === 'dmr' &&
          (e.extracted_data as Record<string, unknown> | null)?.document_type === 'netdmr_bundle',
      ).length,
    [entries],
  );

  const parsedMatrixCount = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.status === 'parsed' &&
          e.file_category === 'sampling_matrix' &&
          (e.extracted_data as Record<string, unknown> | null)?.document_type ===
            'sampling_matrix',
      ).length,
    [entries],
  );

  const totalParsedImportable = parsedPermitCount + parsedLabCount + parsedDmrCount + parsedMatrixCount;

  const importAllParsed = useCallback(async () => {
    if (totalParsedImportable === 0) {
      toast.info('No parsed files ready to import.');
      return;
    }

    setBatchRunning(true);
    try {
      if (parsedPermitCount > 0) await importAllParsedPermits();
      if (parsedLabCount > 0) await importAllParsedLabData();
      if (parsedDmrCount > 0) await importAllParsedNetDmrs();
      if (parsedMatrixCount > 0) await importAllParsedSamplingMatrices();

      log(
        'bulk_process',
        {
          action: 'bulk_import_all_parsed',
          permits: parsedPermitCount,
          lab_data: parsedLabCount,
          dmrs: parsedDmrCount,
          sampling_matrix: parsedMatrixCount,
        },
        { module: 'upload_dashboard', tableName: 'file_processing_queue' },
      );
    } finally {
      setBatchRunning(false);
    }
  }, [
    totalParsedImportable,
    parsedPermitCount,
    parsedLabCount,
    parsedDmrCount,
    parsedMatrixCount,
    importAllParsedPermits,
    importAllParsedLabData,
    importAllParsedNetDmrs,
    importAllParsedSamplingMatrices,
    log,
  ]);

  return {
    importAllParsed,
    parsedPermitCount,
    parsedLabCount,
    parsedDmrCount,
    parsedMatrixCount,
    totalParsedImportable,
    isImporting: batchRunning || permitsImporting || labImporting || dmrImporting || matrixImporting,
  };
}

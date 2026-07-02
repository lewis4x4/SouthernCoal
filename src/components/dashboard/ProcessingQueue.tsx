import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, RefreshCw, Play, AlertTriangle, RotateCcw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useQueueStore, filterEntries } from '@/stores/queue';
import { useRealtimeQueue } from '@/hooks/useRealtimeQueue';
import { usePermissions } from '@/hooks/usePermissions';
import { useQueueProcessing } from '@/hooks/useQueueProcessing';
import { useBulkQueueImport } from '@/hooks/useBulkQueueImport';
import { isArchiveDocumentCategory, isParameterSheetFile, isSamplingMatrixTabularFile } from '@/lib/queueProcessorRouting';
import { useAuditLog } from '@/hooks/useAuditLog';
import { ErrorForensics } from '@/components/ui/ErrorForensics';
import { ExtractionPanel } from '@/components/dashboard/queue/ExtractionPanel';
import { QueueRow } from '@/components/dashboard/queue/QueueRow';
import { QueueFilters } from '@/components/dashboard/queue/QueueFilters';

const ROW_HEIGHT = 56;

/**
 * Processing Queue — virtualized with @tanstack/react-virtual.
 * Fixed-height rows in virtual list. Expanded detail panel rendered
 * separately below the list to avoid scroll-jump issues.
 */
export function ProcessingQueue() {
  const allEntries = useQueueStore((s) => s.entries);
  const filters = useQueueStore((s) => s.filters);
  const entries = useMemo(() => filterEntries(allEntries, filters), [allEntries, filters]);
  const expandedRowId = useQueueStore((s) => s.expandedRowId);
  const { refetch } = useRealtimeQueue();
  const { can } = usePermissions();
  const {
    processAllPermitPdfs,
    processAllParameterSheets,
    processAllQueuedLabData,
    processAllQueuedDmrs,
    processAllQueuedArchiveDocuments,
    processAllQueuedSamplingMatrices,
    retryFailed,
  } = useQueueProcessing();
  const {
    importAllParsed,
    totalParsedImportable,
    isImporting: bulkImportRunning,
  } = useBulkQueueImport();
  const { log } = useAuditLog();
  const [retryingFailed, setRetryingFailed] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  const failedEntries = useMemo(
    () => allEntries.filter((entry) => entry.status === 'failed'),
    [allEntries],
  );

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const queuedPermitPdfCount = allEntries.filter(
    (e) =>
      e.file_category === 'npdes_permit' &&
      e.status === 'queued' &&
      !isParameterSheetFile(e),
  ).length;

  const queuedParameterSheetCount = allEntries.filter(
    (e) =>
      e.file_category === 'npdes_permit' &&
      e.status === 'queued' &&
      isParameterSheetFile(e),
  ).length;

  const queuedLabDataCount = allEntries.filter(
    (e) => e.file_category === 'lab_data' && e.status === 'queued',
  ).length;

  const queuedDmrCount = allEntries.filter(
    (e) => e.file_category === 'dmr' && e.status === 'queued',
  ).length;

  const queuedArchiveCount = allEntries.filter(
    (e) => e.status === 'queued' && isArchiveDocumentCategory(e.file_category, e),
  ).length;

  const queuedSamplingMatrixCount = allEntries.filter(
    (e) =>
      e.status === 'queued' &&
      e.file_category === 'sampling_matrix' &&
      isSamplingMatrixTabularFile(e),
  ).length;

  const expandedEntry = expandedRowId
    ? entries.find((e) => e.id === expandedRowId)
    : null;

  async function handleRetryAllFailed() {
    if (failedEntries.length === 0 || !can('retry')) return;
    setRetryingFailed(true);
    let retried = 0;
    for (const entry of failedEntries) {
      try {
        await retryFailed(entry.id);
        retried += 1;
      } catch (err) {
        console.error('[ProcessingQueue] retry failed for', entry.id, err);
      }
    }
    setRetryingFailed(false);
    log(
      'bulk_retry',
      { retried_count: retried, failed_total: failedEntries.length },
      { module: 'upload_dashboard', tableName: 'file_processing_queue' },
    );
    toast.info(`Retried ${retried} failed file${retried === 1 ? '' : 's'}`);
    await refetch();
  }

  if (allEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.08] bg-qo-nested  p-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-text-muted" />
        <p className="text-text-secondary text-sm font-medium">No files in the queue</p>
        <p className="text-text-muted text-xs mt-1">
          Drag and drop files anywhere to begin uploading compliance documents.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-qo-nested  overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.06]">
        <h3 className="text-sm font-semibold text-text-primary">
          Processing Queue
          <span className="ml-2 text-xs font-normal text-text-secondary">
            {entries.length} {entries.length === 1 ? 'file' : 'files'}
            {entries.length !== allEntries.length && (
              <span className="text-text-muted"> of {allEntries.length} total</span>
            )}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {queuedPermitPdfCount > 0 && (
            <button
              onClick={() => can('bulk_process') && processAllPermitPdfs()}
              disabled={!can('bulk_process')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                can('bulk_process')
                  ? `Process ${queuedPermitPdfCount} queued permit PDF${queuedPermitPdfCount !== 1 ? 's' : ''} sequentially`
                  : 'Permission required for bulk processing'
              }
            >
              <Play size={10} className="inline mr-1" />
              Process Permits ({queuedPermitPdfCount})
            </button>
          )}
          {queuedParameterSheetCount > 0 && (
            <button
              onClick={() => can('bulk_process') && processAllParameterSheets()}
              disabled={!can('bulk_process')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                can('bulk_process')
                  ? `Process ${queuedParameterSheetCount} WV parameter sheet${queuedParameterSheetCount !== 1 ? 's' : ''}`
                  : 'Permission required for bulk processing'
              }
            >
              <Play size={10} className="inline mr-1" />
              Parameter Sheets ({queuedParameterSheetCount})
            </button>
          )}
          {queuedDmrCount > 0 && (
            <button
              onClick={() => can('bulk_process') && processAllQueuedDmrs()}
              disabled={!can('bulk_process')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                can('bulk_process')
                  ? `Process ${queuedDmrCount} NetDMR export${queuedDmrCount !== 1 ? 's' : ''}`
                  : 'Permission required for bulk processing'
              }
            >
              <Play size={10} className="inline mr-1" />
              Process DMRs ({queuedDmrCount})
            </button>
          )}
          {queuedLabDataCount > 0 && (
            <button
              onClick={() => can('bulk_process') && processAllQueuedLabData()}
              disabled={!can('bulk_process')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                can('bulk_process')
                  ? `Process ${queuedLabDataCount} queued lab data file${queuedLabDataCount !== 1 ? 's' : ''} sequentially`
                  : 'Permission required for bulk processing'
              }
            >
              <Play size={10} className="inline mr-1" />
              Process Lab Data ({queuedLabDataCount})
            </button>
          )}
          {queuedSamplingMatrixCount > 0 && (
            <button
              onClick={() => can('bulk_process') && processAllQueuedSamplingMatrices()}
              disabled={!can('bulk_process')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                can('bulk_process')
                  ? `Parse ${queuedSamplingMatrixCount} sampling matrix file${queuedSamplingMatrixCount !== 1 ? 's' : ''}`
                  : 'Permission required for bulk processing'
              }
            >
              <Play size={10} className="inline mr-1" />
              Sampling Matrix ({queuedSamplingMatrixCount})
            </button>
          )}
          {queuedArchiveCount > 0 && (
            <button
              onClick={() => can('bulk_process') && processAllQueuedArchiveDocuments()}
              disabled={!can('bulk_process')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                can('bulk_process')
                  ? `Index ${queuedArchiveCount} archive document${queuedArchiveCount !== 1 ? 's' : ''} for search`
                  : 'Permission required for bulk processing'
              }
            >
              <Play size={10} className="inline mr-1" />
              Archive Docs ({queuedArchiveCount})
            </button>
          )}
          {totalParsedImportable > 0 && (
            <button
              onClick={() => can('process') && void importAllParsed()}
              disabled={!can('process') || bulkImportRunning}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                can('process')
                  ? `Import ${totalParsedImportable} parsed file${totalParsedImportable !== 1 ? 's' : ''} to domain tables`
                  : 'Permission required to import parsed files'
              }
            >
              <Upload size={10} className="inline mr-1" />
              {bulkImportRunning ? 'Importing…' : `Import Parsed (${totalParsedImportable})`}
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-black/[0.04] transition-colors"
            title="Refresh queue"
            aria-label="Refresh queue"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {failedEntries.length > 0 && (
        <div className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
          <div className="flex items-start gap-2 text-xs text-red-200/90">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-qo-risk" aria-hidden />
            <span>
              <span className="font-semibold text-red-300">{failedEntries.length} failed</span>
              {' '}
              — parser or import errors need review. Expand a row for forensics.
            </span>
          </div>
          {failedEntries.length > 0 && (
            <button
              type="button"
              onClick={() => can('retry') && void handleRetryAllFailed()}
              disabled={!can('retry') || retryingFailed}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              title={can('retry') ? 'Retry all failed queue entries' : 'Permission required to retry failed files'}
            >
              <RotateCcw size={12} className={retryingFailed ? 'animate-spin' : ''} />
              {retryingFailed ? 'Retrying…' : `Retry all failed (${failedEntries.length})`}
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <QueueFilters />

      {/* Virtualized rows */}
      {entries.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-text-muted text-xs">
            No files match the current filters.
          </p>
        </div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ maxHeight: `${ROW_HEIGHT * 10}px` }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = entries[virtualRow.index]!;
              return (
                <div
                  key={entry.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <QueueRow entry={entry} can={can} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail panel — rendered below the virtual list */}
      <AnimatePresence mode="wait">
        {expandedEntry && (
          <motion.div
            key={expandedEntry.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-black/[0.06]"
          >
            <div className="px-5 py-4 bg-white">
              {expandedEntry.status === 'failed' && (
                <ErrorForensics
                  errorLog={expandedEntry.error_log as unknown[] | null}
                  onRetry={
                    can('retry')
                      ? () => retryFailed(expandedEntry.id)
                      : undefined
                  }
                />
              )}

              {(expandedEntry.status === 'parsed' ||
                expandedEntry.status === 'imported') &&
                expandedEntry.extracted_data && (
                  <ExtractionPanel entry={expandedEntry} />
                )}

              {expandedEntry.status !== 'failed' &&
                !expandedEntry.extracted_data && (
                  <p className="text-xs text-text-muted">
                    No additional details available for this entry.
                  </p>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

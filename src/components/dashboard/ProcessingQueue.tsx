import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueueStore, filterEntries } from '@/stores/queue';
import { useRealtimeQueue } from '@/hooks/useRealtimeQueue';
import { usePermissions } from '@/hooks/usePermissions';
import { usePermitProcessing } from '@/hooks/usePermitProcessing';
import { useLabDataProcessing } from '@/hooks/useLabDataProcessing';
import { ErrorForensics } from '@/components/ui/ErrorForensics';
import { ExtractionPanel } from '@/components/dashboard/queue/ExtractionPanel';
import { QueueRow } from '@/components/dashboard/queue/QueueRow';
import { QueueFilters } from '@/components/dashboard/queue/QueueFilters';
import { FileText, RefreshCw, Play } from 'lucide-react';

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
  const { processAllQueued, retryFailed } = usePermitProcessing();
  const { processAllQueuedLabData } = useLabDataProcessing();

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const queuedPermitCount = allEntries.filter(
    (e) => e.file_category === 'npdes_permit' && e.status === 'queued',
  ).length;

  const queuedLabDataCount = allEntries.filter(
    (e) => e.file_category === 'lab_data' && e.status === 'queued',
  ).length;

  const expandedEntry = expandedRowId
    ? entries.find((e) => e.id === expandedRowId)
    : null;

  if (allEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-text-muted" />
        <p className="text-text-secondary text-sm font-medium">No files in the queue</p>
        <p className="text-text-muted text-xs mt-1">
          Drag and drop files anywhere to begin uploading compliance documents.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
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
          {queuedPermitCount > 0 && can('bulk_process') && (
            <button
              onClick={() => processAllQueued()}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all"
              title={`Process ${queuedPermitCount} queued permit${queuedPermitCount !== 1 ? 's' : ''} sequentially`}
            >
              <Play size={10} className="inline mr-1" />
              Process Permits ({queuedPermitCount})
            </button>
          )}
          {queuedLabDataCount > 0 && can('bulk_process') && (
            <button
              onClick={() => processAllQueuedLabData()}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all"
              title={`Process ${queuedLabDataCount} queued lab data file${queuedLabDataCount !== 1 ? 's' : ''} sequentially`}
            >
              <Play size={10} className="inline mr-1" />
              Process Lab Data ({queuedLabDataCount})
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
            title="Refresh queue"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

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
                  <QueueRow entry={entry} />
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
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <div className="px-5 py-4 bg-white/[0.01]">
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

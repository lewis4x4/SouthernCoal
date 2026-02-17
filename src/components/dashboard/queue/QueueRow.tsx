import { GlassBadge } from '@/components/ui/GlassBadge';
import { usePermitProcessing } from '@/hooks/usePermitProcessing';
import { useLabDataProcessing } from '@/hooks/useLabDataProcessing';
import { useQueueStore } from '@/stores/queue';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, CATEGORY_BY_DB_KEY, STATES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react';
import type { QueueEntry } from '@/types/queue';
import type { FileStatus } from '@/lib/constants';
import type { Permission } from '@/types/auth';

const DOC_TYPE_LABELS: Record<string, string> = {
  original_permit: 'Original Permit',
  modification: 'Modification',
  extension: 'Extension',
  extension_letter: 'Extension Letter',
  renewal: 'Renewal',
  draft_permit: 'Draft Permit',
  transfer: 'Transfer',
  closure: 'Closure',
  inactivation: 'Inactivation',
  tsmp_permit: 'TSMP Permit',
  monitoring_release: 'Monitoring Release',
  wet_suspension: 'WET Suspension',
  selenium_compliance: 'Selenium Compliance',
  administrative_notice: 'Admin Notice',
  lab_data_edd: 'Lab Data (EDD)',
};

interface QueueRowProps {
  entry: QueueEntry;
  can: (action: Permission) => boolean;
}

/**
 * Fixed-height queue row for use inside the virtualized list.
 * Click toggles expanded state; detail panel rendered separately
 * in ProcessingQueue below the virtual list.
 */
export function QueueRow({ entry, can }: QueueRowProps) {
  const expandedRowId = useQueueStore((s) => s.expandedRowId);
  const setExpandedRow = useQueueStore((s) => s.setExpandedRow);
  const { processPermit, retryFailed: retryPermit } = usePermitProcessing();
  const { processLabData, retryFailed: retryLabData } = useLabDataProcessing();

  const isExpanded = expandedRowId === entry.id;
  const isPermit = entry.file_category === 'npdes_permit';
  const isLabData = entry.file_category === 'lab_data';
  const canProcess = (isPermit || isLabData) && entry.status === 'queued' && can('process');
  const canRetry = (isPermit || isLabData) && entry.status === 'failed' && can('retry');

  async function handleStateChange(queueEntry: QueueEntry, newState: string) {
    const stateCode = newState || null;
    // Optimistic update in store
    useQueueStore.getState().upsertEntry({ ...queueEntry, state_code: stateCode });
    // Persist to DB
    const { error } = await supabase
      .from('file_processing_queue')
      .update({ state_code: stateCode, updated_at: new Date().toISOString() })
      .eq('id', queueEntry.id);
    if (error) {
      console.error('[queue] Failed to update state_code:', error.message);
      // Revert on failure
      useQueueStore.getState().upsertEntry(queueEntry);
    }
  }

  async function handleCategoryChange(queueEntry: QueueEntry, newCategory: string) {
    if (!CATEGORY_BY_DB_KEY[newCategory]) return;
    // Only update file_category — storage_bucket stays as-is because the
    // file physically lives in the original bucket it was uploaded to.
    useQueueStore.getState().upsertEntry({
      ...queueEntry,
      file_category: newCategory,
    });
    const { error } = await supabase
      .from('file_processing_queue')
      .update({
        file_category: newCategory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queueEntry.id);
    if (error) {
      console.error('[queue] Failed to update file_category:', error.message);
      useQueueStore.getState().upsertEntry(queueEntry);
    }
  }

  return (
    <div
      onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
      className={cn(
        'flex items-center gap-3 px-5 h-14 cursor-pointer transition-colors border-b border-white/[0.03]',
        isExpanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]',
      )}
    >
      {/* Expand indicator */}
      <span className="text-text-muted flex-shrink-0">
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </span>

      {/* Filename + document type */}
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs text-text-primary truncate block max-w-[280px]">
          {entry.file_name}
        </span>
        <div className="flex items-center gap-2">
          {entry.file_size_bytes && (
            <span className="text-[10px] text-text-muted">
              {formatFileSize(entry.file_size_bytes)}
            </span>
          )}
          {(() => {
            const docType = (entry.extracted_data as Record<string, unknown> | null)?.document_type as string | undefined;
            return docType ? (
              <span className="text-[10px] text-text-secondary">
                {DOC_TYPE_LABELS[docType] ?? docType}
              </span>
            ) : null;
          })()}
        </div>
      </div>

      {/* Category — editable dropdown (RBAC: requires 'process' permission) */}
      <div className="w-24 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <select
          value={entry.file_category}
          onChange={(e) => handleCategoryChange(entry, e.target.value)}
          disabled={!can('process')}
          aria-label="Document category"
          className={cn(
            "bg-transparent text-xs w-full border-none outline-none appearance-none truncate transition-colors",
            can('process')
              ? "text-text-secondary cursor-pointer hover:text-text-primary"
              : "text-text-muted cursor-not-allowed opacity-60"
          )}
          title={can('process') ? "Change category" : "Permission required to change category"}
        >
          {CATEGORIES.map((c) => (
            <option key={c.dbKey} value={c.dbKey} className="bg-[#0d1117] text-[#f1f5f9]">
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* State — editable dropdown (RBAC: requires 'process' permission) */}
      <div className="w-16 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <select
          value={entry.state_code ?? ''}
          onChange={(e) => handleStateChange(entry, e.target.value)}
          disabled={!can('process')}
          aria-label="State"
          className={cn(
            "bg-transparent text-xs w-full border-none outline-none appearance-none transition-colors",
            can('process')
              ? "text-text-secondary cursor-pointer hover:text-text-primary"
              : "text-text-muted cursor-not-allowed opacity-60"
          )}
          title={can('process') ? "Change state" : "Permission required to change state"}
        >
          <option value="" className="bg-[#0d1117] text-[#f1f5f9]">—</option>
          {STATES.map((s) => (
            <option key={s.code} value={s.code} className="bg-[#0d1117] text-[#f1f5f9]">
              {s.code}
            </option>
          ))}
        </select>
      </div>

      {/* Status badge */}
      <GlassBadge variant={entry.status as FileStatus}>
        {entry.status}
      </GlassBadge>

      {/* Record counts */}
      {(entry.records_imported > 0 || entry.records_failed > 0) && (
        <span className="text-[10px] font-mono text-text-muted w-20 text-right">
          {entry.records_imported > 0 && (
            <span className="text-status-imported">{entry.records_imported} imported</span>
          )}
          {entry.records_failed > 0 && (
            <span className="text-status-failed ml-1">{entry.records_failed} failed</span>
          )}
        </span>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {canProcess && (
          <button
            onClick={() => isPermit ? processPermit(entry.id) : processLabData(entry.id)}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all"
            title={isPermit ? 'Process this permit' : 'Process this lab data file'}
          >
            <Play size={10} className="inline mr-1" />
            Process
          </button>
        )}
        {canRetry && (
          <button
            onClick={() => isPermit ? retryPermit(entry.id) : retryLabData(entry.id)}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-status-processing/15 text-status-processing border border-status-processing/20 hover:bg-status-processing/25 transition-all"
            title="Retry processing"
          >
            <RefreshCw size={10} className="inline mr-1" />
            Retry
          </button>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-text-muted text-xs w-28 text-right flex-shrink-0">
        {formatTimestamp(entry.created_at)}
      </span>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

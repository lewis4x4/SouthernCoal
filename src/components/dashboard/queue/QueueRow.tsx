import { GlassBadge } from '@/components/ui/GlassBadge';
import { usePermissions } from '@/hooks/usePermissions';
import { usePermitProcessing } from '@/hooks/usePermitProcessing';
import { useQueueStore } from '@/stores/queue';
import { supabase } from '@/lib/supabase';
import { CATEGORY_BY_DB_KEY, STATES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react';
import type { QueueEntry } from '@/types/queue';
import type { FileStatus } from '@/lib/constants';

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
};

interface QueueRowProps {
  entry: QueueEntry;
}

/**
 * Fixed-height queue row for use inside the virtualized list.
 * Click toggles expanded state; detail panel rendered separately
 * in ProcessingQueue below the virtual list.
 */
export function QueueRow({ entry }: QueueRowProps) {
  const expandedRowId = useQueueStore((s) => s.expandedRowId);
  const setExpandedRow = useQueueStore((s) => s.setExpandedRow);
  const { can } = usePermissions();
  const { processPermit, retryFailed } = usePermitProcessing();

  const isExpanded = expandedRowId === entry.id;
  const category = CATEGORY_BY_DB_KEY[entry.file_category];
  const isPermit = entry.file_category === 'npdes_permit';
  const canProcess = isPermit && entry.status === 'queued' && can('process');
  const canRetry = entry.status === 'failed' && can('retry');

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

      {/* Category */}
      <span className="text-text-secondary text-xs w-24 truncate">
        {category?.label ?? entry.file_category}
      </span>

      {/* State — editable dropdown */}
      <div className="w-16 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <select
          value={entry.state_code ?? ''}
          onChange={(e) => handleStateChange(entry, e.target.value)}
          className="bg-transparent text-text-secondary text-xs w-full cursor-pointer hover:text-text-primary transition-colors border-none outline-none appearance-none"
          title="Change state"
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
            onClick={() => processPermit(entry.id)}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-status-imported/15 text-status-imported border border-status-imported/20 hover:bg-status-imported/25 transition-all"
            title="Process this permit"
          >
            <Play size={10} className="inline mr-1" />
            Process
          </button>
        )}
        {canRetry && (
          <button
            onClick={() => retryFailed(entry.id)}
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

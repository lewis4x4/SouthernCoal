import { useState, useCallback } from 'react';
import {
  FileText,
  Image,
  File,
  Check,
  X,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { useHandoffHistory } from '@/hooks/useHandoffHistory';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassBadge } from '@/components/ui/GlassBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { HandoffHistoryRecord, AITaskMatch, HandoffHistoryStatus } from '@/types/handoff';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function getFileIcon(mimeType?: string): React.ElementType {
  if (!mimeType) return FileText;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf') return FileText;
  return File;
}

function getStatusVariant(status: HandoffHistoryStatus): 'verified' | 'failed' | 'disputed' | 'in_review' {
  switch (status) {
    case 'approved':
      return 'verified';
    case 'rejected':
      return 'failed';
    case 'partial':
      return 'disputed';
    default:
      return 'in_review';
  }
}

function getStatusIcon(status: HandoffHistoryStatus): React.ElementType {
  switch (status) {
    case 'approved':
      return Check;
    case 'rejected':
      return X;
    case 'partial':
      return AlertCircle;
    default:
      return Clock;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

// ---------------------------------------------------------------------------
// Task Match Row Component
// ---------------------------------------------------------------------------

interface TaskMatchRowProps {
  match: AITaskMatch;
  index: number;
  handoffId: string;
  isApplied: boolean;
  onApply: (handoffId: string, index: number) => void;
}

function TaskMatchRow({ match, index, handoffId, isApplied, onApply }: TaskMatchRowProps) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-cyan-400">{match.task_number}</span>
          <span className="text-sm text-text-primary truncate">{match.task_title}</span>
        </div>
        {match.proposed_status && (
          <span className="text-xs text-text-muted">
            → {match.proposed_status}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'text-xs font-medium',
            match.match_confidence >= 0.8
              ? 'text-emerald-400'
              : match.match_confidence >= 0.5
                ? 'text-amber-400'
                : 'text-red-400'
          )}
        >
          {formatConfidence(match.match_confidence)}
        </span>
        {!isApplied && match.requires_review && (
          <button
            onClick={() => onApply(handoffId, index)}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Apply
          </button>
        )}
        {isApplied && (
          <Check className="h-4 w-4 text-emerald-400" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History Record Card Component
// ---------------------------------------------------------------------------

interface HistoryCardProps {
  record: HandoffHistoryRecord;
  onApplyAll: (id: string) => void;
  onReject: (id: string) => void;
  onApplySingle: (id: string, index: number) => void;
}

function HistoryCard({ record, onApplyAll, onReject, onApplySingle }: HistoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(record.status === 'pending_review');
  const [confirmApplyAll, setConfirmApplyAll] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  const FileIcon = getFileIcon(record.file_mime_type);
  const StatusIcon = getStatusIcon(record.status);
  const statusVariant = getStatusVariant(record.status);
  const matches = (record.task_matches ?? []) as AITaskMatch[];
  const appliedIds = new Set(record.applied_task_ids ?? []);

  const handleConfirmApplyAll = useCallback(() => {
    setConfirmApplyAll(false);
    onApplyAll(record.id);
  }, [record.id, onApplyAll]);

  const handleConfirmReject = useCallback(() => {
    setConfirmReject(false);
    onReject(record.id);
  }, [record.id, onReject]);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white/[0.05]">
            <FileIcon className="h-5 w-5 text-text-muted" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-text-primary">
              {record.file_name || 'Text Input'}
            </p>
            <p className="text-xs text-text-muted">
              {formatDate(record.created_at)} • {matches.length} match(es)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <GlassBadge variant={statusVariant}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {record.status.replace('_', ' ')}
          </GlassBadge>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-muted" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.05]">
          {/* Extracted Text Preview */}
          {record.extracted_text && (
            <div className="pt-4">
              <p className="text-xs font-medium text-text-muted mb-2">Extracted Text</p>
              <p className="text-sm text-text-secondary line-clamp-3 font-mono bg-white/[0.02] p-2 rounded">
                {record.extracted_text.slice(0, 300)}
                {record.extracted_text.length > 300 && '...'}
              </p>
            </div>
          )}

          {/* Task Matches */}
          {matches.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-muted mb-2">Task Matches</p>
              <div className="space-y-2">
                {matches.map((match, index) => (
                  <TaskMatchRow
                    key={index}
                    match={match}
                    index={index}
                    handoffId={record.id}
                    isApplied={appliedIds.has(match.task_id)}
                    onApply={onApplySingle}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Processing Stats */}
          <div className="flex items-center gap-4 text-xs text-text-muted">
            {record.extraction_confidence !== null && (
              <span>
                Confidence: {formatConfidence(record.extraction_confidence ?? 0)}
              </span>
            )}
            {record.processing_time_ms && (
              <span>
                Processed in {record.processing_time_ms}ms
              </span>
            )}
          </div>

          {/* Actions */}
          {record.status === 'pending_review' && matches.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.05]">
              <GlassButton
                variant="primary"
                className="text-sm py-1.5 px-3"
                onClick={() => setConfirmApplyAll(true)}
              >
                Apply All
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="text-sm py-1.5 px-3"
                onClick={() => setConfirmReject(true)}
              >
                Reject
              </GlassButton>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmApplyAll}
        title="Apply All Task Updates"
        message={`This will update ${matches.length} roadmap task(s) based on the extracted handoff. This action cannot be undone. Are you sure you want to proceed?`}
        confirmLabel="Apply All"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleConfirmApplyAll}
        onCancel={() => setConfirmApplyAll(false)}
      />
      <ConfirmDialog
        open={confirmReject}
        title="Reject Handoff"
        message="This will mark the handoff as rejected and no task updates will be applied. Are you sure you want to reject this handoff?"
        confirmLabel="Reject"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmReject}
        onCancel={() => setConfirmReject(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function HandoffHistoryPanel() {
  const { history, loading, pendingCount, applyMatches, rejectHandoff, applySingleMatch } = useHandoffHistory();

  if (loading) {
    return (
      <SpotlightCard className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      </SpotlightCard>
    );
  }

  return (
    <SpotlightCard className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Handoff History</h3>
          <p className="text-sm text-text-muted">
            {history.length} record(s) • {pendingCount} pending review
          </p>
        </div>
        {pendingCount > 0 && (
          <GlassBadge variant="in_review">
            {pendingCount} pending
          </GlassBadge>
        )}
      </div>

      {/* History List */}
      {history.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted">No handoff history yet</p>
          <p className="text-xs text-text-muted mt-1">
            Process a handoff to see records here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((record) => (
            <HistoryCard
              key={record.id}
              record={record}
              onApplyAll={applyMatches}
              onReject={rejectHandoff}
              onApplySingle={applySingleMatch}
            />
          ))}
        </div>
      )}
    </SpotlightCard>
  );
}

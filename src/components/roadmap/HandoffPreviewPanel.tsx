import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Check,
  CheckCheck,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useHandoffStore } from '@/stores/handoff';
import { useHandoffProcessing } from '@/hooks/useHandoffProcessing';
import { GlassButton } from '@/components/ui/GlassButton';
import { STATUS_COLORS, STATUS_LABELS } from '@/types/roadmap';
import type { ExtractionConfidence } from '@/types/handoff';

const CONFIDENCE_COLORS: Record<ExtractionConfidence, string> = {
  high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-white/5 text-text-muted border-white/10',
};

const CONFIDENCE_LABELS: Record<ExtractionConfidence, string> = {
  high: 'High Confidence',
  medium: 'Medium Confidence',
  low: 'Low Confidence',
};

export function HandoffPreviewPanel() {
  const {
    extractionResult,
    currentInput,
    previewOpen,
    closePreview,
    setExtractionResult,
    status,
  } = useHandoffStore();
  const { applyUpdates } = useHandoffProcessing();

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleToggleSelect = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!extractionResult) return;
    const allIndices = new Set(
      extractionResult.task_updates.map((_, i) => i)
    );
    setSelectedIndices(allIndices);
  }, [extractionResult]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  const handleApplySelected = useCallback(async () => {
    if (!extractionResult || !currentInput) return;
    await applyUpdates(
      extractionResult.task_updates,
      currentInput,
      Array.from(selectedIndices)
    );
    closePreview();
    setExtractionResult(null);
  }, [extractionResult, currentInput, selectedIndices, applyUpdates, closePreview, setExtractionResult]);

  const handleApplyAll = useCallback(async () => {
    if (!extractionResult || !currentInput) return;
    await applyUpdates(extractionResult.task_updates, currentInput);
    closePreview();
    setExtractionResult(null);
  }, [extractionResult, currentInput, applyUpdates, closePreview, setExtractionResult]);

  const handleDiscard = useCallback(() => {
    closePreview();
    setExtractionResult(null);
  }, [closePreview, setExtractionResult]);

  if (!extractionResult || !previewOpen) return null;

  const { task_updates, new_questions, summary } = extractionResult;
  const isApplying = status === 'applying';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={handleDiscard}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-crystal-surface border-l border-white/[0.08] z-50 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Review Extraction</h2>
            <p className="text-sm text-text-muted mt-0.5">{summary}</p>
          </div>
          <button
            onClick={handleDiscard}
            className="p-2 rounded-lg hover:bg-white/[0.04] transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            aria-label="Close preview panel"
          >
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Task Updates */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-text-secondary">
                Task Updates ({task_updates.length})
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Select all
                </button>
                <span className="text-text-muted">|</span>
                <button
                  onClick={handleDeselectAll}
                  className="text-xs text-text-muted hover:text-text-secondary"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {task_updates.map((update, index) => {
                const isSelected = selectedIndices.has(index);
                const isExpanded = expandedIndex === index;

                return (
                  <div
                    key={`${update.task_id}-${index}`}
                    className={`
                      rounded-lg border transition-all
                      ${isSelected
                        ? 'border-blue-500/30 bg-blue-500/5'
                        : 'border-white/[0.08] bg-white/[0.02]'
                      }
                    `}
                  >
                    {/* Row header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => handleToggleSelect(index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleSelect(index);
                        }
                      }}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Select task ${update.task_id} for update`}
                      tabIndex={0}
                    >
                      {/* Checkbox visual */}
                      <div
                        className={`
                          w-5 h-5 rounded border flex items-center justify-center
                          ${isSelected
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-white/20 hover:border-white/40'
                          }
                        `}
                        aria-hidden="true"
                      >
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>

                      {/* Task ID */}
                      <span className="font-mono text-sm text-text-primary">
                        {update.task_id}
                      </span>

                      {/* Status change */}
                      <div className="flex items-center gap-1.5">
                        {update.old_status && (
                          <>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[update.old_status]}`}>
                              {STATUS_LABELS[update.old_status]}
                            </span>
                            <span className="text-text-muted">→</span>
                          </>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[update.new_status]}`}>
                          {STATUS_LABELS[update.new_status]}
                        </span>
                      </div>

                      {/* Confidence */}
                      <span className={`ml-auto px-2 py-0.5 rounded text-xs ${CONFIDENCE_COLORS[update.confidence]}`}>
                        {CONFIDENCE_LABELS[update.confidence]}
                      </span>

                      {/* Expand toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedIndex(isExpanded ? null : index);
                        }}
                        className="p-1 hover:bg-white/[0.04] rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} className="text-text-muted" />
                        ) : (
                          <ChevronRight size={14} className="text-text-muted" />
                        )}
                      </button>
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-0 space-y-3 border-t border-white/[0.06] mt-2">
                            {update.extracted_answer && (
                              <div>
                                <label className="text-xs text-text-muted block mb-1">
                                  Extracted Answer
                                </label>
                                <p className="text-sm text-text-secondary bg-white/[0.02] rounded px-3 py-2">
                                  {update.extracted_answer}
                                </p>
                              </div>
                            )}
                            {update.extraction_notes && (
                              <div>
                                <label className="text-xs text-text-muted block mb-1">
                                  Extraction Notes
                                </label>
                                <p className="text-xs text-text-muted italic">
                                  {update.extraction_notes}
                                </p>
                              </div>
                            )}
                            {update.unblocks && update.unblocks.length > 0 && (
                              <div>
                                <label className="text-xs text-text-muted block mb-1">
                                  Unblocks
                                </label>
                                <div className="flex flex-wrap gap-1">
                                  {update.unblocks.map((id) => (
                                    <span
                                      key={id}
                                      className="font-mono text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded"
                                    >
                                      {id}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          {/* New Questions */}
          {new_questions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <HelpCircle size={14} />
                New Questions Surfaced ({new_questions.length})
              </h3>
              <div className="space-y-2">
                {new_questions.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5"
                  >
                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-text-secondary">{q.question}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between">
          <button
            onClick={handleDiscard}
            className="text-sm text-text-muted hover:text-text-secondary"
          >
            Discard
          </button>
          <div className="flex gap-3">
            <GlassButton
              onClick={handleApplySelected}
              disabled={selectedIndices.size === 0 || isApplying}
              variant="ghost"
            >
              <Check size={14} className="mr-1.5" />
              Apply Selected ({selectedIndices.size})
            </GlassButton>
            <GlassButton
              onClick={handleApplyAll}
              disabled={task_updates.length === 0 || isApplying}
              variant="primary"
            >
              <CheckCheck size={14} className="mr-1.5" />
              Apply All ({task_updates.length})
            </GlassButton>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

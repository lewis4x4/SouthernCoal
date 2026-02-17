import { useState, useCallback, type KeyboardEvent } from 'react';
import { Mail, MessageSquare, Phone, FileText, Clipboard, Loader2 } from 'lucide-react';
import { useHandoffStore } from '@/stores/handoff';
import { useHandoffProcessing } from '@/hooks/useHandoffProcessing';
import { GlassButton } from '@/components/ui/GlassButton';
import { HANDOFF_SOURCE_LABELS } from '@/lib/constants';
import type { HandoffInput, HandoffSourceType } from '@/types/handoff';

// Simple UUID generator
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const SOURCE_ICONS: Record<HandoffSourceType, React.ElementType> = {
  email: Mail,
  text: MessageSquare,
  call: Phone,
  document: FileText,
  paste: Clipboard,
};

export function HandoffInputPanel() {
  const { status, setInput } = useHandoffStore();
  const { processHandoff } = useHandoffProcessing();

  const [sourceType, setSourceType] = useState<HandoffSourceType>('email');
  const [rawContent, setRawContent] = useState('');
  const [sourceDate, setSourceDate] = useState('');
  const [sourceFrom, setSourceFrom] = useState('');
  const [sourceReference, setSourceReference] = useState('');

  const handleProcess = useCallback(() => {
    if (!rawContent.trim()) return;

    const input: HandoffInput = {
      id: generateId(),
      source_type: sourceType,
      raw_content: rawContent,
      source_date: sourceDate || new Date().toISOString().split('T')[0],
      source_from: sourceFrom || undefined,
      source_reference: sourceReference || undefined,
      created_at: new Date().toISOString(),
    };

    setInput(input);
    processHandoff(input);
  }, [sourceType, rawContent, sourceDate, sourceFrom, sourceReference, setInput, processHandoff]);

  const handleClear = useCallback(() => {
    setRawContent('');
    setSourceDate('');
    setSourceFrom('');
    setSourceReference('');
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd+Enter (Mac) or Ctrl+Enter (Windows) to process
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleProcess();
      }
    },
    [handleProcess]
  );

  const isProcessing = status === 'extracting';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Process Handoff</h2>
        <p className="text-sm text-text-muted mt-1">
          Paste raw content from emails, texts, call notes, or documents to extract task updates.
        </p>
      </div>

      {/* Source Type Selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">Source Type</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(HANDOFF_SOURCE_LABELS) as HandoffSourceType[]).map((type) => {
            const Icon = SOURCE_ICONS[type];
            const isActive = sourceType === type;
            return (
              <button
                key={type}
                onClick={() => setSourceType(type)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-white/[0.02] text-text-muted border border-white/[0.08] hover:bg-white/[0.04]'
                  }
                `}
              >
                <Icon size={14} />
                {HANDOFF_SOURCE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Metadata Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-secondary">Source Date</label>
          <input
            type="date"
            value={sourceDate}
            onChange={(e) => setSourceDate(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-secondary">From</label>
          <input
            type="text"
            value={sourceFrom}
            onChange={(e) => setSourceFrom(e.target.value)}
            placeholder="e.g., Tom Lusk"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-secondary">Reference</label>
          <input
            type="text"
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
            placeholder="e.g., RE: Missing Files"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Raw Content Textarea */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-secondary">Raw Content</label>
        <textarea
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste the email body, text message, call notes, or document content here..."
          rows={12}
          aria-label="Raw content to process"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/50 font-mono resize-y min-h-[200px]"
        />
        <p className="text-xs text-text-muted">
          {rawContent.length} characters • Cmd+Enter to process
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleClear}
          className="text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          Clear all
        </button>
        <GlassButton
          onClick={handleProcess}
          disabled={!rawContent.trim() || isProcessing}
          variant="primary"
        >
          {isProcessing ? (
            <>
              <Loader2 size={14} className="animate-spin mr-2" />
              Processing...
            </>
          ) : (
            'Process Handoff'
          )}
        </GlassButton>
      </div>

      {/* Keyboard hint */}
      <div className="text-center">
        <kbd className="px-2 py-1 text-xs bg-white/[0.04] border border-white/[0.08] rounded text-text-muted">
          Cmd + Enter
        </kbd>
        <span className="text-xs text-text-muted ml-2">to process</span>
      </div>
    </div>
  );
}

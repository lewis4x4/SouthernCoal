import { AlertTriangle, Clock, FileSearch } from 'lucide-react';
import { CitationCard } from './CitationCard';
import type { DocumentSearchResponse } from '@/types/search';

interface DocumentSearchResultsProps {
  response: DocumentSearchResponse;
  onRetry?: () => void;
}

export function DocumentSearchResults({ response, onRetry }: DocumentSearchResultsProps) {
  const { answer, chunks, metadata, disclaimer } = response;

  return (
    <div className="space-y-4">
      {/* Execution metadata */}
      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {metadata.executionTimeMs}ms
        </span>
        <span>{metadata.chunkCount} sources found</span>
      </div>

      {/* Synthesized answer */}
      {answer && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-sm">
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
              {answer}
            </div>
          </div>
        </div>
      )}

      {/* No results */}
      {chunks.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileSearch className="h-8 w-8 text-text-muted" />
          <div>
            <p className="text-sm text-text-primary">No matching documents found</p>
            <p className="mt-1 text-xs text-text-secondary">
              Try broadening your search or adjusting filters
            </p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-white/[0.06]"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Citations */}
      {chunks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-text-muted">Sources</h3>
          <div className="space-y-2">
            {chunks.map((chunk, i) => (
              <CitationCard key={chunk.id} chunk={chunk} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/10 bg-amber-400/[0.03] px-3 py-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/60" />
        <p className="text-[11px] leading-relaxed text-text-muted">
          {disclaimer}
        </p>
      </div>
    </div>
  );
}

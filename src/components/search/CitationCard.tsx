import { FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DocumentChunk } from '@/types/search';

interface CitationCardProps {
  chunk: DocumentChunk;
  index: number;
}

function getSimilarityColor(similarity: number): string {
  if (similarity >= 0.9) return 'text-emerald-400';
  if (similarity >= 0.7) return 'text-text-muted';
  return 'text-amber-400';
}

function getSimilarityBg(similarity: number): string {
  if (similarity >= 0.9) return 'bg-emerald-400/10 border-emerald-400/20';
  if (similarity >= 0.7) return 'bg-white/[0.03] border-white/[0.08]';
  return 'bg-amber-400/10 border-amber-400/20';
}

export function CitationCard({ chunk, index }: CitationCardProps) {
  const similarityPct = (chunk.similarity * 100).toFixed(1);
  const previewText =
    chunk.chunk_text.length > 200
      ? chunk.chunk_text.slice(0, 200) + '...'
      : chunk.chunk_text;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all hover:bg-white/[0.02]',
        getSimilarityBg(chunk.similarity),
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-cyan-400">
            Source {index + 1}
          </span>
          <span className={cn('text-xs font-mono', getSimilarityColor(chunk.similarity))}>
            {similarityPct}%
          </span>
        </div>

        {chunk.source_page > 0 && (
          <span className="text-[11px] text-text-muted">
            Page {chunk.source_page}
          </span>
        )}
      </div>

      {/* File info */}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
        <FileText className="h-3 w-3 shrink-0 text-text-muted" />
        <span className="truncate">{chunk.file_name}</span>
        {chunk.document_type && (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted">{chunk.document_type}</span>
          </>
        )}
        {chunk.state_code && (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-text-muted">{chunk.state_code}</span>
          </>
        )}
      </div>

      {/* Chunk preview */}
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">
        {previewText}
      </p>
    </div>
  );
}

import { useState } from 'react';
import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
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
  const [viewLoading, setViewLoading] = useState(false);
  const similarityPct = (chunk.similarity * 100).toFixed(1);
  const previewText =
    chunk.chunk_text.length > 200
      ? chunk.chunk_text.slice(0, 200) + '...'
      : chunk.chunk_text;

  async function viewDocument() {
    if (!chunk.document_id) return;
    setViewLoading(true);
    try {
      // Look up storage info from file_processing_queue
      const { data: entry, error: fetchError } = await supabase
        .from('file_processing_queue')
        .select('storage_bucket, storage_path')
        .eq('document_id', chunk.document_id)
        .limit(1)
        .single();

      if (fetchError || !entry) {
        toast.error('Could not locate document file');
        return;
      }

      const { data: urlData, error: urlError } = await supabase.storage
        .from(entry.storage_bucket)
        .createSignedUrl(entry.storage_path, 300);

      if (urlError || !urlData?.signedUrl) {
        toast.error('Could not generate document URL');
        return;
      }

      window.open(urlData.signedUrl, '_blank');
    } catch {
      toast.error('Failed to open document');
    } finally {
      setViewLoading(false);
    }
  }

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

        <div className="flex items-center gap-2">
          {chunk.source_page > 0 && (
            <span className="text-[11px] text-text-muted">
              Page {chunk.source_page}
            </span>
          )}
          <button
            onClick={viewDocument}
            disabled={viewLoading || !chunk.document_id}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-secondary disabled:opacity-40"
          >
            {viewLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            View
          </button>
        </div>
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

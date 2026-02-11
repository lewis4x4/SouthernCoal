import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { ComplianceSearchResponse } from '@/types/search';

interface SQLReviewModalProps {
  query: ComplianceSearchResponse['query'];
  onConfirm: () => void;
  onCancel: () => void;
}

export function SQLReviewModal({ query, onConfirm, onCancel }: SQLReviewModalProps) {
  function handleCopy() {
    navigator.clipboard.writeText(query.sql);
    toast.success('SQL copied to clipboard');
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="absolute top-[15%] left-1/2 w-full max-w-2xl -translate-x-1/2">
        <div className="rounded-2xl border border-white/[0.12] bg-crystal-surface/95 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="border-b border-white/[0.06] px-6 py-4">
            <h2 className="text-lg font-semibold text-text-primary">Review Generated SQL</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Review the query before execution. This data will be fetched from your compliance database.
            </p>
          </div>

          {/* Body */}
          <div className="space-y-4 px-6 py-4">
            {/* Original question */}
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Your Question</label>
              <p className="text-sm text-text-primary">{query.original}</p>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Query Description</label>
              <p className="text-sm text-text-secondary">{query.description}</p>
            </div>

            {/* Tables */}
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Tables Queried</label>
              <div className="flex flex-wrap gap-1.5">
                {query.tablesQueried.map((t) => (
                  <code
                    key={t}
                    className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/60"
                  >
                    {t}
                  </code>
                ))}
              </div>
            </div>

            {/* SQL */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-text-muted">Generated SQL</label>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-secondary"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
              <pre className="max-h-60 overflow-auto rounded-lg bg-black/30 p-4 font-mono text-[12px] leading-relaxed text-emerald-300/80">
                {query.sql}
              </pre>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4">
            <button
              onClick={onCancel}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Run Query
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

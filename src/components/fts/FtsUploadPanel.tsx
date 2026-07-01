import { useState, useCallback, useRef } from 'react';
import { Upload, RefreshCw, FileSpreadsheet, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassBadge } from '@/components/ui/GlassBadge';
import { useFtsUpload } from '@/hooks/useFtsUpload';
import { toast } from 'sonner';
import type { FtsUpload } from '@/types/fts';

const formatDollars = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

interface Props {
  uploads: FtsUpload[];
}

export function FtsUploadPanel({ uploads }: Props) {
  const { uploading, progress, error, upload, reparse, parseQuarterYear } = useFtsUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    quarter: number;
    year: number;
  } | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        toast.error('Only .xlsx files are accepted for FTS penalty uploads.');
        return;
      }
      const parsed = parseQuarterYear(file.name);
      if (parsed) {
        setPendingFile({ file, ...parsed });
      } else {
        // Default to current quarter
        const now = new Date();
        setPendingFile({
          file,
          quarter: Math.ceil((now.getMonth() + 1) / 3),
          year: now.getFullYear(),
        });
      }
    },
    [parseQuarterYear],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const confirmUpload = async () => {
    if (!pendingFile) return;
    await upload(pendingFile.file, pendingFile.quarter, pendingFile.year);
    setPendingFile(null);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <GlassBadge variant="queued">Pending</GlassBadge>;
      case 'processing':
        return <GlassBadge variant="processing">Processing</GlassBadge>;
      case 'completed':
        return <GlassBadge variant="parsed">Completed</GlassBadge>;
      case 'failed':
        return <GlassBadge variant="failed">Failed</GlassBadge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all',
          dragOver
            ? 'border-qo-accent/50 bg-qo-accent/5'
            : 'border-black/[0.12] bg-qo-nested hover:border-black/[0.12] hover:bg-qo-nested',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <Upload size={24} className="mx-auto mb-2 text-text-muted" />
        <p className="text-sm text-text-secondary">
          Drop FTS penalty file here or click to browse
        </p>
        <p className="text-[10px] text-text-muted mt-1">.xlsx only</p>
      </div>

      {/* Confirm dialog */}
      {pendingFile && (
        <div className="rounded-xl border border-qo-accent/20 bg-qo-accent/5 p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet size={20} className="text-qo-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">{pendingFile.file.name}</p>
              <p className="text-xs text-text-muted mt-0.5">
                Q{pendingFile.quarter} {pendingFile.year} ·{' '}
                {(pendingFile.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <GlassButton variant="primary" onClick={confirmUpload}>
              <Check size={14} className="mr-1" />
              Upload Q{pendingFile.quarter} {pendingFile.year}
            </GlassButton>
            <GlassButton variant="ghost" onClick={() => setPendingFile(null)}>
              <X size={14} />
            </GlassButton>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="rounded-xl border border-black/[0.08] bg-qo-nested p-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 size={14} className="animate-spin text-qo-accent" />
            Uploading & parsing...
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-qo-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && !uploading && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-qo-risk shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Upload history */}
      <div className="rounded-2xl border border-black/[0.08] bg-qo-nested ">
        <div className="px-4 py-3 border-b border-black/[0.06]">
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Upload History
          </h4>
        </div>
        <div className="divide-y divide-white/[0.04] max-h-[300px] overflow-y-auto">
          {uploads.length === 0 ? (
            <div className="p-4 text-center text-xs text-text-muted">No uploads yet</div>
          ) : (
            uploads.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">{u.file_name}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Q{u.quarter} {u.year} · {u.format_version === 'Q4_plus' ? 'With Notes' : 'Legacy'}
                    {u.total_violations != null && ` · ${u.total_violations} violations`}
                    {u.total_penalties != null && ` · ${formatDollars(u.total_penalties)}`}
                  </p>
                  {u.parse_error && (
                    <p className="text-[10px] text-qo-risk mt-0.5 truncate">{u.parse_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(u.parse_status)}
                  {u.parse_status === 'failed' && (
                    <button
                      onClick={() => reparse(u.id)}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-black/[0.04] hover:text-text-secondary transition-colors"
                      title="Retry"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

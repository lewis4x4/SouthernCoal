import { X, Download, CheckCircle, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';

interface ReportProgressModalProps {
  reportTitle: string;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  downloadUrl?: string;
  rowCount?: number;
  dataQualityFlags?: Record<string, unknown>;
  errorMessage?: string;
  onDownload: () => void;
  onClose: () => void;
}

export function ReportProgressModal({
  reportTitle,
  status,
  downloadUrl,
  rowCount,
  dataQualityFlags,
  errorMessage,
  onDownload,
  onClose,
}: ReportProgressModalProps) {
  const flagCount = dataQualityFlags ? Object.keys(dataQualityFlags).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-crystal-base/95 backdrop-blur-xl p-8 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-text-primary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          {/* Status Icon */}
          {status === 'pending' || status === 'generating' ? (
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-2 border-primary/20 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
            </div>
          ) : status === 'complete' ? (
            <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
          )}

          {/* Title */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{reportTitle}</h3>
            <p className="mt-1 text-sm text-text-muted">
              {status === 'pending' && 'Preparing report...'}
              {status === 'generating' && 'Generating report data...'}
              {status === 'complete' && `Report ready — ${rowCount ?? 0} rows`}
              {status === 'failed' && 'Report generation failed'}
            </p>
          </div>

          {/* Data Quality Flags */}
          {status === 'complete' && flagCount > 0 && (
            <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {flagCount} data quality flag{flagCount !== 1 ? 's' : ''}
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                Some data may require verification before regulatory use.
              </p>
            </div>
          )}

          {/* Error */}
          {status === 'failed' && errorMessage && (
            <div className="w-full rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-left">
              <p className="text-xs text-red-400">{errorMessage}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 w-full pt-2">
            {status === 'complete' && downloadUrl && (
              <button
                onClick={onDownload}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary/15 text-primary px-4 py-2.5 text-sm font-medium hover:bg-primary/25 transition-all active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className={`flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                status === 'complete' && downloadUrl
                  ? 'bg-white/[0.04] text-text-muted hover:bg-white/[0.06] border border-white/[0.06]'
                  : 'flex-1 bg-white/[0.04] text-text-secondary hover:bg-white/[0.06] border border-white/[0.06]'
              }`}
            >
              {status === 'pending' || status === 'generating' ? 'Cancel' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

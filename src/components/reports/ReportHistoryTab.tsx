import { useReportHistory } from '@/hooks/useReportHistory';
import { Loader2, Download, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { getFreshToken } from '@/lib/supabase';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; text: string; color: string }> = {
  complete: { icon: CheckCircle, text: 'Complete', color: 'text-green-400' },
  generating: { icon: Loader2, text: 'Generating', color: 'text-blue-400' },
  pending: { icon: Clock, text: 'Pending', color: 'text-amber-400' },
  failed: { icon: XCircle, text: 'Failed', color: 'text-red-400' },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '--';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function ReportHistoryTab() {
  const { reports, loading, refetch } = useReportHistory();

  const handleDownload = async (reportId: string) => {
    try {
      const token = await getFreshToken();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-status?job_id=${reportId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await resp.json();
      if (data.download_url) {
        window.open(data.download_url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Download URL not available');
      }
    } catch {
      toast.error('Failed to get download URL');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {reports.length} report{reports.length !== 1 ? 's' : ''} generated
        </p>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-text-muted hover:bg-white/[0.04] hover:text-text-secondary transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <Clock className="h-8 w-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted">No reports generated yet</p>
          <p className="text-xs text-text-muted mt-1">
            Generate your first report from the Hub tab.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const defaultCfg = { icon: Clock, text: 'Pending', color: 'text-amber-400' };
            const cfg = STATUS_CONFIG[report.status] ?? defaultCfg;
            const StatusIcon = cfg.icon;
            const flagCount = report.data_quality_flags
              ? Object.keys(report.data_quality_flags).length
              : 0;

            return (
              <div
                key={report.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.10] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon
                      className={`h-4 w-4 shrink-0 ${cfg.color} ${
                        report.status === 'generating' ? 'animate-spin' : ''
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-text-muted">
                          #{report.report_number}
                        </span>
                        <h4 className="text-sm font-medium text-text-primary truncate">
                          {report.report_title}
                        </h4>
                        <span className={`text-[10px] font-semibold uppercase ${cfg.color}`}>
                          {cfg.text}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-muted">
                        <span>{new Date(report.created_at).toLocaleString()}</span>
                        <span>{formatDuration(report.created_at, report.completed_at)}</span>
                        {report.row_count != null && <span>{report.row_count} rows</span>}
                        <span>{formatBytes(report.file_size_bytes)}</span>
                        <span className="uppercase font-mono">{report.format}</span>
                        {flagCount > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-400">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {flagCount} flag{flagCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {report.status === 'complete' && (
                    <button
                      onClick={() => handleDownload(report.id)}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  )}

                  {report.status === 'failed' && report.error_message && (
                    <span className="shrink-0 max-w-[200px] text-[10px] text-red-400 truncate">
                      {report.error_message}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

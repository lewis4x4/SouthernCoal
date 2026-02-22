import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Download, FileText, AlertTriangle } from 'lucide-react';

interface GeneratedReport {
  id: string;
  status: string;
  format: string;
  file_path_csv: string | null;
  row_count: number | null;
  data_quality_flags: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  report_definitions: { report_key: string; title: string; tier: number; priority: string } | null;
}

export function ReportHistoryPanel() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('generated_reports')
        .select(`
          id, status, format, file_path_csv, row_count, data_quality_flags,
          error_message, created_at, completed_at,
          report_definitions (report_key, title, tier, priority)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      setReports((data as unknown as GeneratedReport[]) ?? []);
      setLoading(false);
    }
    fetch();
  }, []);

  async function downloadReport(filePath: string) {
    const { data, error } = await supabase.storage
      .from('generated-reports')
      .createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) {
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  const STATUS_STYLES: Record<string, string> = {
    complete: 'bg-green-500/15 text-green-400',
    generating: 'bg-amber-500/15 text-amber-400 animate-pulse',
    pending: 'bg-blue-500/15 text-blue-400',
    failed: 'bg-red-500/15 text-red-400',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-muted">
        <FileText className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No reports have been generated yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">{reports.length} most recent reports</p>

      <div className="space-y-2">
        {reports.map((r) => {
          const reportDef = r.report_definitions;
          const flagCount = (r.data_quality_flags?.unconfirmed_permits as number) ?? 0;

          return (
            <div
              key={r.id}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[r.status] ?? 'bg-slate-500/15 text-slate-400'}`}>
                    {r.status}
                  </span>
                  <span className="text-xs font-medium text-text-primary truncate">
                    {reportDef?.title ?? 'Unknown Report'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {flagCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400" title={`${flagCount} unconfirmed permits`}>
                      <AlertTriangle className="h-3 w-3" />
                      {flagCount}
                    </span>
                  )}
                  {r.status === 'complete' && r.file_path_csv && (
                    <button
                      onClick={() => downloadReport(r.file_path_csv!)}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-green-400 transition-colors"
                      title="Download CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-[10px] text-text-muted">
                <span>Format: {r.format}</span>
                {r.row_count !== null && <span>Rows: {r.row_count.toLocaleString()}</span>}
                <span>{new Date(r.created_at).toLocaleString()}</span>
                {r.completed_at && (
                  <span>
                    Duration: {Math.round((new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 1000)}s
                  </span>
                )}
              </div>

              {r.error_message && (
                <p className="text-[10px] text-red-400 bg-red-500/5 rounded px-2 py-1 font-mono">
                  {r.error_message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

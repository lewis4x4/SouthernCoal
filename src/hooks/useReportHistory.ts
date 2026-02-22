import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface GeneratedReport {
  id: string;
  report_key: string;
  report_title: string;
  report_number: number;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  format: string;
  row_count: number | null;
  file_size_bytes: number | null;
  data_quality_flags: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  created_by_email: string | null;
}

export function useReportHistory(limit = 50) {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('generated_reports')
      .select(`
        id,
        status,
        format,
        row_count,
        file_size_bytes,
        data_quality_flags,
        error_message,
        created_at,
        completed_at,
        report_definition_id,
        created_by,
        report_definitions (report_key, title, report_number)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[useReportHistory] Failed:', error.message);
      setLoading(false);
      return;
    }

    const mapped: GeneratedReport[] = (data ?? []).map((r) => {
      const def = r.report_definitions as unknown as { report_key: string; title: string; report_number: number } | null;
      return {
        id: r.id,
        report_key: def?.report_key ?? 'unknown',
        report_title: def?.title ?? 'Unknown Report',
        report_number: def?.report_number ?? 0,
        status: r.status,
        format: r.format,
        row_count: r.row_count,
        file_size_bytes: r.file_size_bytes,
        data_quality_flags: r.data_quality_flags,
        error_message: r.error_message,
        created_at: r.created_at,
        completed_at: r.completed_at,
        created_by_email: null,
      };
    });

    setReports(mapped);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { reports, loading, refetch: fetchHistory };
}

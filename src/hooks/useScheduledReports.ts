import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  ScheduledReport,
  ReportRun,
  ReportType,
  ReportOutputFormat,
} from '@/types/database';

function normalizeScheduledReport(row: Partial<ScheduledReport>): ScheduledReport {
  return {
    ...row,
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
  } as ScheduledReport;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScheduledReports() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch Reports ───────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('scheduled_reports')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[scheduled_reports] fetch error:', error.message);
      toast.error('Failed to load scheduled reports');
    } else {
      setReports(((data ?? []) as Partial<ScheduledReport>[]).map(normalizeScheduledReport));
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ── Create Report ───────────────────────────────────────────────────────
  const createReport = useCallback(
    async (fields: {
      title: string;
      report_type: ReportType;
      output_format?: ReportOutputFormat;
      description?: string;
      schedule_cron?: string;
      recipients?: string[];
      state_filter?: string[];
      date_range_days?: number;
    }) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('scheduled_reports')
        .insert({
          ...fields,
          organization_id: orgId,
          created_by: profile.id,
          output_format: fields.output_format ?? 'csv',
          recipients: fields.recipients ?? [],
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create report');
        return null;
      }

      log('scheduled_report_created', { title: fields.title, type: fields.report_type }, {
        module: 'scheduled_reports',
        tableName: 'scheduled_reports',
        recordId: data.id,
      });

      toast.success('Report schedule created');
      fetchReports();
      return normalizeScheduledReport(data as Partial<ScheduledReport>);
    },
    [orgId, profile, log, fetchReports],
  );

  // ── Update Report ───────────────────────────────────────────────────────
  const updateReport = useCallback(
    async (id: string, updates: Partial<ScheduledReport>) => {
      if (!profile) return;
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ ...updates, updated_by: profile.id })
        .eq('id', id);

      if (error) {
        toast.error('Failed to update report');
        return;
      }

      log('scheduled_report_updated', { report_id: id }, {
        module: 'scheduled_reports',
        tableName: 'scheduled_reports',
        recordId: id,
      });

      toast.success('Report updated');
      fetchReports();
    },
    [profile, log, fetchReports],
  );

  // ── Delete Report ───────────────────────────────────────────────────────
  const deleteReport = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', id);

      if (error) {
        toast.error('Failed to delete report');
        return;
      }

      log('scheduled_report_deleted', { report_id: id }, {
        module: 'scheduled_reports',
        tableName: 'scheduled_reports',
        recordId: id,
      });

      toast.success('Report deleted');
      fetchReports();
    },
    [log, fetchReports],
  );

  // ── Run Report (manual trigger) ─────────────────────────────────────────
  const runReport = useCallback(
    async (reportId: string) => {
      if (!profile) return null;

      // Create a run record
      const { data: run, error: runError } = await supabase
        .from('report_runs')
        .insert({
          scheduled_report_id: reportId,
          status: 'pending',
          triggered_by: 'manual',
          triggered_by_user: profile.id,
        })
        .select()
        .single();

      if (runError) {
        toast.error('Failed to trigger report run');
        return null;
      }

      // Update the scheduled report's last_run_at and run_count
      await supabase
        .from('scheduled_reports')
        .update({
          last_run_at: new Date().toISOString(),
          run_count: (reports.find((r) => r.id === reportId)?.run_count ?? 0) + 1,
        })
        .eq('id', reportId);

      // Mark as completed (in production, an Edge Function would handle actual generation)
      await supabase
        .from('report_runs')
        .update({
          status: 'completed',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id);

      log('scheduled_report_run', { report_id: reportId, run_id: run.id }, {
        module: 'scheduled_reports',
        tableName: 'report_runs',
        recordId: run.id,
      });

      toast.success('Report run triggered');
      fetchReports();
      return run as ReportRun;
    },
    [profile, reports, log, fetchReports],
  );

  // ── Fetch Run History ───────────────────────────────────────────────────
  const fetchRunHistory = useCallback(async (reportId: string) => {
    const { data, error } = await supabase
      .from('report_runs')
      .select('*')
      .eq('scheduled_report_id', reportId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[report_runs] fetch error:', error.message);
      return [];
    }
    return (data ?? []) as ReportRun[];
  }, []);

  // ── Toggle Active ──────────────────────────────────────────────────────
  const toggleActive = useCallback(
    async (id: string, isActive: boolean) => {
      await updateReport(id, { is_active: isActive });
    },
    [updateReport],
  );

  return {
    reports,
    activeReports: reports.filter((r) => r.is_active),
    loading,
    createReport,
    updateReport,
    deleteReport,
    runReport,
    fetchRunHistory,
    toggleActive,
    refresh: fetchReports,
  };
}

export default useScheduledReports;

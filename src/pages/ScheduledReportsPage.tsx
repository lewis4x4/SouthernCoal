import { useState } from 'react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useScheduledReports } from '@/hooks/useScheduledReports';
import {
  FileText,
  Plus,
  Play,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { ReportType, ReportOutputFormat, ReportRun } from '@/types/database';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  compliance_summary: 'Compliance Summary',
  exceedance_detail: 'Exceedance Detail',
  sampling_status: 'Sampling Status',
  violation_summary: 'Violation Summary',
  ca_status: 'Corrective Action Status',
  work_order_status: 'Work Order Status',
  dmr_status: 'DMR Status',
  executive_brief: 'Executive Brief',
  state_breakdown: 'State Breakdown',
  custom: 'Custom',
};

const FORMAT_LABELS: Record<ReportOutputFormat, string> = {
  csv: 'CSV',
  pdf: 'PDF',
  markdown: 'Markdown',
};

const RUN_STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  running: Clock,
  completed: CheckCircle2,
  failed: XCircle,
};

const RUN_STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-400',
  running: 'text-cyan-400 animate-spin',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

export function ScheduledReportsPage() {
  const {
    reports,
    loading,
    createReport,
    deleteReport,
    runReport,
    fetchRunHistory,
    toggleActive,
  } = useScheduledReports();

  const [showCreate, setShowCreate] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [runHistories, setRunHistories] = useState<Record<string, ReportRun[]>>({});

  // Create form state
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState<ReportType>('compliance_summary');
  const [outputFormat, setOutputFormat] = useState<ReportOutputFormat>('csv');
  const [description, setDescription] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [dateRangeDays, setDateRangeDays] = useState(30);

  const handleCreate = async () => {
    if (!title.trim()) return;
    const recipients = recipientInput
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    await createReport({
      title: title.trim(),
      report_type: reportType,
      output_format: outputFormat,
      description: description.trim() || undefined,
      schedule_cron: scheduleCron.trim() || undefined,
      recipients,
      date_range_days: dateRangeDays,
    });

    setTitle('');
    setDescription('');
    setScheduleCron('');
    setRecipientInput('');
    setDateRangeDays(30);
    setShowCreate(false);
  };

  const handleExpand = async (reportId: string) => {
    if (expandedReport === reportId) {
      setExpandedReport(null);
      return;
    }
    setExpandedReport(reportId);
    if (!runHistories[reportId]) {
      const history = await fetchRunHistory(reportId);
      setRunHistories((prev) => ({ ...prev, [reportId]: history }));
    }
  };

  const handleRun = async (reportId: string) => {
    await runReport(reportId);
    // Refresh run history
    const history = await fetchRunHistory(reportId);
    setRunHistories((prev) => ({ ...prev, [reportId]: history }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <FileText className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Scheduled Reports</h1>
            <p className="text-sm text-text-secondary">
              Automated report generation and distribution
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30"
        >
          <Plus className="w-4 h-4" />
          New Report
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <SpotlightCard className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Create Report Schedule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-text-secondary mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-text-secondary focus:border-purple-500/50 focus:outline-none"
                placeholder="e.g., Weekly Compliance Summary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-purple-500/50 focus:outline-none"
              >
                {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Output Format</label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as ReportOutputFormat)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-purple-500/50 focus:outline-none"
              >
                {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Schedule (cron)</label>
              <input
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-text-secondary focus:border-purple-500/50 focus:outline-none"
                placeholder="e.g., 0 8 * * 1 (Mon 8am)"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1">Date Range (days)</label>
              <input
                type="number"
                value={dateRangeDays}
                onChange={(e) => setDateRangeDays(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-purple-500/50 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-text-secondary mb-1">Recipients (comma-separated emails)</label>
              <input
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-text-secondary focus:border-purple-500/50 focus:outline-none"
                placeholder="brian@scc.com, environmental@scc.com"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-text-secondary mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-text-secondary focus:border-purple-500/50 focus:outline-none resize-none"
                placeholder="Report details..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-white">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className="px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-500/30 disabled:opacity-40"
            >
              Create Report
            </button>
          </div>
        </SpotlightCard>
      )}

      {/* Reports List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-purple-400 border-t-transparent rounded-full" />
        </div>
      ) : reports.length === 0 ? (
        <SpotlightCard className="p-12 text-center">
          <FileText className="w-8 h-8 text-text-secondary mx-auto mb-3" />
          <p className="text-text-secondary">No scheduled reports yet</p>
        </SpotlightCard>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const isExpanded = expandedReport === report.id;
            const history = runHistories[report.id] ?? [];
            const recipients = Array.isArray(report.recipients) ? report.recipients : [];

            return (
              <SpotlightCard key={report.id} className="overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-medium">{report.title}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-text-secondary">
                          {REPORT_TYPE_LABELS[report.report_type]}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-text-secondary">
                          {FORMAT_LABELS[report.output_format]}
                        </span>
                        {!report.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                        {report.schedule_cron && <span>Schedule: {report.schedule_cron}</span>}
                        <span>Runs: {report.run_count}</span>
                        {report.last_run_at && (
                          <span>Last: {new Date(report.last_run_at).toLocaleDateString()}</span>
                        )}
                        {recipients.length > 0 && (
                          <span>{recipients.length} recipient{recipients.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => toggleActive(report.id, !report.is_active)}
                        className="p-1.5 rounded hover:bg-white/5 text-text-secondary hover:text-white"
                        title={report.is_active ? 'Pause' : 'Activate'}
                      >
                        {report.is_active ? (
                          <ToggleRight className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRun(report.id)}
                        className="p-1.5 rounded hover:bg-white/5 text-text-secondary hover:text-cyan-400"
                        title="Run Now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteReport(report.id)}
                        className="p-1.5 rounded hover:bg-white/5 text-text-secondary hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleExpand(report.id)}
                        className="p-1.5 rounded hover:bg-white/5 text-text-secondary"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded: Run History */}
                {isExpanded && (
                  <div className="border-t border-white/5 p-4 bg-white/[0.01]">
                    <h4 className="text-xs font-medium text-text-secondary mb-3">Run History</h4>
                    {history.length === 0 ? (
                      <p className="text-xs text-text-secondary">No runs yet</p>
                    ) : (
                      <div className="space-y-2">
                        {history.map((run) => {
                          const StatusIcon = RUN_STATUS_ICONS[run.status] ?? Clock;
                          return (
                            <div key={run.id} className="flex items-center gap-3 text-sm">
                              <StatusIcon className={clsx('w-4 h-4', RUN_STATUS_COLORS[run.status])} />
                              <span className="text-white capitalize">{run.status}</span>
                              <span className="text-text-secondary text-xs">
                                {run.triggered_by}
                              </span>
                              {run.completed_at && (
                                <span className="text-text-secondary text-xs">
                                  {new Date(run.completed_at).toLocaleString()}
                                </span>
                              )}
                              {run.error_message && (
                                <span className="text-red-400 text-xs truncate">{run.error_message}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Recipients */}
                    {recipients.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <h4 className="text-xs font-medium text-text-secondary mb-1">Recipients</h4>
                        <div className="flex flex-wrap gap-1">
                          {recipients.map((email) => (
                            <span key={email} className="text-xs px-2 py-0.5 rounded bg-white/5 text-text-secondary">
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {report.description && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <p className="text-xs text-text-secondary">{report.description}</p>
                      </div>
                    )}
                  </div>
                )}
              </SpotlightCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ScheduledReportsPage;

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Shield, Clock, Users, History, AlertTriangle } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/hooks/usePermissions';
import { ReportPermissionsPanel } from '@/components/admin/ReportPermissionsPanel';
import { ReportSchedulePanel } from '@/components/admin/ReportSchedulePanel';
import { ReportRecipientsPanel } from '@/components/admin/ReportRecipientsPanel';
import { ReportHistoryPanel } from '@/components/admin/ReportHistoryPanel';
import { DataQualityPanel } from '@/components/admin/DataQualityPanel';

type Tab = 'reports' | 'history' | 'data-quality';

interface ReportDefinition {
  id: string;
  report_key: string;
  report_number: number;
  title: string;
  description: string;
  tier: number;
  priority: string;
  formats_available: string[];
  is_locked: boolean;
  prerequisite_condition: string | null;
}

export function AdminReportsPage() {
  const { getEffectiveRole } = usePermissions();
  const [tab, setTab] = useState<Tab>('reports');
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [panel, setPanel] = useState<'permissions' | 'schedule' | 'recipients' | null>(null);

  const isAdmin = getEffectiveRole() === 'admin';

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('report_definitions')
        .select('*')
        .order('report_number');
      setReports(data ?? []);
      setLoading(false);
    }
    fetch();
  }, []);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3 text-red-400">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-medium">Admin access required.</span>
        </div>
      </div>
    );
  }

  const tiers = [1, 2, 3, 4, 5];
  const TIER_LABELS: Record<number, string> = {
    1: 'Generate Now',
    2: 'After Lab Import',
    3: 'After Exceedance Detection',
    4: 'Quarterly / Annual',
    5: 'Specialized / On-Demand',
  };

  const PRIORITY_COLORS: Record<string, string> = {
    CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/20',
    HIGH: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    MEDIUM: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/admin"
          className="mt-1 rounded-lg p-1.5 text-text-muted hover:bg-white/[0.05] hover:text-text-secondary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="inline-flex rounded-xl bg-amber-500/10 p-2.5">
          <FileText className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Report Administration
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage report permissions, schedules, recipients, and data quality.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 border border-white/[0.06]">
        {[
          { key: 'reports' as Tab, label: 'Reports', icon: FileText, count: reports.length },
          { key: 'history' as Tab, label: 'Generation History', icon: History },
          { key: 'data-quality' as Tab, label: 'Data Quality', icon: AlertTriangle },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSelectedReport(null); setPanel(null); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              tab === key
                ? 'bg-white/[0.08] text-text-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {count !== undefined && (
              <span className="ml-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'reports' && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Reports', value: reports.length, color: 'text-blue-400' },
              { label: 'Unlocked', value: reports.filter((r) => !r.is_locked).length, color: 'text-green-400' },
              { label: 'Locked', value: reports.filter((r) => r.is_locked).length, color: 'text-amber-400' },
              { label: 'Critical Priority', value: reports.filter((r) => r.priority === 'CRITICAL').length, color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
                <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            tiers.map((tier) => {
              const tierReports = reports.filter((r) => r.tier === tier);
              if (tierReports.length === 0) return null;
              return (
                <div key={tier} className="space-y-3">
                  <h2 className="text-sm font-semibold text-text-secondary">
                    Tier {tier}: {TIER_LABELS[tier]} ({tierReports.length})
                  </h2>
                  <div className="space-y-2">
                    {tierReports.map((report) => (
                      <SpotlightCard
                        key={report.id}
                        spotlightColor={report.is_locked ? 'rgba(100,100,100,0.05)' : 'rgba(168, 85, 247, 0.06)'}
                        className={`p-4 transition-all ${report.is_locked ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-text-muted w-6 text-right shrink-0">
                              #{report.report_number}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-text-primary truncate">
                                  {report.title}
                                </h3>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${PRIORITY_COLORS[report.priority]}`}>
                                  {report.priority}
                                </span>
                                {report.is_locked && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                    LOCKED
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-text-muted mt-0.5 truncate max-w-xl">
                                {report.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-4">
                            <button
                              onClick={() => { setSelectedReport(report); setPanel('permissions'); }}
                              className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-blue-400 transition-colors"
                              title="Manage Permissions"
                            >
                              <Shield className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setSelectedReport(report); setPanel('schedule'); }}
                              className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-amber-400 transition-colors"
                              title="Manage Schedule"
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setSelectedReport(report); setPanel('recipients'); }}
                              className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-green-400 transition-colors"
                              title="Manage Recipients"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </SpotlightCard>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'history' && <ReportHistoryPanel />}
      {tab === 'data-quality' && <DataQualityPanel />}

      {/* Side Panel */}
      {selectedReport && panel && (
        <div className="fixed inset-y-0 right-0 z-50 w-[480px] border-l border-white/[0.08] bg-crystal-base/95 backdrop-blur-xl shadow-2xl overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  #{selectedReport.report_number} &middot; Tier {selectedReport.tier}
                </p>
                <h3 className="text-lg font-semibold text-text-primary mt-1">
                  {selectedReport.title}
                </h3>
              </div>
              <button
                onClick={() => { setSelectedReport(null); setPanel(null); }}
                className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-text-primary transition-colors"
              >
                &times;
              </button>
            </div>

            {panel === 'permissions' && (
              <ReportPermissionsPanel reportDef={selectedReport} />
            )}
            {panel === 'schedule' && (
              <ReportSchedulePanel reportDef={selectedReport} />
            )}
            {panel === 'recipients' && (
              <ReportRecipientsPanel reportDef={selectedReport} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

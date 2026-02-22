import { useState } from 'react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { ReportCard } from './ReportCard';
import { ReportConfigDrawer } from './ReportConfigDrawer';
import { ReportProgressModal } from './ReportProgressModal';
import { useReportDefinitions, TIER_LABELS } from '@/hooks/useReportDefinitions';
import { useReportGeneration } from '@/hooks/useReportGeneration';
import type { ReportDefinitionWithAccess } from '@/hooks/useReportDefinitions';
import { Loader2, FileText, Lock, Unlock } from 'lucide-react';

export function ReportHubTab() {
  const { definitions, accessible, unlocked, locked, byTier, loading } =
    useReportDefinitions();
  const { generate, download, reset, job, generating } = useReportGeneration();
  const [configReport, setConfigReport] = useState<ReportDefinitionWithAccess | null>(null);

  const handleGenerate = (report: ReportDefinitionWithAccess) => {
    setConfigReport(report);
  };

  const handleConfigSubmit = async (cfg: {
    format: 'csv' | 'pdf' | 'both';
    config: Record<string, unknown>;
    delivery: { download?: boolean; email?: boolean };
  }) => {
    if (!configReport) return;
    setConfigReport(null);
    await generate(configReport.report_key, cfg.config, cfg.format, cfg.delivery);
  };

  const handleDownload = () => {
    if (job?.download_url) download(job.download_url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const tiers = [1, 2, 3, 4, 5];

  return (
    <div className="space-y-6">
      {/* Health Bar */}
      <div className="grid grid-cols-3 gap-3">
        <SpotlightCard
          spotlightColor="rgba(16, 185, 129, 0.08)"
          className="p-4"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Unlock className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Available Now</p>
              <p className="text-2xl font-bold text-green-400">{unlocked.length}</p>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="rgba(245, 158, 11, 0.08)"
          className="p-4"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <Lock className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Locked</p>
              <p className="text-2xl font-bold text-amber-400">{locked.length}</p>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="rgba(168, 85, 247, 0.08)"
          className="p-4"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2">
              <FileText className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Your Access</p>
              <p className="text-2xl font-bold text-purple-400">
                {accessible.length}
                <span className="text-sm font-normal text-text-muted">/{definitions.length}</span>
              </p>
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Tier Sections */}
      {tiers.map((tier) => {
        const tierReports = byTier(tier);
        if (tierReports.length === 0) return null;

        return (
          <div key={tier} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-secondary">
                Tier {tier}: {TIER_LABELS[tier]}
              </h2>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-text-muted">
                {tierReports.length}
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {tierReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onGenerate={handleGenerate}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Config Drawer */}
      {configReport && (
        <ReportConfigDrawer
          report={configReport}
          onClose={() => setConfigReport(null)}
          onGenerate={handleConfigSubmit}
          generating={generating}
        />
      )}

      {/* Progress Modal */}
      {job && (
        <ReportProgressModal
          reportTitle={
            definitions.find((d) => d.report_key === job.report_key)?.title ?? job.report_key
          }
          status={job.status}
          downloadUrl={job.download_url}
          rowCount={job.row_count}
          dataQualityFlags={job.data_quality_flags}
          errorMessage={job.error_message}
          onDownload={handleDownload}
          onClose={reset}
        />
      )}
    </div>
  );
}

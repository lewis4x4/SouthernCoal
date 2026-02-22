import { useState } from 'react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { ReportCard } from './ReportCard';
import { ReportConfigDrawer } from './ReportConfigDrawer';
import { ReportProgressModal } from './ReportProgressModal';
import { useReportDefinitions, TIER_LABELS } from '@/hooks/useReportDefinitions';
import { useReportGeneration } from '@/hooks/useReportGeneration';
import type { ReportDefinitionWithAccess } from '@/hooks/useReportDefinitions';

export function ReportHubTab() {
  const { definitions, byTier, loading } = useReportDefinitions();
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
      <div className="space-y-12 animate-pulse mt-6 pb-12">
        <div className="space-y-4">
          <div className="h-5 w-32 rounded bg-white/[0.04] mb-4" />
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <SpotlightCard key={i} className="h-32 bg-white/[0.02]" spotlightColor="transparent">
                <div />
              </SpotlightCard>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-5 w-40 rounded bg-white/[0.04] mb-4" />
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2].map((i) => (
              <SpotlightCard key={i} className="h-32 bg-white/[0.02]" spotlightColor="transparent">
                <div />
              </SpotlightCard>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const tiers = [1, 2, 3, 4, 5];

  return (
    <div className="space-y-6">
      {/* Tier Sections */}
      {tiers.map((tier) => {
        const tierReports = byTier(tier);
        if (tierReports.length === 0) return null;

        return (
          <div key={tier} className="mb-12">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-white/[0.04] bg-gradient-to-r from-transparent via-white/[0.02] to-transparent bg-[length:200%_1px] bg-no-repeat bg-bottom">
              <h2 className="text-sm font-semibold text-text-secondary tracking-wide">
                Tier {tier}: {TIER_LABELS[tier]}
              </h2>
              <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-text-muted">
                {tierReports.length}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
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

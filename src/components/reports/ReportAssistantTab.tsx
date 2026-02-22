import { useState } from 'react';
import { Search, Sparkles, Play, Lock, Loader2, AlertTriangle } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useReportAssistant } from '@/hooks/useReportAssistant';
import { ReportProgressModal } from './ReportProgressModal';
import { useReportGeneration } from '@/hooks/useReportGeneration';
import { useReportDefinitions } from '@/hooks/useReportDefinitions';

const EXAMPLE_QUERIES = [
  'Show me all WV permits expiring this year',
  'Board meeting compliance summary for Tuesday',
  'EPA noncompliance status across all states',
  'Consent decree obligations with penalties',
  'FTS violations in Kentucky last 90 days',
  'Audit trail for last 30 days',
];

export function ReportAssistantTab() {
  const [query, setQuery] = useState('');
  const { analyze, result, loading, clear } = useReportAssistant();
  const { generate, download, reset, job, generating } = useReportGeneration();
  const { definitions } = useReportDefinitions();

  const handleSearch = async () => {
    if (!query.trim()) return;
    await analyze(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleGenerate = async (reportKey: string, config: Record<string, unknown>) => {
    clear();
    await generate(reportKey, config, 'csv', { download: true });
  };

  const handleDownload = () => {
    if (job?.download_url) download(job.download_url);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="font-medium">AI Report Assistant</span>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the report you need in plain English..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-11 pr-24 py-3.5 text-sm text-text-primary placeholder-text-muted focus:border-purple-500/40 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-lg bg-purple-500/15 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Analyze
          </button>
        </div>
      </div>

      {/* Example Queries */}
      {!result && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            Try asking...
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((eq) => (
              <button
                key={eq}
                onClick={() => {
                  setQuery(eq);
                  analyze(eq);
                }}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-text-muted hover:bg-white/[0.04] hover:text-text-secondary transition-colors"
              >
                {eq}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {result.suggestions.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
              <AlertTriangle className="h-6 w-6 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-text-secondary">
                No matching reports found for your query.
              </p>
              <p className="text-xs text-text-muted mt-1">
                Try rephrasing or use more specific terms like "permit", "DMR", "exceedance", "consent decree".
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">
                  Found {result.suggestions.length} report{result.suggestions.length !== 1 ? 's' : ''} matching your query
                </p>
                <button
                  onClick={() => { clear(); setQuery(''); }}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Clear
                </button>
              </div>

              <div className="space-y-3">
                {result.suggestions.map((suggestion) => {
                  const confidenceColor =
                    suggestion.confidence === 'high'
                      ? 'text-green-400 bg-green-500/10 border-green-500/20'
                      : suggestion.confidence === 'medium'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : 'text-slate-400 bg-slate-500/10 border-slate-500/20';

                  return (
                    <SpotlightCard
                      key={suggestion.report_key}
                      spotlightColor="rgba(168, 85, 247, 0.06)"
                      className="p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono text-text-muted">
                              #{suggestion.report_number}
                            </span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${confidenceColor}`}>
                              {suggestion.confidence} match
                            </span>
                            {suggestion.is_locked && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                <Lock className="h-2.5 w-2.5" />
                                LOCKED
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-text-primary">
                            {suggestion.title}
                          </h3>
                          <p className="mt-1 text-[11px] text-text-muted">
                            {suggestion.description}
                          </p>
                          <p className="mt-1 text-[10px] text-purple-400">
                            {suggestion.reason}
                          </p>

                          {/* Inferred Config */}
                          {Object.keys(suggestion.inferred_config).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {suggestion.inferred_config.states?.map((s) => (
                                <span
                                  key={s}
                                  className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-mono text-purple-400"
                                >
                                  {s}
                                </span>
                              ))}
                              {suggestion.inferred_config.date_from && (
                                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-mono text-blue-400">
                                  {suggestion.inferred_config.date_from} → {suggestion.inferred_config.date_to}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() =>
                            handleGenerate(
                              suggestion.report_key,
                              suggestion.inferred_config as Record<string, unknown>,
                            )
                          }
                          disabled={suggestion.is_locked || generating}
                          className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                            suggestion.is_locked
                              ? 'bg-white/[0.03] text-text-muted cursor-not-allowed'
                              : 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 active:scale-95'
                          }`}
                        >
                          {suggestion.is_locked ? (
                            <>
                              <Lock className="h-3 w-3" />
                              Locked
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" />
                              Generate
                            </>
                          )}
                        </button>
                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>
            </>
          )}
        </div>
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

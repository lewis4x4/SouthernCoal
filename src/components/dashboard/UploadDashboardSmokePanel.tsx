import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ClipboardCheck, Play, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { UPLOAD_DASHBOARD_SMOKE_CHECKS } from '@/lib/uploadDashboardSmokeChecklist';
import {
  runUploadDashboardRuntimeAssertions,
  type SmokeAssertionResult,
} from '@/lib/uploadDashboardSmokeAssertions';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';

/**
 * v6 §12 production-readiness smoke checklist — collapsible panel on Upload Dashboard.
 * Runtime checks run in-browser; full 10/10 wiring verified in CI (uploadDashboardSmokeChecklist.test.ts).
 */
export function UploadDashboardSmokePanel() {
  const { can } = usePermissions();
  const { log } = useAuditLog();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runtimeResults, setRuntimeResults] = useState<SmokeAssertionResult[] | null>(null);

  const resultById = useMemo(() => {
    const map = new Map<string, SmokeAssertionResult>();
    for (const r of runtimeResults ?? []) {
      map.set(r.id, r);
    }
    return map;
  }, [runtimeResults]);

  if (!can('view')) return null;

  const canRunRuntime = can('bulk_process');

  function handleRunRuntime() {
    const results = runUploadDashboardRuntimeAssertions();
    setRuntimeResults(results);
    log(
      'upload_smoke_runtime_run',
      {
        passed: results.filter((r) => r.passed).length,
        total: results.length,
      },
      { module: 'upload', tableName: 'file_processing_queue' },
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-qo-nested/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-qo-accent" />
          <span className="text-sm font-semibold text-text-primary">Production smoke checklist</span>
          <span className="text-[10px] text-text-muted">v6 §12 · 10 checks</span>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-text-muted" />
        ) : (
          <ChevronDown size={16} className="text-text-muted" />
        )}
      </button>

      {open && (
        <div className="border-t border-black/[0.06] px-4 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-muted max-w-xl">
              Run manual steps in staging before go-live. Runtime dedup + file-type checks run here;
              full wiring (realtime, audit export, session expiry) is verified in CI via{' '}
              <span className="font-mono text-text-secondary">npm test uploadDashboardSmoke</span>.
            </p>
            <button
              type="button"
              onClick={handleRunRuntime}
              disabled={!canRunRuntime}
              title={canRunRuntime ? undefined : 'Requires bulk process permission to run runtime checks'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                canRunRuntime
                  ? 'border-qo-accent/30 bg-qo-accent/10 text-qo-accent hover:bg-qo-accent/20'
                  : 'opacity-50 cursor-not-allowed border-black/[0.08] text-text-muted',
              )}
            >
              <Play size={12} />
              Run runtime checks
            </button>
          </div>

          <ol className="space-y-2">
            {UPLOAD_DASHBOARD_SMOKE_CHECKS.map((check) => {
              const runtime = resultById.get(check.id);
              const isExpanded = expandedId === check.id;

              return (
                <li
                  key={check.id}
                  className="rounded-lg border border-black/[0.06] bg-qo-nested/40 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : check.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="text-[10px] font-mono text-text-muted w-5">{check.order}.</span>
                    {runtime ? (
                      runtime.passed ? (
                        <CheckCircle2 size={14} className="text-qo-sage-text shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-qo-risk shrink-0" />
                      )
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-black/[0.12] shrink-0" />
                    )}
                    <span className="text-xs font-medium text-text-primary flex-1">{check.title}</span>
                    <span className="text-[10px] text-text-muted">Manual</span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 border-t border-black/[0.04]">
                      {runtime && (
                        <p
                          className={cn(
                            'text-[11px] mt-2 mb-2',
                            runtime.passed ? 'text-qo-sage-text' : 'text-qo-risk',
                          )}
                        >
                          Runtime: {runtime.message}
                        </p>
                      )}
                      <ul className="list-disc pl-5 space-y-1">
                        {check.manualSteps.map((step) => (
                          <li key={step} className="text-[11px] text-text-muted leading-snug">
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

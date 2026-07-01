import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useParameterAliasCoverage } from '@/hooks/useParameterAliasCoverage';

export function ParameterAliasCoveragePanel() {
  const { coverage, parserCheck, loading, error, harnessOk, refresh } = useParameterAliasCoverage();

  return (
    <section
      className={cn(
        'rounded-xl border p-4 shadow-sm',
        harnessOk
          ? 'border-qo-sage/25 bg-qo-sage/[0.04]'
          : 'border-qo-ochre/30 bg-qo-ochre/[0.04]',
      )}
      aria-labelledby="alias-coverage-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {harnessOk ? (
            <CheckCircle2 size={18} className="mt-0.5 text-qo-sage-text" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 text-qo-ochre-text" />
          )}
          <div>
            <h2 id="alias-coverage-heading" className="text-sm font-semibold text-text-primary">
              STORET / alias coverage (task 2.64)
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {coverage?.disclaimer ??
                'Automated harness — does not replace Bill Johnson Q28 canonical dictionary sign-off'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[10px] font-medium text-text-primary hover:bg-black/[0.02] disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Parameters</p>
          <p className="text-lg font-semibold tabular-nums">{loading ? '—' : coverage?.parameter_count ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Aliases</p>
          <p className="text-lg font-semibold tabular-nums">{loading ? '—' : coverage?.alias_count ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Missing STORET</p>
          <p className="text-lg font-semibold tabular-nums text-qo-risk">
            {loading ? '—' : coverage?.missing_storet_code.length ?? 0}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Parser map</p>
          <p className="text-lg font-semibold tabular-nums">
            {loading ? '—' : parserCheck?.valid ? 'Pass' : 'Review'}
          </p>
        </div>
      </div>

      {!loading && coverage && coverage.missing_storet_code.length > 0 && (
        <details className="mt-3 text-xs text-text-secondary">
          <summary className="cursor-pointer text-qo-ochre-text">Missing STORET codes</summary>
          <ul className="mt-2 list-disc pl-5">
            {coverage.missing_storet_code.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      )}

      {!loading && coverage && coverage.parameters_without_aliases.length > 0 && (
        <details className="mt-2 text-xs text-text-secondary">
          <summary className="cursor-pointer text-qo-ochre-text">
            Parameters without aliases ({coverage.parameters_without_aliases.length})
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {coverage.parameters_without_aliases.slice(0, 20).map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      )}

      {!loading && parserCheck && !parserCheck.valid && (
        <p className="mt-3 text-xs text-qo-risk">{parserCheck.errors.join('; ')}</p>
      )}
    </section>
  );
}

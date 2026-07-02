import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Download, FlaskConical, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { VerificationBadge } from '@/components/dashboard/queue/VerificationBadge';
import { useSyntheticPermitLimits } from '@/hooks/useSyntheticPermitLimits';
import { toVerificationStatus } from '@/lib/syntheticPermitLimits';
import { usePermissions } from '@/hooks/usePermissions';

interface Props {
  count: number;
}

/**
 * Surfaces ECHO-backfilled permit limits labeled SYNTHETIC_UAT_SLICE1 for PDF verification.
 */
export function SyntheticLimitReviewPanel({ count }: Props) {
  const { rows, loading, updatingId, fetchRows, exportCsv, updateReviewStatus } =
    useSyntheticPermitLimits();
  const { can } = usePermissions();
  const canVerify = can('verify');
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (count === 0) return null;

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) {
      const result = await fetchRows(true);
      if (!result.ok) toast.error(result.error);
      else setLoaded(true);
    }
  }

  async function handleExport() {
    const result = await exportCsv();
    if (!result.ok) toast.error(result.error);
    else toast.success(`Exported ${result.count.toLocaleString()} synthetic limits to CSV`);
  }

  async function handleReview(limitId: string, status: 'verified' | 'disputed') {
    const result = await updateReviewStatus(limitId, status);
    if (!result.ok) toast.error(result.error);
    else toast.success(status === 'verified' ? 'Limit marked verified' : 'Limit flagged disputed');
  }

  const pendingShown = rows.filter((r) => r.review_status !== 'verified').length;

  return (
    <SpotlightCard className="p-4 border border-purple-500/20 bg-purple-500/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <FlaskConical className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-text-primary">
              {count.toLocaleString()} synthetic permit limits need verification
            </h3>
            <p className="text-xs text-text-secondary max-w-2xl">
              Backfilled from ECHO <span className="font-mono">limit_value</span> rows (
              <span className="font-mono">SYNTHETIC_UAT_SLICE1</span>). Compare against permit PDFs
              on Upload Dashboard before treating as authoritative for exceedance or DMR logic.
            </p>
            <p className="text-[10px] text-text-muted">
              CLI: <span className="font-mono">npm run qa:slice1-export-synthetic-limits</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleExpand()}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Hide queue' : 'Review queue'}
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-purple-500/15 pt-3">
          {loading && rows.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-text-muted py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading synthetic limits…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-text-muted py-2">No unverified synthetic limits in the loaded batch.</p>
          ) : (
            <>
              <p className="text-[10px] text-text-muted mb-2">
                Showing {pendingShown} unverified of first {rows.length} rows (max 100). Export CSV for
                the full set.
              </p>
              <div className="max-h-80 overflow-auto rounded-lg border border-black/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-qo-nested text-[10px] uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Permit</th>
                      <th className="px-3 py-2 font-medium">Outfall</th>
                      <th className="px-3 py-2 font-medium">Parameter</th>
                      <th className="px-3 py-2 font-medium text-right">Limit</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      {canVerify && <th className="px-3 py-2 font-medium text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-black/[0.04]">
                        <td className="px-3 py-2 font-mono text-text-primary">{row.permit_number}</td>
                        <td className="px-3 py-2 font-mono text-text-secondary">{row.outfall_number}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {row.parameter_name || row.parameter_code || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-text-primary">
                          {row.limit_value ?? '—'} {row.unit}
                          <span className="block text-[10px] text-text-muted">{row.limit_type}</span>
                        </td>
                        <td className="px-3 py-2">
                          <VerificationBadge status={toVerificationStatus(row.review_status)} />
                        </td>
                        {canVerify && (
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {row.review_status !== 'verified' && (
                                <button
                                  type="button"
                                  disabled={updatingId === row.id}
                                  onClick={() => void handleReview(row.id, 'verified')}
                                  title="Mark verified against permit PDF"
                                  className="rounded p-1 text-verification-verified hover:bg-verification-verified/10 disabled:opacity-40"
                                >
                                  {updatingId === row.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              {row.review_status !== 'disputed' && (
                                <button
                                  type="button"
                                  disabled={updatingId === row.id}
                                  onClick={() => void handleReview(row.id, 'disputed')}
                                  title="Flag limit as disputed"
                                  className="rounded p-1 text-verification-disputed hover:bg-verification-disputed/10 disabled:opacity-40"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </SpotlightCard>
  );
}

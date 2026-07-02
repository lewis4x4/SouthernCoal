import { Link } from 'react-router-dom';
import { Download, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { downloadLimitGapsCsv, type Slice1ActivationGapsReport } from '@/lib/slice1ActivationGaps';

interface Props {
  gaps: Slice1ActivationGapsReport | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function FunnelRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <tr className="border-t border-black/[0.06] first:border-t-0">
      <td className="py-1.5 pr-4 text-xs text-text-secondary">{label}</td>
      <td className="py-1.5 text-xs font-mono text-text-primary text-right">{value.toLocaleString()}</td>
      {hint && <td className="py-1.5 pl-3 text-[10px] text-text-muted">{hint}</td>}
    </tr>
  );
}

export function Slice1ActivationFunnelPanel({ gaps, loading, error, onRefresh }: Props) {
  const top = gaps?.top_permits_missing_limits?.slice(0, 5) ?? [];

  return (
    <SpotlightCard className="p-4 border border-qo-accent/20 bg-qo-accent/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-qo-accent" />
            <h3 className="text-sm font-semibold text-text-primary">Rule 2 activation funnel</h3>
            <span className="text-[10px] uppercase tracking-wide text-qo-ochre-text">Draft metrics</span>
          </div>
          <p className="text-xs text-text-secondary max-w-2xl">
            ECHO violation keys vs internal permit graph. Upload permits and limits via Upload Dashboard;
            map federal IDs above to grow resolvable keys.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/compliance"
            className="text-[10px] px-2 py-1 rounded border border-black/[0.08] text-text-secondary hover:text-text-primary"
          >
            Upload Dashboard
          </Link>
          <Link
            to="/review-queue"
            className="text-[10px] px-2 py-1 rounded border border-black/[0.08] text-text-secondary hover:text-text-primary"
          >
            Review Queue
          </Link>
          <button
            type="button"
            onClick={() => gaps && downloadLimitGapsCsv(gaps)}
            disabled={!gaps || (gaps.top_permits_missing_limits?.length ?? 0) === 0}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-black/[0.08] text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <Download className="w-3 h-3" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-black/[0.08] text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-qo-risk mb-2">Could not load activation funnel: {error}</p>
      )}

      {gaps && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <table className="w-full">
              <tbody>
                <FunnelRow label="Distinct violation keys" value={gaps.funnel.distinct_violation_keys} />
                <FunnelRow label="Has permit" value={gaps.funnel.has_permit} />
                <FunnelRow label="Has outfall" value={gaps.funnel.has_outfall} />
                <FunnelRow label="Has parameter" value={gaps.funnel.has_parameter} />
                <FunnelRow
                  label="Has permit limit"
                  value={gaps.funnel.has_permit_limit}
                  hint="Resolvable for mirror seed"
                />
                <FunnelRow label="Mirrored keys" value={gaps.mirror_keys} />
                <FunnelRow
                  label="Pending missing_internal"
                  value={gaps.pending_missing_internal}
                  hint="Monthly ECHO rows"
                />
                <FunnelRow
                  label="Permits without federal override"
                  value={gaps.permits_without_federal_override}
                />
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted mb-2">
              Top permits missing limits
            </p>
            {top.length === 0 ? (
              <p className="text-xs text-text-muted">No outfall+parameter gaps with missing limit rows.</p>
            ) : (
              <ul className="space-y-1">
                {top.map((row) => (
                  <li
                    key={`${row.permit_number}-${row.missing_limit_keys}`}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-text-primary">{row.permit_number}</span>
                    <span className="text-text-muted">{row.missing_limit_keys} keys</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-text-muted mt-3">
              CLI: <span className="font-mono">npm run qa:slice1-activate</span>
            </p>
          </div>
        </div>
      )}
    </SpotlightCard>
  );
}

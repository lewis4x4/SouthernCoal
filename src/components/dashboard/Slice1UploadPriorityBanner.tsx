import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useSlice1ActivationGaps } from '@/hooks/useSlice1ActivationGaps';

/**
 * Upload Dashboard — surfaces top permit limit gaps from Rule 2 activation funnel.
 */
export function Slice1UploadPriorityBanner() {
  const { gaps, loading } = useSlice1ActivationGaps();

  if (loading || !gaps) return null;

  const top = gaps.top_permits_missing_limits?.slice(0, 3) ?? [];
  if (top.length === 0 && gaps.synthetic_echo_limits === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-qo-ochre-text shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-text-primary">Permit data unlocks Rule 2 triage</p>
          <p className="text-[11px] text-text-secondary">
            {gaps.pending_missing_internal.toLocaleString()} pending{' '}
            <span className="font-mono">missing_internal</span> rows ·{' '}
            {gaps.funnel.has_permit_limit.toLocaleString()} resolvable keys ·{' '}
            {gaps.funnel.no_permit.toLocaleString()} ECHO keys with no registry permit match
            {gaps.synthetic_echo_limits > 0 && (
              <>
                {' '}
                · {gaps.synthetic_echo_limits.toLocaleString()} SYNTHETIC limits need permit PDF
                verification
              </>
            )}
          </p>
          {top.length > 0 && (
            <p className="text-[11px] text-text-muted">
              Priority uploads:{' '}
              {top.map((row, i) => (
                <span key={row.permit_number}>
                  {i > 0 ? ', ' : ''}
                  <span className="font-mono text-text-secondary">{row.permit_number}</span>
                  {' '}
                  ({row.missing_limit_keys})
                </span>
              ))}
            </p>
          )}
          <Link
            to="/compliance/external-data"
            className="inline-block text-[10px] text-qo-accent hover:underline mt-1"
          >
            View activation funnel & export CSV →
          </Link>
        </div>
      </div>
    </div>
  );
}

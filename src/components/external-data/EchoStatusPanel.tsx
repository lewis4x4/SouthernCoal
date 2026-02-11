import { RefreshCw, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useExternalData } from '@/hooks/useExternalData';
import type { EchoFacility, EchoDmrSummary } from '@/hooks/useExternalData';

interface Props {
  npdesId: string;
  internalStatus?: string | null;
}

function StatusMatch({ internal, external }: { internal?: string | null; external?: string | null }) {
  if (!internal || !external) return null;
  const match = internal.toLowerCase().trim() === external.toLowerCase().trim();
  return match ? (
    <CheckCircle size={14} className="text-emerald-400" />
  ) : (
    <XCircle size={14} className="text-red-400" />
  );
}

function Field({ label, value, extra }: { label: string; value: string | null; extra?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-primary font-mono">{value || '—'}</span>
        {extra}
      </div>
    </div>
  );
}

function ComplianceBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-text-muted">—</span>;
  const isSNC = status.toLowerCase().includes('snc') || status.toLowerCase().includes('significant');
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
        isSNC
          ? 'bg-red-500/10 text-red-400 border-red-500/20'
          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      )}
    >
      {status}
    </span>
  );
}

export function EchoStatusPanel({ npdesId, internalStatus }: Props) {
  const { echoFacility, dmrSummary, loading, refetchEcho } = useExternalData(npdesId);

  const f = echoFacility as EchoFacility | null;
  const dmr = dmrSummary as EchoDmrSummary | null;

  return (
    <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.06)" className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">EPA ECHO</h3>
          <p className="text-[10px] text-text-muted mt-0.5">{npdesId}</p>
        </div>
        <button
          onClick={refetchEcho}
          disabled={loading}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-secondary disabled:opacity-40"
          title="Refresh ECHO data"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {!f ? (
        <p className="text-xs text-text-muted py-4 text-center">
          {loading ? 'Loading...' : 'No ECHO data synced for this permit'}
        </p>
      ) : (
        <div className="space-y-0">
          <Field
            label="Permit Status"
            value={f.permit_status}
            extra={<StatusMatch internal={internalStatus} external={f.permit_status} />}
          />
          <div className="flex items-start justify-between py-2 border-b border-white/[0.04]">
            <span className="text-xs text-text-muted">Compliance</span>
            <ComplianceBadge status={f.compliance_status} />
          </div>
          {f.qtrs_in_nc != null && f.qtrs_in_nc > 0 && (
            <Field label="Qtrs in NC" value={String(f.qtrs_in_nc)} />
          )}
          <Field label="Last Inspection" value={f.last_inspection_date} />
          {f.last_penalty_amount != null && f.last_penalty_amount > 0 && (
            <Field
              label="Last Penalty"
              value={`$${f.last_penalty_amount.toLocaleString()}`}
            />
          )}
          <Field label="Effective" value={f.permit_effective_date} />
          <Field label="Expires" value={f.permit_expiration_date} />

          {dmr && (
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">DMR Data</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold text-text-primary">{dmr.total}</p>
                  <p className="text-[10px] text-text-muted">Records</p>
                </div>
                <div>
                  <p className={cn('text-lg font-semibold', dmr.withViolations > 0 ? 'text-red-400' : 'text-emerald-400')}>
                    {dmr.withViolations}
                  </p>
                  <p className="text-[10px] text-text-muted">Violations</p>
                </div>
                <div>
                  <p className="text-xs text-text-primary mt-1">{dmr.latestPeriod || '—'}</p>
                  <p className="text-[10px] text-text-muted">Latest Period</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
        {f && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock size={10} />
            Last synced {new Date(f.synced_at).toLocaleDateString()}
          </div>
        )}
        <p className="text-[9px] text-text-muted italic">
          Public data may be delayed 30-90 days
        </p>
      </div>
    </SpotlightCard>
  );
}

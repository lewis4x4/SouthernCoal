import { Link } from 'react-router-dom';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSamplingObligationLedger } from '@/hooks/useSamplingObligationLedger';
import {
  OBLIGATION_DOMAIN_LABELS,
  OBLIGATION_STATUS_LABELS,
  isNpdesObligationRow,
  type ObligationDomain,
  type ObligationStatus,
} from '@/lib/samplingObligationLedger';

const STATUS_BADGE: Record<ObligationStatus, string> = {
  fulfilled: 'bg-qo-sage/10 text-qo-sage-text border-qo-sage/25',
  excused: 'bg-black/[0.04] text-text-secondary border-black/[0.08]',
  missed: 'bg-qo-risk/10 text-qo-risk border-qo-risk/25',
  at_risk: 'bg-qo-ochre/10 text-qo-ochre-text border-qo-ochre/25',
  upcoming: 'bg-qo-accent/10 text-qo-accent border-qo-accent/25',
};

const FILTER_OPTIONS: Array<{ value: ObligationStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'missed', label: 'Missed' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'excused', label: 'Excused' },
  { value: 'upcoming', label: 'Upcoming' },
];

const DOMAIN_OPTIONS: Array<{ value: ObligationDomain | null; label: string }> = [
  { value: null, label: OBLIGATION_DOMAIN_LABELS.all },
  { value: 'npdes', label: OBLIGATION_DOMAIN_LABELS.npdes },
  { value: 'smcra', label: OBLIGATION_DOMAIN_LABELS.smcra },
  { value: 'msha', label: OBLIGATION_DOMAIN_LABELS.msha },
];

export function SamplingObligationLedgerPage() {
  const {
    ledger,
    loading,
    refreshingClocks,
    error,
    statusFilter,
    domainFilter,
    applyStatusFilter,
    applyDomainFilter,
    refetch,
  } = useSamplingObligationLedger();

  const counts = ledger?.status_counts;
  const coverage = ledger?.coverage;
  const rows = ledger?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-qo-accent" />
            <h2 className="text-xl font-semibold text-text-primary">Statutory Obligation Ledger</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            NPDES sampling calendar plus SMCRA and MSHA clocks — partial until matrix and sync data land
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-qo-ochre/30 bg-qo-ochre/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-qo-ochre-text">
            {ledger?.disclaimer ?? 'DRAFT — partial obligation calendar'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading || refreshingClocks}
          className="inline-flex items-center gap-2 rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-xs font-medium text-text-primary hover:bg-black/[0.02] disabled:opacity-50"
        >
          {loading || refreshingClocks ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Refresh clocks
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Active schedules</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
            {loading ? '—' : coverage?.active_schedules ?? 0}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {coverage?.distinct_outfalls ?? 0} outfalls · {coverage?.distinct_parameters ?? 0} parameters
          </p>
        </div>
        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Calendar events</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
            {loading ? '—' : coverage?.calendar_events ?? 0}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Matrix rows: {coverage?.matrix_rows ?? 0}
            {coverage?.matrix_loaded ? ' (loaded)' : ' (partial)'}
          </p>
        </div>
        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Missed / at risk</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-qo-risk">
            {loading ? '—' : (counts?.missed ?? 0) + (counts?.at_risk ?? 0)}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {counts?.missed ?? 0} missed · {counts?.at_risk ?? 0} at risk
          </p>
          {!loading && ((counts?.missed ?? 0) > 0 || (counts?.at_risk ?? 0) > 0) && (
            <Link to="/compliance/missed-at-risk" className="mt-2 inline-flex text-xs text-qo-accent hover:underline">
              Open gap queue →
            </Link>
          )}
        </div>
        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Fulfilled</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-qo-sage-text">
            {loading ? '—' : counts?.fulfilled ?? 0}
          </p>
          <p className="mt-1 text-xs text-text-muted">{counts?.excused ?? 0} excused</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {DOMAIN_OPTIONS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => applyDomainFilter(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-wide',
              domainFilter === value
                ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
                : 'border-black/[0.08] text-text-muted hover:text-text-primary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => applyStatusFilter(value)}
            className={cn(
              'rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-wide',
              statusFilter === value
                ? 'border-qo-accent/40 bg-qo-accent/10 text-qo-accent'
                : 'border-black/[0.08] text-text-muted hover:text-text-primary',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white shadow-sm">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[10px] uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Due date</th>
              <th className="px-4 py-3">Obligation</th>
              <th className="px-4 py-3">Detail</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  <Loader2 className="mx-auto animate-spin" size={18} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  No obligations for this filter — populate schedules via Upload Dashboard or refresh MSHA/SMCRA clocks.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                if (isNpdesObligationRow(row)) {
                  return (
                    <tr key={row.calendar_id} className="border-t border-black/[0.04]">
                      <td className="px-4 py-2.5 uppercase text-[10px] text-qo-accent">NPDES</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {new Date(row.effective_due).toLocaleDateString()}
                        {row.obligation_status === 'missed' && row.days_late > 0 && (
                          <span className="ml-1 text-qo-risk">({row.days_late}d late)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.outfall_number ?? '—'} · {row.parameter_short_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px]">{row.permit_number ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-flex rounded border px-2 py-0.5 text-[10px] font-medium uppercase',
                            STATUS_BADGE[row.obligation_status],
                          )}
                        >
                          {OBLIGATION_STATUS_LABELS[row.obligation_status]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">{row.schedule_source ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {(row.obligation_status === 'missed' || row.obligation_status === 'at_risk') && (
                          <Link
                            to="/compliance/missed-at-risk"
                            className="text-qo-accent hover:underline"
                          >
                            Gap queue
                          </Link>
                        )}
                        {row.obligation_status === 'missed' && (
                          <Link
                            to="/compliance/defensible-miss"
                            className="ml-2 text-purple-300 hover:underline"
                          >
                            Packet
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                }

                const due = row.due_date ? new Date(row.due_date).toLocaleDateString() : '—';
                return (
                  <tr key={row.clock_key ?? row.id ?? index} className="border-t border-black/[0.04]">
                    <td className="px-4 py-2.5 uppercase text-[10px] text-purple-300">{row.domain}</td>
                    <td className="px-4 py-2.5 tabular-nums">{due}</td>
                    <td className="px-4 py-2.5">{row.label}</td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {row.severity ? `${row.severity} severity` : '—'}
                      {row.domain === 'msha' && row.metadata?.mine_id != null && (
                        <span className="ml-1 font-mono text-[10px]">mine {String(row.metadata.mine_id)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'inline-flex rounded border px-2 py-0.5 text-[10px] font-medium uppercase',
                          STATUS_BADGE[row.obligation_status],
                        )}
                      >
                        {OBLIGATION_STATUS_LABELS[row.obligation_status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {row.domain === 'msha' ? (
                        <Link to="/compliance/external-data" className="text-qo-accent hover:underline">
                          MSHA sync
                        </Link>
                      ) : (
                        'draft metadata'
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.domain === 'msha' && (row.obligation_status === 'missed' || row.obligation_status === 'at_risk') && (
                        <Link to="/compliance/external-data" className="text-qo-accent hover:underline">
                          Abatement
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

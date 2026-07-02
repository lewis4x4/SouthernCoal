import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Download, Loader2, RefreshCw, Scale, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDollars } from '@/lib/format';
import { PENALTY_CONFIDENCE_LABELS, getPenaltySourceLink } from '@/lib/penaltyLedger';
import { DISCLAIMER_EXPORT } from '@/lib/disclaimer';
import { usePenaltyLedger } from '@/hooks/usePenaltyLedger';
import { usePenaltyRegimes } from '@/hooks/usePenaltyRegimes';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { PENALTY_LEDGER_SIGNOFF_ROLES } from '@/lib/rbac';

const CONFIDENCE_BADGE: Record<string, string> = {
  uploaded: 'bg-qo-sage/10 text-qo-sage-text border-qo-sage/25',
  draft_estimate: 'bg-qo-ochre/10 text-qo-ochre-text border-qo-ochre/25',
  calculated: 'bg-qo-accent/10 text-qo-accent border-qo-accent/25',
  mixed: 'bg-black/[0.04] text-text-secondary border-black/[0.08]',
};

const REGIME_STATUS_BADGE: Record<string, string> = {
  verified: 'bg-qo-sage/10 text-qo-sage-text border-qo-sage/25',
  draft: 'bg-qo-ochre/10 text-qo-ochre-text border-qo-ochre/25',
  not_configured: 'bg-black/[0.04] text-text-muted border-black/[0.08]',
  disputed: 'bg-red-500/10 text-red-300 border-red-500/25',
};

export function PenaltyLedgerPage() {
  const { summary, loading, signingOff, error, refetch, signOff } = usePenaltyLedger();
  const { regimes, loading: regimesLoading, hasVerifiedRegime } = usePenaltyRegimes();
  const { hasAllowedRole } = usePermissions();
  const { log } = useAuditLog();
  const canSignOff = hasAllowedRole(PENALTY_LEDGER_SIGNOFF_ROLES, 'global');
  const [note, setNote] = useState('');

  const combinedTotal = summary?.totals.draft_combined ?? 0;
  const isVerified = summary?.verification_status === 'verified';

  const sourceRows = useMemo(() => summary?.sources ?? [], [summary]);

  function handleExportCsv() {
    if (!summary) return;
    const headers = ['Source', 'Label', 'Confidence', 'Verification', 'Events', 'Amount', 'Citation'];
    const body = sourceRows.map((row) => [
      row.key,
      row.label,
      row.confidence,
      row.verification_status ?? 'draft',
      row.event_count,
      row.amount,
      row.citation ?? '',
    ]);
    const csv = [headers, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(
      [
        `${csv}\n\n"DRAFT COMBINED",${combinedTotal}\n"DISCLAIMER","${DISCLAIMER_EXPORT.replace(/"/g, '""')}"`,
      ],
      { type: 'text/csv;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `penalty_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log(
      'penalty_ledger_export_csv',
      { source_count: sourceRows.length, draft_combined: combinedTotal },
      { module: 'compliance', tableName: 'penalty_exposure_lines' },
    );
  }

  async function handleSignOff() {
    await signOff(note);
    setNote('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Scale size={20} className="text-qo-accent" />
            <h2 className="text-xl font-semibold text-text-primary">Stipulated Penalty Ledger</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Running draft exposure from FTS uploads, calendar gaps, CD obligations, and violations
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-qo-ochre/30 bg-qo-ochre/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-qo-ochre-text">
            DRAFT — internal estimate, not verified for external or legal use
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || sourceRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-xs font-medium text-text-primary hover:bg-black/[0.02] disabled:opacity-50"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-xs font-medium text-text-primary hover:bg-black/[0.02] disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {!regimesLoading && !hasVerifiedRegime && (
        <div className="rounded-lg border border-qo-ochre/30 bg-qo-ochre/10 px-4 py-3 text-xs text-qo-ochre-text">
          Coverage sign-off is blocked until at least one penalty regime is marked{' '}
          <strong>verified</strong> (Consent Decree appendix compilation — task 3.17). Regimes
          below are seeded as not-configured placeholders.
        </div>
      )}

      <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden shadow-sm">
        <div className="border-b border-black/[0.06] px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Penalty regimes (K2 substrate)</h3>
          <p className="mt-0.5 text-[10px] text-text-muted">
            Bitemporal rate schedule — EMPTY until counsel verifies CD appendix rates
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-black/[0.02] text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Regime</th>
                <th className="px-4 py-2 font-medium">Citation</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {regimes.map((regime) => (
                <tr key={regime.id} className="border-t border-black/[0.04]">
                  <td className="px-4 py-3 text-text-primary">{regime.label}</td>
                  <td className="px-4 py-3 text-text-secondary max-w-md truncate" title={regime.citation}>
                    {regime.citation}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase',
                        REGIME_STATUS_BADGE[regime.verification_status] ?? REGIME_STATUS_BADGE.not_configured,
                      )}
                    >
                      {regime.verification_status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {!regimesLoading && regimes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-text-muted">
                    No penalty regimes configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-black/[0.08] bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Draft combined total</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-qo-risk">
            {loading ? '—' : formatDollars(combinedTotal)}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Sum of all sources below — not a legal or DOJ-ready figure
          </p>
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Uploaded FTS only</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
            {loading ? '—' : formatDollars(summary?.totals.uploaded_only ?? 0)}
          </p>
          <Link
            to="/compliance/failure-to-sample"
            className="mt-2 inline-flex text-xs text-qo-accent hover:underline"
          >
            View FTS detail →
          </Link>
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Review status</p>
          <div className="mt-2 flex items-center gap-2">
            {isVerified ? (
              <ShieldCheck size={18} className="text-qo-sage-text" />
            ) : (
              <DollarSign size={18} className="text-qo-ochre-text" />
            )}
            <span className={cn('text-sm font-medium', isVerified ? 'text-qo-sage-text' : 'text-qo-ochre-text')}>
              {isVerified ? 'Coverage reviewed' : 'Awaiting counsel review'}
            </span>
          </div>
          {summary?.latest_verification?.verified_at && (
            <p className="mt-1 text-xs text-text-muted">
              Last sign-off: {new Date(summary.latest_verification.verified_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden shadow-sm">
        <div className="border-b border-black/[0.06] px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Exposure by source</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-black/[0.02] text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
                <th className="px-4 py-2 font-medium">Verification</th>
                <th className="px-4 py-2 font-medium">Citation</th>
                <th className="px-4 py-2 font-medium text-right">Events</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="px-4 py-2 font-medium">Drill-down</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((row) => {
                const drillDown = getPenaltySourceLink(row.key);
                return (
                <tr key={row.key} className="border-t border-black/[0.04]">
                  <td className="px-4 py-3 text-text-primary">{row.label}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        CONFIDENCE_BADGE[row.confidence] ?? CONFIDENCE_BADGE.mixed,
                      )}
                    >
                      {PENALTY_CONFIDENCE_LABELS[row.confidence] ?? row.confidence}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] uppercase text-text-muted">
                      {row.verification_status ?? 'draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-text-secondary" title={row.citation}>
                    {row.citation ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {row.event_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-text-primary">
                    {formatDollars(row.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {drillDown ? (
                      <Link to={drillDown} className="text-qo-accent hover:underline">
                        View
                      </Link>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
              })}
              {!loading && sourceRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                    No penalty sources populated yet — upload FTS data or run gap detection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-text-primary">Data coverage</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-text-muted">FTS violation rows</dt>
              <dd className="font-medium tabular-nums">{summary?.data_coverage.fts_rows ?? 0}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Open missed gaps</dt>
              <dd className="font-medium tabular-nums">
                <Link to="/compliance/missed-at-risk" className="text-qo-accent hover:underline">
                  {summary?.data_coverage.open_gaps ?? 0}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">CD obligations w/ accrual</dt>
              <dd className="font-medium tabular-nums">
                <Link to="/obligations" className="text-qo-accent hover:underline">
                  {summary?.data_coverage.obligations_with_penalty ?? 0}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Open violations</dt>
              <dd className="font-medium tabular-nums">
                <Link to="/compliance/violations" className="text-qo-accent hover:underline">
                  {summary?.data_coverage.open_violations ?? 0}
                </Link>
              </dd>
            </div>
          </dl>
        </div>

        {canSignOff && (
          <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-text-primary">Coverage sign-off</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Records that a qualified reviewer acknowledged this draft ledger snapshot. This is not
              legal certification or approval for external submission.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (e.g. reviewed against Q2 matrix partial)"
              rows={3}
              className="mt-3 w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-qo-accent/40"
            />
            <button
              type="button"
              onClick={() => void handleSignOff()}
              disabled={signingOff || loading || !hasVerifiedRegime}
              title={
                !hasVerifiedRegime
                  ? 'Requires at least one verified penalty_regimes row (task 3.17)'
                  : undefined
              }
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-qo-accent px-4 py-2 text-xs font-medium text-white hover:bg-qo-accent/90 disabled:opacity-50"
            >
              {signingOff ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Record coverage review
            </button>
          </div>
        )}
      </div>

      {summary?.computed_at && (
        <p className="text-[10px] text-text-muted">
          Computed {new Date(summary.computed_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

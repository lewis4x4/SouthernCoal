import { useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAlignPermitStatusFromEcho } from '@/hooks/useAlignPermitStatusFromEcho';
import {
  formatNpdesPermitStatusLabel,
  mapEchoPermitStatusToInternal,
  statusMismatchNeedsInternalUpdate,
} from '@/lib/echoPermitStatusMap';
import { formatDiscrepancyReviewerLabel, selfReviewDisplayNameFromProfile } from '@/lib/reviewQueueDisplay';
import type { DiscrepancyRow, DiscrepancySeverity } from '@/stores/reviewQueue';

const SEVERITY_BADGE: Record<DiscrepancySeverity, string> = {
  critical: 'bg-red-500/10 text-qo-risk border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-qo-ochre-text border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const NO_VERIFY_TRIAGE_TITLE = 'Requires verify permission to change discrepancy status';

const DISMISS_REASONS = [
  'Data timing difference — external data delayed',
  'General permit — limited ECHO coverage expected',
  'False positive — values within acceptable tolerance',
  'Already addressed in corrective action',
  'Other',
];

const STATUS_MISMATCH_DISMISS_REASONS = [
  'Internal active is correct — renewal pending or ECHO lag',
  'Internal status updated to match ECHO termination/expiry',
  'Duplicate permit record — resolved elsewhere',
  'Other',
];

interface Props {
  discrepancy: DiscrepancyRow;
  reviewerNames?: Record<string, string>;
  onClose: () => void;
  onAction: (
    id: string,
    status: 'reviewed' | 'dismissed' | 'escalated' | 'resolved',
    extra?: { review_notes?: string; dismiss_reason?: string },
  ) => Promise<string | null>;
}

export function DiscrepancyDetailPanel({ discrepancy: d, reviewerNames, onClose, onAction }: Props) {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canTriage = can('verify');
  const { alignStatus, busy: alignBusy } = useAlignPermitStatusFromEcho();
  const { profile } = useUserProfile();
  const reviewerLabel = formatDiscrepancyReviewerLabel(
    d.reviewed_by,
    user?.id ?? null,
    selfReviewDisplayNameFromProfile(profile),
    reviewerNames,
  );
  const [notes, setNotes] = useState(d.review_notes || '');
  const [dismissReason, setDismissReason] = useState('');
  const [showDismiss, setShowDismiss] = useState(false);
  const [busy, setBusy] = useState(false);

  const [customDismissText, setCustomDismissText] = useState('');
  const dismissReasons =
    d.discrepancy_type === 'status_mismatch' ? STATUS_MISMATCH_DISMISS_REASONS : DISMISS_REASONS;

  const suggestedInternalStatus = d.external_value
    ? mapEchoPermitStatusToInternal(d.external_value)
    : null;
  const canAlignStatus =
    d.discrepancy_type === 'status_mismatch' &&
    d.internal_source_table === 'npdes_permits' &&
    Boolean(d.internal_source_id) &&
    statusMismatchNeedsInternalUpdate(d.internal_value, d.external_value);

  async function handleAlignStatus() {
    if (!d.internal_source_id || !d.external_value) return;
    const result = await alignStatus(d.internal_source_id, d.external_value, notes || undefined);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Permit status updated to ${formatNpdesPermitStatusLabel(result.newStatus)} — dismiss this row when ready`,
    );
    setDismissReason('Internal status updated to match ECHO termination/expiry');
    setShowDismiss(true);
  }

  async function handleAction(status: 'reviewed' | 'dismissed' | 'escalated' | 'resolved') {
    setBusy(true);
    const extra: { review_notes?: string; dismiss_reason?: string } = {};
    if (notes) extra.review_notes = notes;
    if (status === 'dismissed' && dismissReason) {
      extra.dismiss_reason = dismissReason === 'Other' && customDismissText
        ? `Other: ${customDismissText}`
        : dismissReason;
    }
    const err = await onAction(d.id, status, extra);
    setBusy(false);
    if (err) {
      toast.error(`Action failed: ${err}`);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg border-l border-black/[0.08] bg-white  shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.06] bg-white80  px-6 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Discrepancy Detail</h3>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', SEVERITY_BADGE[d.severity])}>
            {d.severity}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-secondary"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-6 p-6">
        {/* Identifiers */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Permit / Mine" value={d.npdes_id || d.mine_id || '—'} />
          <Field label="Source" value={d.source.toUpperCase()} />
          <Field label="Type" value={d.discrepancy_type.replace(/_/g, ' ')} />
          <Field label="Detected" value={new Date(d.detected_at).toLocaleString()} />
          {d.monitoring_period_end && (
            <Field label="Period" value={d.monitoring_period_end} />
          )}
          <Field label="Status" value={d.status} />
        </div>

        {/* Description */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-1">Description</p>
          <p className="text-sm text-text-secondary leading-relaxed">{d.description}</p>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-black/[0.08] bg-qo-nested p-4">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">Internal</p>
            <p className="text-sm text-text-primary font-mono">
              {d.internal_value || <span className="text-text-muted italic">No data</span>}
            </p>
            {d.internal_source_table && (
              <p className="mt-1 text-[10px] text-text-muted">
                Table: {d.internal_source_table}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-black/[0.08] bg-qo-nested p-4">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">External ({d.source.toUpperCase()})</p>
            <p className="text-sm text-text-primary font-mono">
              {d.external_value || <span className="text-text-muted italic">No data</span>}
            </p>
          </div>
        </div>

        {d.discrepancy_type === 'status_mismatch' && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-text-primary">Permit lifecycle decision required</p>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Internal <span className="font-mono">npdes_permits.status</span> is{' '}
              <span className="font-mono">{d.internal_value || 'active'}</span> while ECHO reports{' '}
              <span className="font-mono">{d.external_value || 'expired/terminated'}</span>. Confirm
              which record is authoritative, update internal status if needed, then dismiss with a
              documented reason — do not bulk-mark reviewed without notes.
            </p>
            {suggestedInternalStatus && (
              <p className="text-[10px] text-text-muted">
                Suggested internal mapping:{' '}
                <span className="font-mono text-text-secondary">
                  {formatNpdesPermitStatusLabel(suggestedInternalStatus)}
                </span>
                {suggestedInternalStatus === (d.internal_value ?? '').toLowerCase().trim() && (
                  <span> — label differs only; dismiss if internal is correct</span>
                )}
              </p>
            )}
            {canAlignStatus && canTriage && (
              <button
                type="button"
                onClick={() => void handleAlignStatus()}
                disabled={alignBusy || busy}
                className="flex items-center gap-1.5 rounded-lg border border-qo-accent/20 bg-qo-accent/10 px-3 py-1.5 text-xs font-medium text-qo-accent hover:bg-qo-accent/20 disabled:opacity-40"
              >
                {alignBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Set internal status to{' '}
                {suggestedInternalStatus
                  ? formatNpdesPermitStatusLabel(suggestedInternalStatus)
                  : 'ECHO value'}
              </button>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-1 block">
            Review Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            readOnly={!canTriage}
            title={!canTriage ? NO_VERIFY_TRIAGE_TITLE : undefined}
            rows={3}
            className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-qo-accent/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 read-only:cursor-not-allowed read-only:opacity-60"
            placeholder="Add review notes..."
          />
        </div>

        {/* Dismiss reason (collapsible) */}
        {showDismiss && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-1 block">
              Dismiss Reason
            </label>
            <select
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              disabled={!canTriage}
              title={!canTriage ? NO_VERIFY_TRIAGE_TITLE : undefined}
              className="w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary focus:border-qo-accent/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Select reason...</option>
              {dismissReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {dismissReason === 'Other' && (
              <input
                type="text"
                value={customDismissText}
                onChange={(e) => setCustomDismissText(e.target.value)}
                readOnly={!canTriage}
                title={!canTriage ? NO_VERIFY_TRIAGE_TITLE : undefined}
                placeholder="Describe reason..."
                className="mt-2 w-full rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-qo-accent/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 read-only:cursor-not-allowed read-only:opacity-60"
              />
            )}
          </div>
        )}

        {/* Actions */}
        {(d.status === 'pending' || d.status === 'reviewed') && (
          <div className="flex flex-wrap gap-2 pt-2">
            {d.status === 'pending' && (
              <button
                type="button"
                onClick={() => handleAction('reviewed')}
                disabled={busy || !canTriage}
                title={!canTriage ? NO_VERIFY_TRIAGE_TITLE : undefined}
                className="flex items-center gap-1.5 rounded-lg bg-qo-accent/10 border border-qo-accent/20 px-4 py-2 text-sm font-medium text-qo-accent transition-colors hover:bg-qo-accent/20 disabled:opacity-40"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Mark Reviewed
              </button>
            )}

            <button
              type="button"
              onClick={() => handleAction('escalated')}
              disabled={busy || !canTriage}
              title={!canTriage ? NO_VERIFY_TRIAGE_TITLE : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 px-4 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/20 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Escalate
            </button>

            <button
              type="button"
              onClick={() => {
                if (!canTriage) return;
                if (!showDismiss) {
                  setShowDismiss(true);
                  return;
                }
                handleAction('dismissed');
              }}
              disabled={
                !canTriage
                || busy
                || (showDismiss && !dismissReason)
                || (showDismiss && dismissReason === 'Other' && !customDismissText.trim())
              }
              title={!canTriage ? NO_VERIFY_TRIAGE_TITLE : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-black/[0.03] border border-black/[0.08] px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-black/[0.05] disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Dismiss
            </button>

            <button
              type="button"
              onClick={() => handleAction('resolved')}
              disabled={busy || !canTriage}
              title={!canTriage ? NO_VERIFY_TRIAGE_TITLE : undefined}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm font-medium text-qo-sage-text transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Resolve
            </button>
          </div>
        )}

        {/* Previous review info */}
        {(d.reviewed_at || d.reviewed_by) && (
          <div className="rounded-lg border border-black/[0.06] bg-qo-nested p-3 space-y-1">
            {d.reviewed_at && (
              <p className="text-[10px] text-text-muted">
                Reviewed {new Date(d.reviewed_at).toLocaleString()}
                {d.dismiss_reason && ` — ${d.dismiss_reason}`}
              </p>
            )}
            {d.reviewed_by && (
              <p className="text-[10px] text-text-muted">
                Reviewer: <span className="text-text-secondary font-medium">{reviewerLabel}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">{label}</p>
      <p className="text-sm text-text-primary mt-0.5">{value}</p>
    </div>
  );
}

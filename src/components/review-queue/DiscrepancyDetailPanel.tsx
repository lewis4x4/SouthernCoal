import { useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DiscrepancyRow, DiscrepancySeverity } from '@/stores/reviewQueue';

const SEVERITY_BADGE: Record<DiscrepancySeverity, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const DISMISS_REASONS = [
  'Data timing difference — external data delayed',
  'General permit — limited ECHO coverage expected',
  'False positive — values within acceptable tolerance',
  'Already addressed in corrective action',
  'Other',
];

interface Props {
  discrepancy: DiscrepancyRow;
  onClose: () => void;
  onAction: (
    id: string,
    status: 'reviewed' | 'dismissed' | 'escalated' | 'resolved',
    extra?: { review_notes?: string; dismiss_reason?: string },
  ) => Promise<string | null>;
}

export function DiscrepancyDetailPanel({ discrepancy: d, onClose, onAction }: Props) {
  const [notes, setNotes] = useState(d.review_notes || '');
  const [dismissReason, setDismissReason] = useState('');
  const [showDismiss, setShowDismiss] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAction(status: 'reviewed' | 'dismissed' | 'escalated' | 'resolved') {
    setBusy(true);
    const extra: { review_notes?: string; dismiss_reason?: string } = {};
    if (notes) extra.review_notes = notes;
    if (status === 'dismissed' && dismissReason) extra.dismiss_reason = dismissReason;
    await onAction(d.id, status, extra);
    setBusy(false);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg border-l border-white/[0.08] bg-crystal-surface/95 backdrop-blur-2xl shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-crystal-surface/80 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Discrepancy Detail</h3>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', SEVERITY_BADGE[d.severity])}>
            {d.severity}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-secondary"
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
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
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
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">External ({d.source.toUpperCase()})</p>
            <p className="text-sm text-text-primary font-mono">
              {d.external_value || <span className="text-text-muted italic">No data</span>}
            </p>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-1 block">
            Review Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
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
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary focus:border-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
            >
              <option value="">Select reason...</option>
              {DISMISS_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        {(d.status === 'pending' || d.status === 'reviewed') && (
          <div className="flex flex-wrap gap-2 pt-2">
            {d.status === 'pending' && (
              <button
                onClick={() => handleAction('reviewed')}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Mark Reviewed
              </button>
            )}

            <button
              onClick={() => handleAction('escalated')}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 px-4 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/20 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Escalate
            </button>

            <button
              onClick={() => {
                if (!showDismiss) {
                  setShowDismiss(true);
                  return;
                }
                handleAction('dismissed');
              }}
              disabled={busy || (showDismiss && !dismissReason)}
              className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-white/[0.06] disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Dismiss
            </button>

            <button
              onClick={() => handleAction('resolved')}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Resolve
            </button>
          </div>
        )}

        {/* Previous review info */}
        {d.reviewed_at && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] text-text-muted">
              Reviewed {new Date(d.reviewed_at).toLocaleString()}
              {d.dismiss_reason && ` — ${d.dismiss_reason}`}
            </p>
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

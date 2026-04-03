import { useState, useCallback } from 'react';
import { Shield, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ExemptionItem {
  id: string;
  precipitation_event_id: string;
  recurrence_interval: number;
  claimed_by_name: string;
  claimed_at: string;
  status: 'pending' | 'approved' | 'denied';
  rainfall_inches: number;
  event_date: string;
}

interface ExemptionApprovalQueueProps {
  exemptions: ExemptionItem[];
  loading: boolean;
  onApprove: (exemptionId: string) => Promise<void>;
  onDeny: (exemptionId: string, reason: string) => Promise<void>;
  currentUserId: string;
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
  denied: { label: 'Denied', color: 'bg-red-500/15 text-red-400 border-red-500/20', icon: XCircle },
} as const;

export function ExemptionApprovalQueue({
  exemptions,
  loading,
  onApprove,
  onDeny,
  currentUserId,
}: ExemptionApprovalQueueProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const handleApprove = useCallback(async (exemptionId: string) => {
    setProcessingId(exemptionId);
    try {
      await onApprove(exemptionId);
    } finally {
      setProcessingId(null);
    }
  }, [onApprove]);

  const handleDenySubmit = useCallback(async (exemptionId: string) => {
    if (!denyReason.trim()) return;
    setProcessingId(exemptionId);
    try {
      await onDeny(exemptionId, denyReason.trim());
      setDenyingId(null);
      setDenyReason('');
    } finally {
      setProcessingId(null);
    }
  }, [denyReason, onDeny]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      {/* Title */}
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-violet-400" />
        <h3 className="text-base font-semibold text-text-primary">Exemption Approval Queue</h3>
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : exemptions.length === 0 ? (
        /* Empty state */
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <Shield className="mx-auto mb-3 h-8 w-8 text-text-muted/50" />
          <p className="text-sm text-text-muted">No pending exemption claims</p>
        </div>
      ) : (
        /* Exemption cards */
        <div className="space-y-3">
          {exemptions.map((item) => {
            const config = STATUS_CONFIG[item.status];
            const StatusIcon = config.icon;
            const isOwnClaim = item.claimed_by_name === currentUserId;
            const isProcessing = processingId === item.id;
            const isDenying = denyingId === item.id;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {item.rainfall_inches}" rainfall
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-xs text-text-muted">
                        Recurrence interval: <span className="text-text-secondary">{item.recurrence_interval}-year storm</span>
                      </p>
                      <p className="text-xs text-text-muted">
                        Claimed by: <span className="text-text-secondary">{item.claimed_by_name}</span>
                        {' '}on {formatDate(item.claimed_at)}
                      </p>
                      <p className="text-xs text-text-muted">
                        Event date: <span className="text-text-secondary">{formatDate(item.event_date)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions — only for pending items */}
                  {item.status === 'pending' && (
                    <div className="flex shrink-0 items-center gap-2">
                      {isOwnClaim ? (
                        <span
                          className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-text-muted"
                          title="Cannot approve your own exemption"
                        >
                          Cannot approve your own exemption
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleApprove(item.id)}
                            disabled={isProcessing}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isProcessing ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => {
                              setDenyingId(item.id);
                              setDenyReason('');
                            }}
                            disabled={isProcessing}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Deny
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline deny reason input */}
                {isDenying && (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                      Reason for denial <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                      rows={2}
                      placeholder="Provide reason for denying this exemption claim..."
                      className="mb-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-sky-500/50"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setDenyingId(null);
                          setDenyReason('');
                        }}
                        className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-white/[0.04]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDenySubmit(item.id)}
                        disabled={!denyReason.trim() || isProcessing}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isProcessing ? 'Denying...' : 'Confirm Denial'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

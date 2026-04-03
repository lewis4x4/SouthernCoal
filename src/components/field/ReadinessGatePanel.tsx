import { useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useReadinessGate } from '@/hooks/useReadinessGate';
import type { ReadinessGateResult } from '@/hooks/useReadinessGate';

interface ReadinessGatePanelProps {
  batchId: string;
  organizationId: string;
  onOverride?: () => void;
  canOverride?: boolean;
}

export function ReadinessGatePanel({
  batchId,
  organizationId,
  onOverride,
  canOverride = false,
}: ReadinessGatePanelProps) {
  const { loading, evaluateGate, overrideGate } = useReadinessGate();
  const [result, setResult] = useState<ReadinessGateResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  async function handleCheck() {
    const gate = await evaluateGate(batchId, organizationId);
    setResult(gate);
    setChecked(true);
  }

  async function handleOverride() {
    if (!overrideReason.trim()) return;
    const { error } = await overrideGate(batchId, overrideReason);
    if (!error) {
      setResult((prev) => prev ? { ...prev, passed: true, failingBlocking: [] } : prev);
      setShowOverride(false);
      onOverride?.();
    }
  }

  if (!checked) {
    return (
      <button
        onClick={handleCheck}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-text-secondary hover:bg-white/[0.05] transition-colors"
      >
        <ShieldCheck size={16} className="text-cyan-400" />
        {loading ? 'Checking readiness…' : 'Check readiness gate'}
      </button>
    );
  }

  if (!result) return null;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3',
        result.passed
          ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
          : 'border-amber-500/20 bg-amber-500/[0.03]',
      )}
    >
      {/* Status header */}
      <div className="flex items-center gap-2">
        {result.passed ? (
          <>
            <ShieldCheck size={18} className="text-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">Readiness gate passed</span>
          </>
        ) : (
          <>
            <ShieldX size={18} className="text-amber-400" />
            <span className="text-sm font-medium text-amber-300">
              Readiness gate blocked — {result.failingBlocking.length} requirement{result.failingBlocking.length !== 1 ? 's' : ''} failing
            </span>
          </>
        )}
      </div>

      {/* Failing blocking requirements */}
      {result.failingBlocking.length > 0 && (
        <div className="space-y-1.5">
          {result.failingBlocking.map((req) => (
            <div
              key={req.id}
              className="flex items-start gap-2 rounded-lg border border-red-500/15 bg-red-500/[0.03] px-3 py-2"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
              <div>
                <p className="text-xs font-medium text-text-primary">{req.name}</p>
                {req.description && (
                  <p className="text-[11px] text-text-muted">{req.description}</p>
                )}
                <span className="inline-block mt-1 rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-400">
                  Blocking
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failing non-blocking (warnings) */}
      {result.failingNonBlocking.length > 0 && (
        <div className="space-y-1.5">
          {result.failingNonBlocking.map((req) => (
            <div
              key={req.id}
              className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] px-3 py-2"
            >
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="text-xs font-medium text-text-primary">{req.name}</p>
                <span className="inline-block mt-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400">
                  Warning
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Override */}
      {!result.passed && canOverride && (
        <div>
          {!showOverride ? (
            <button
              onClick={() => setShowOverride(true)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors underline underline-offset-2"
            >
              Override with reason
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for override (required)…"
                rows={2}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleOverride}
                  disabled={!overrideReason.trim() || loading}
                  className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                >
                  Confirm Override
                </button>
                <button
                  onClick={() => setShowOverride(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

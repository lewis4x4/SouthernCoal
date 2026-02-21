import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, MapPin, FileText, History, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import type { FtsViolation } from '@/types/fts';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATE_LABELS: Record<string, string> = {
  KY: 'Kentucky',
  WV: 'West Virginia',
  VA: 'Virginia',
  TN: 'Tennessee',
  AL: 'Alabama',
};

const STATE_COLORS: Record<string, string> = {
  KY: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
  WV: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  VA: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
  TN: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
  AL: 'bg-orange-500/15 border-orange-500/30 text-orange-400',
};

const formatDollars = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

interface Props {
  violation: FtsViolation | null;
  onClose: () => void;
}

interface HistoryRow {
  id: string;
  monitoring_year: number;
  monitoring_month: number;
  penalty_category: number;
  penalty_amount: number;
}

interface PermitSummary {
  totalPenalties: number;
  violationCount: number;
  outfalls: number;
  cat1Count: number;
  cat2Count: number;
}

export function FtsViolationDetail({ violation, onClose }: Props) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [permitSummary, setPermitSummary] = useState<PermitSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!violation) {
      setHistory([]);
      setPermitSummary(null);
      return;
    }

    setLoading(true);

    // Fetch same-outfall history
    const fetchHistory = supabase
      .from('fts_violations')
      .select('id, monitoring_year, monitoring_month, penalty_category, penalty_amount')
      .eq('dnr_number', violation.dnr_number)
      .eq('outfall_number', violation.outfall_number)
      .eq('state', violation.state)
      .neq('id', violation.id)
      .order('monitoring_year', { ascending: false })
      .order('monitoring_month', { ascending: false })
      .limit(20);

    // Fetch permit-level summary
    const fetchPermit = supabase
      .from('fts_violations')
      .select('outfall_number, penalty_category, penalty_amount')
      .eq('dnr_number', violation.dnr_number)
      .eq('state', violation.state)
      .limit(1000);

    Promise.all([fetchHistory, fetchPermit]).then(([histRes, permitRes]) => {
      if (!histRes.error && histRes.data) {
        setHistory(histRes.data as HistoryRow[]);
      }

      if (!permitRes.error && permitRes.data) {
        const rows = permitRes.data;
        const outfalls = new Set(rows.map((r) => r.outfall_number));
        setPermitSummary({
          totalPenalties: rows.reduce((s, r) => s + r.penalty_amount, 0),
          violationCount: rows.length,
          outfalls: outfalls.size,
          cat1Count: rows.filter((r) => r.penalty_category === 1).length,
          cat2Count: rows.filter((r) => r.penalty_category === 2).length,
        });
      }

      setLoading(false);
    });
  }, [violation]);

  return (
    <AnimatePresence>
      {violation && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-full max-w-md z-[91] overflow-y-auto bg-crystal-surface border-l border-white/[0.08] shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-crystal-surface/95 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border',
                    STATE_COLORS[violation.state] ?? 'bg-white/10 border-white/20 text-text-secondary',
                  )}
                >
                  {violation.state}
                </span>
                <span className="text-sm font-semibold text-text-primary font-mono">
                  {violation.dnr_number}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                aria-label="Close drawer"
              >
                <X size={18} className="text-text-muted" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Section 1: Monitoring Period */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={14} className="text-text-muted" />
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                    Monitoring Period
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[10px] text-text-muted mb-1">Period</p>
                    <p className="text-sm font-medium text-text-primary font-mono">
                      {MONTH_NAMES[violation.monitoring_month]} {violation.monitoring_year}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[10px] text-text-muted mb-1">Quarter</p>
                    <p className="text-sm font-medium text-text-primary">
                      Q{violation.monitoring_quarter} {violation.monitoring_year}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[10px] text-text-muted mb-1">State</p>
                    <p className="text-sm font-medium text-text-primary">
                      {STATE_LABELS[violation.state] ?? violation.state}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[10px] text-text-muted mb-1">Outfall</p>
                    <p className="text-sm font-medium text-text-primary font-mono">
                      {violation.outfall_number}
                    </p>
                  </div>
                </div>
              </section>

              {/* Section 2: Penalty */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={14} className="text-text-muted" />
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                    Penalty Details
                  </h4>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                        violation.penalty_category === 1
                          ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-400',
                      )}
                    >
                      Category {violation.penalty_category}
                    </span>
                    <span className="text-lg font-semibold text-text-primary font-mono">
                      {formatDollars(violation.penalty_amount)}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted">
                    {violation.penalty_category === 1
                      ? 'First offense — $2,000 per violation'
                      : 'Repeat offense — $3,000 per violation'}
                  </p>
                </div>
              </section>

              {/* Section 3: Notes (conditional) */}
              {violation.notes && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={14} className="text-text-muted" />
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                      Notes
                    </h4>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {violation.notes}
                    </p>
                  </div>
                </section>
              )}

              {/* Section 4: Same-Outfall History */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <History size={14} className="text-text-muted" />
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                    Outfall History
                  </h4>
                  <span className="text-[10px] text-text-muted font-mono">
                    {violation.outfall_number} @ {violation.dnr_number}
                  </span>
                </div>
                {loading ? (
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-xs text-text-muted animate-pulse">Loading history...</p>
                  </div>
                ) : history.length === 0 ? (
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-xs text-text-muted">No other violations for this outfall</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/[0.08] overflow-hidden">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-text-secondary font-mono">
                            {MONTH_NAMES[h.monitoring_month]} {h.monitoring_year}
                          </span>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold border',
                              h.penalty_category === 1
                                ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-400',
                            )}
                          >
                            Cat {h.penalty_category}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-text-primary">
                          {formatDollars(h.penalty_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Section 5: Permit Summary */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 size={14} className="text-text-muted" />
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                    Permit Summary
                  </h4>
                  <span className="text-[10px] text-text-muted font-mono">
                    {violation.dnr_number}
                  </span>
                </div>
                {loading ? (
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-xs text-text-muted animate-pulse">Loading summary...</p>
                  </div>
                ) : permitSummary ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                      <p className="text-lg font-semibold text-text-primary font-mono">
                        {formatDollars(permitSummary.totalPenalties)}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">Total Penalties</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                      <p className="text-lg font-semibold text-text-primary">
                        {permitSummary.violationCount}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">Violations</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                      <p className="text-lg font-semibold text-text-primary">
                        {permitSummary.outfalls}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">Outfalls</p>
                    </div>
                    <div className="col-span-3 flex gap-2">
                      <span className="inline-flex items-center rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-[10px] font-mono text-yellow-400">
                        Cat 1: {permitSummary.cat1Count}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-mono text-red-400">
                        Cat 2: {permitSummary.cat2Count}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-xs text-text-muted">No permit data available</p>
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, TrendingUp, TrendingDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDollars } from '@/lib/format';
import { MONTH_ABBR } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { FtsMonthlyTotal } from '@/types/fts';
import type { PenaltyTier } from '@/types/obligations';

interface ObligationTier {
  count: number;
  amount: number;
}

const STATE_BAR_COLORS: Record<string, string> = {
  WV: 'bg-emerald-500',
  KY: 'bg-blue-500',
  VA: 'bg-purple-500',
  AL: 'bg-orange-500',
  TN: 'bg-amber-500',
};

export function FinancialRiskCard() {
  const [monthlyTotals, setMonthlyTotals] = useState<FtsMonthlyTotal[]>([]);
  const [obligations, setObligations] = useState<{ tier1: ObligationTier; tier2: ObligationTier; tier3: ObligationTier; total: number }>({
    tier1: { count: 0, amount: 0 },
    tier2: { count: 0, amount: 0 },
    tier3: { count: 0, amount: 0 },
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      const [ftsRes, obligRes] = await Promise.all([
        supabase
          .from('fts_monthly_totals')
          .select('*')
          .order('monitoring_year', { ascending: true })
          .order('monitoring_month', { ascending: true })
          .limit(1000)
          .returns<FtsMonthlyTotal[]>(),
        supabase
          .from('consent_decree_obligations')
          .select('id, penalty_tier, accrued_penalty')
          .in('status', ['pending', 'in_progress', 'overdue']),
      ]);

      if (cancelled) return;

      if (ftsRes.data) setMonthlyTotals(ftsRes.data);

      if (obligRes.data) {
        const tier1: ObligationTier = { count: 0, amount: 0 };
        const tier2: ObligationTier = { count: 0, amount: 0 };
        const tier3: ObligationTier = { count: 0, amount: 0 };

        for (const row of obligRes.data) {
          const tier = (row.penalty_tier as PenaltyTier) ?? 'none';
          const accrued = (row.accrued_penalty as number) ?? 0;
          if (tier === 'tier_1') { tier1.count++; tier1.amount += accrued; }
          else if (tier === 'tier_2') { tier2.count++; tier2.amount += accrued; }
          else if (tier === 'tier_3') { tier3.count++; tier3.amount += accrued; }
        }

        setObligations({
          tier1,
          tier2,
          tier3,
          total: tier1.amount + tier2.amount + tier3.amount,
        });
      }

      setLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Compute FTS KPIs from monthly totals
  const ftsKpis = useMemo(() => {
    if (monthlyTotals.length === 0) return null;

    // Determine effective year (latest year in data)
    const years = [...new Set(monthlyTotals.map((t) => t.monitoring_year))].sort((a, b) => b - a);
    const effectiveYear = years[0]!;

    // YTD (exclude TN — always $0)
    const ytdRows = monthlyTotals.filter(
      (t) => t.monitoring_year === effectiveYear && t.state !== 'TN',
    );
    const totalYtd = ytdRows.reduce((s, t) => s + t.total_penalties, 0);

    // Current quarter
    const quarters = [...new Set(ytdRows.map((t) => t.monitoring_quarter))].sort((a, b) => b - a);
    const currentQ = quarters[0] ?? 1;
    const qRows = ytdRows.filter((t) => t.monitoring_quarter === currentQ);
    const currentQuarterAmt = qRows.reduce((s, t) => s + t.total_penalties, 0);

    // State breakdown (YTD)
    const stateMap = new Map<string, number>();
    for (const t of ytdRows) {
      stateMap.set(t.state, (stateMap.get(t.state) ?? 0) + t.total_penalties);
    }
    const stateBreakdown = [...stateMap.entries()]
      .map(([state, amount]) => ({
        state,
        amount,
        percentage: totalYtd > 0 ? (amount / totalYtd) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // MoM change
    const monthKeys = [...new Set(
      monthlyTotals
        .filter((t) => t.state !== 'TN')
        .map((t) => `${t.monitoring_year}-${String(t.monitoring_month).padStart(2, '0')}`),
    )].sort().reverse();

    let momChange: { percentage: number; priorMonth: string } | null = null;
    if (monthKeys.length >= 2) {
      const [lYear, lMonth] = monthKeys[0]!.split('-').map(Number) as [number, number];
      const [pYear, pMonth] = monthKeys[1]!.split('-').map(Number) as [number, number];
      const latestTotal = monthlyTotals
        .filter((t) => t.monitoring_year === lYear && t.monitoring_month === lMonth && t.state !== 'TN')
        .reduce((s, t) => s + t.total_penalties, 0);
      const priorTotal = monthlyTotals
        .filter((t) => t.monitoring_year === pYear && t.monitoring_month === pMonth && t.state !== 'TN')
        .reduce((s, t) => s + t.total_penalties, 0);
      if (priorTotal > 0) {
        momChange = {
          percentage: ((latestTotal - priorTotal) / priorTotal) * 100,
          priorMonth: MONTH_ABBR[pMonth] ?? '',
        };
      }
    }

    return { totalYtd, effectiveYear, currentQuarterAmt, currentQ, stateBreakdown, momChange };
  }, [monthlyTotals]);

  const hasObligationRisk = obligations.total > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-crystal-surface/50 to-crystal-surface/20 p-6 backdrop-blur-xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-secondary">Financial Risk</h3>
          <p className="mt-0.5 text-xs text-text-muted">Consent Decree Penalties</p>
        </div>
        <div className="rounded-lg bg-white/[0.05] p-2">
          <DollarSign className="h-5 w-5 text-red-400" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
          <div className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
          <div className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />
        </div>
      ) : ftsKpis ? (
        <div className="space-y-5">
          {/* YTD Total — hero number */}
          <div>
            <div className="text-4xl font-bold text-text-primary">
              {formatDollars(ftsKpis.totalYtd)}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-text-muted">
                YTD {ftsKpis.effectiveYear} Penalties
              </span>
              {ftsKpis.momChange && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    ftsKpis.momChange.percentage > 0
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-emerald-500/10 text-emerald-400',
                  )}
                >
                  {ftsKpis.momChange.percentage > 0 ? (
                    <TrendingUp size={10} />
                  ) : (
                    <TrendingDown size={10} />
                  )}
                  {Math.abs(ftsKpis.momChange.percentage).toFixed(0)}% vs {ftsKpis.momChange.priorMonth}
                </span>
              )}
            </div>
          </div>

          {/* Current Quarter */}
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">
                Q{ftsKpis.currentQ} {ftsKpis.effectiveYear}
              </span>
              <span className="text-lg font-bold text-text-primary font-mono">
                {formatDollars(ftsKpis.currentQuarterAmt)}
              </span>
            </div>
          </div>

          {/* State Breakdown */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              By State
            </p>
            {ftsKpis.stateBreakdown.map((s) => (
              <div key={s.state} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{s.state}</span>
                  <span className="font-mono text-text-primary">{formatDollars(s.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06]">
                  <div
                    className={cn('h-full rounded-full transition-all', STATE_BAR_COLORS[s.state] ?? 'bg-white/30')}
                    style={{ width: `${Math.max(s.percentage, 1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Obligation Risk (if any) */}
          {hasObligationRisk && (
            <div className="rounded-lg border border-orange-500/20 bg-orange-950/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={12} className="text-orange-400" />
                <span className="text-xs font-semibold text-orange-400">At-Risk Obligations</span>
              </div>
              <p className="text-xs text-text-muted">
                {obligations.tier1.count + obligations.tier2.count + obligations.tier3.count} obligations accruing{' '}
                {formatDollars(obligations.total)} in penalties
              </p>
            </div>
          )}

          {/* Link to FTS Page */}
          <Link
            to="/compliance/fts"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            View Full Penalty Breakdown
            <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        /* No FTS data — show original consent decree view */
        <div className="space-y-4">
          <div className="text-4xl font-bold text-text-primary">
            {formatDollars(obligations.total)}
          </div>
          <div className="mt-1 text-sm text-text-muted">Total Accrued Penalties</div>
          <div className="space-y-2.5">
            <TierRow label="Tier 1 (1–14 days)" color="yellow" tier={obligations.tier1} />
            <TierRow label="Tier 2 (15–30 days)" color="orange" tier={obligations.tier2} />
            <TierRow label="Tier 3 (31+ days)" color="red" tier={obligations.tier3} />
          </div>
        </div>
      )}
    </div>
  );
}

function TierRow({
  label,
  color,
  tier,
}: {
  label: string;
  color: 'yellow' | 'orange' | 'red';
  tier: ObligationTier;
}) {
  const colors = {
    yellow: 'border-yellow-500/20 bg-yellow-950/10 text-yellow-400',
    orange: 'border-orange-500/20 bg-orange-950/10 text-orange-400',
    red: 'border-red-500/20 bg-red-950/10 text-red-400',
  };

  return (
    <div className={cn('flex items-center justify-between rounded-lg border p-3', colors[color])}>
      <div>
        <div className="text-xs">{label}</div>
        <div className="mt-0.5 text-sm text-slate-300">
          {tier.count} obligation{tier.count !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="text-lg font-bold">{formatDollars(tier.amount)}</div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { DollarSign, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import type { PenaltyTier } from '@/types/obligations';

interface TierData {
  count: number;
  amount: number;
}

interface PenaltyData {
  total: number;
  tier1: TierData;
  tier2: TierData;
  tier3: TierData;
  escalatingIn48h: number;
}

const EMPTY: PenaltyData = {
  total: 0,
  tier1: { count: 0, amount: 0 },
  tier2: { count: 0, amount: 0 },
  tier3: { count: 0, amount: 0 },
  escalatingIn48h: 0,
};

export function FinancialRiskCard() {
  const [data, setData] = useState<PenaltyData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      const { data: rows, error } = await supabase
        .from('consent_decree_obligations')
        .select('id, next_due_date, status, days_at_risk, penalty_tier, accrued_penalty')
        .in('status', ['pending', 'in_progress', 'overdue']);

      if (cancelled) return;

      if (error || !rows) {
        console.error('[dashboard] Failed to fetch obligations:', error?.message);
        setLoading(false);
        return;
      }

      const tier1: TierData = { count: 0, amount: 0 };
      const tier2: TierData = { count: 0, amount: 0 };
      const tier3: TierData = { count: 0, amount: 0 };
      let escalating = 0;
      const now = new Date();

      for (const row of rows) {
        const penaltyTier = (row.penalty_tier as PenaltyTier) ?? 'none';
        const accrued = (row.accrued_penalty as number) ?? 0;

        if (penaltyTier === 'tier_1') {
          tier1.count++;
          tier1.amount += accrued;
        } else if (penaltyTier === 'tier_2') {
          tier2.count++;
          tier2.amount += accrued;
        } else if (penaltyTier === 'tier_3') {
          tier3.count++;
          tier3.amount += accrued;
        } else if (row.next_due_date) {
          // Not yet overdue — check if escalating within 48h
          const due = new Date(row.next_due_date as string);
          const daysUntil = Math.floor((due.getTime() - now.getTime()) / 86_400_000);
          if (daysUntil >= -2 && daysUntil <= 0) escalating++;
        }
      }

      setData({
        total: tier1.amount + tier2.amount + tier3.amount,
        tier1,
        tier2,
        tier3,
        escalatingIn48h: escalating,
      });
      setLoading(false);
    }

    fetch();
    return () => { cancelled = true; };
  }, []);

  const riskLevel =
    data.tier3.count > 0
      ? 'critical'
      : data.tier2.count > 0
        ? 'high'
        : data.tier1.count > 0
          ? 'medium'
          : 'low';

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-6 transition-all',
        riskLevel === 'critical' && 'border-red-500/50 bg-red-950/20',
        riskLevel === 'high' && 'border-orange-500/50 bg-orange-950/20',
        riskLevel === 'medium' && 'border-yellow-500/50 bg-yellow-950/20',
        riskLevel === 'low' && 'border-emerald-500/30 bg-emerald-950/10',
      )}
    >
      {riskLevel === 'critical' && (
        <div className="absolute inset-0 animate-pulse rounded-2xl border-2 border-red-500/30" />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-secondary">Financial Risk</h3>
          <p className="mt-0.5 text-xs text-text-muted">Consent Decree Penalties</p>
        </div>
        <div className="rounded-lg bg-white/[0.05] p-2">
          <DollarSign className="h-5 w-5 text-red-400" />
        </div>
      </div>

      {/* Total */}
      <div className="mb-6">
        <div className={cn('text-4xl font-bold', loading && 'animate-pulse text-text-muted')}>
          {loading ? '...' : `$${data.total.toLocaleString()}`}
        </div>
        <div className="mt-1 text-sm text-text-muted">Total Accrued Penalties</div>
      </div>

      {/* Tier Breakdown */}
      <div className="space-y-2.5">
        <TierRow label="Tier 1 (1–14 days)" color="yellow" tier={data.tier1} loading={loading} />
        <TierRow label="Tier 2 (15–30 days)" color="orange" tier={data.tier2} loading={loading} />
        <TierRow label="Tier 3 (31+ days)" color="red" tier={data.tier3} loading={loading} />
      </div>

      {/* Escalation Warning */}
      {data.escalatingIn48h > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-950/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span className="text-xs text-red-400">
            {data.escalatingIn48h} obligation{data.escalatingIn48h > 1 ? 's' : ''} escalating
            within 48h
          </span>
        </div>
      )}
    </div>
  );
}

function TierRow({
  label,
  color,
  tier,
  loading,
}: {
  label: string;
  color: 'yellow' | 'orange' | 'red';
  tier: TierData;
  loading: boolean;
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
          {loading ? '...' : `${tier.count} obligation${tier.count !== 1 ? 's' : ''}`}
        </div>
      </div>
      <div className="text-lg font-bold">{loading ? '...' : `$${tier.amount.toLocaleString()}`}</div>
    </div>
  );
}

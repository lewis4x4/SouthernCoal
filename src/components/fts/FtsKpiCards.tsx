import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  MapPin,
  AlertTriangle,
  FileWarning,
  Repeat,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import type { FtsKpis } from '@/types/fts';

const formatDollars = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

interface Props {
  kpis: FtsKpis;
}

export function FtsKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {/* Total Penalties YTD */}
      {(() => {
        const isHighRisk = kpis.totalYtd > 1_000_000;
        return (
          <SpotlightCard
            spotlightColor={isHighRisk ? 'rgba(239, 68, 68, 0.15)' : 'rgba(148, 163, 184, 0.06)'}
            className={cn('p-5', isHighRisk ? 'border-red-500/30' : 'border-white/10')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
                  Total YTD
                </p>
                <p className={cn('text-2xl font-semibold mt-1 font-mono', isHighRisk ? 'text-red-400' : 'text-white')}>
                  {formatDollars(kpis.totalYtd)}
                </p>
                <p className="text-[10px] text-text-muted mt-1">
                  Year to Date · {new Date().getFullYear()}
                </p>
              </div>
              <DollarSign size={20} className={isHighRisk ? 'text-red-400' : 'text-slate-400'} />
            </div>
          </SpotlightCard>
        );
      })()}

      {/* Current Quarter */}
      <SpotlightCard spotlightColor="rgba(251, 146, 60, 0.08)" className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Q{kpis.currentQuarterNum} {new Date().getFullYear()}
            </p>
            <p className="text-2xl font-semibold text-text-primary mt-1 font-mono">
              {formatDollars(kpis.currentQuarter)}
            </p>
            {kpis.momChange && (
              <div className="flex items-center gap-1.5 mt-1">
                {kpis.momChange.percentage > 0 ? (
                  <>
                    <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400 font-mono">
                      +{kpis.momChange.percentage.toFixed(1)}%
                    </span>
                  </>
                ) : kpis.momChange.percentage < 0 ? (
                  <>
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-mono">
                      {kpis.momChange.percentage.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">→ No change</span>
                )}
                <span className="text-xs text-slate-500">vs. {kpis.momChange.priorMonthName}</span>
              </div>
            )}
          </div>
          <TrendingUp size={20} className="text-orange-400" />
        </div>
      </SpotlightCard>

      {/* Worst State */}
      <SpotlightCard spotlightColor="rgba(168, 85, 247, 0.08)" className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Worst State
            </p>
            {kpis.worstState ? (
              <>
                <p className="text-2xl font-semibold text-text-primary mt-1">
                  {kpis.worstState.state}
                </p>
                <p className="text-xs text-text-muted mt-1 font-mono">
                  {formatDollars(kpis.worstState.amount)}{' '}
                  <span className="text-text-muted/60">
                    ({Math.round(kpis.worstState.percentage)}%)
                  </span>
                </p>
              </>
            ) : (
              <p className="text-lg text-text-muted mt-1">—</p>
            )}
          </div>
          <MapPin size={20} className="text-purple-400" />
        </div>
      </SpotlightCard>

      {/* Violation Count */}
      <SpotlightCard spotlightColor="rgba(59, 130, 246, 0.08)" className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Violations YTD
            </p>
            <AnimatedCounter
              value={kpis.violationCount}
              className="text-2xl font-semibold text-text-primary mt-1 block"
            />
            <div className="flex gap-2 mt-1">
              <span className="inline-flex items-center rounded-full bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 text-[10px] font-mono text-yellow-400">
                Cat 1: {kpis.cat1Count}
              </span>
              <span className="inline-flex items-center rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[10px] font-mono text-red-400">
                Cat 2: {kpis.cat2Count}
              </span>
            </div>
          </div>
          <AlertTriangle size={20} className="text-blue-400" />
        </div>
      </SpotlightCard>

      {/* Most Penalized Permit */}
      <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.08)" className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Top Permit
            </p>
            {kpis.mostPenalizedPermit ? (
              <>
                <p className="text-sm font-semibold text-text-primary mt-1 truncate font-mono">
                  {kpis.mostPenalizedPermit.dnr}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {kpis.mostPenalizedPermit.state} · {kpis.mostPenalizedPermit.count} violations ·{' '}
                  {formatDollars(kpis.mostPenalizedPermit.amount)}
                </p>
              </>
            ) : (
              <p className="text-lg text-text-muted mt-1">—</p>
            )}
          </div>
          <FileWarning size={20} className="text-cyan-400 shrink-0" />
        </div>
      </SpotlightCard>

      {/* Repeat Offender Rate */}
      <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.08)" className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Repeat Rate
            </p>
            <p className="text-2xl font-semibold text-text-primary mt-1 font-mono">
              {Math.round(kpis.repeatOffenderRate)}%
            </p>
            <p className="text-[10px] text-text-muted mt-1">Category 2 / Total</p>
          </div>
          <Repeat size={20} className="text-emerald-400" />
        </div>
      </SpotlightCard>
    </div>
  );
}

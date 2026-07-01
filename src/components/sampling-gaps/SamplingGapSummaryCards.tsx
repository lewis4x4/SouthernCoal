import { cn } from '@/lib/cn';
import { GAP_KIND_LABELS } from '@/lib/samplingGapSeverity';
import type { SamplingGapKind, SamplingGapSeverity } from '@/lib/samplingGapSeverity';

const SEVERITY_COLORS: Record<SamplingGapSeverity, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const KIND_COLORS: Record<SamplingGapKind, string> = {
  missed: 'bg-red-500/15 text-red-300 border-red-500/25',
  at_risk: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
};

interface Props {
  missed: number;
  atRisk: number;
  pending: number;
  critical: number;
  activeKind?: SamplingGapKind | null;
  onKindClick?: (kind: SamplingGapKind) => void;
}

export function SamplingGapSummaryCards({
  missed,
  atRisk,
  pending,
  critical,
  activeKind,
  onKindClick,
}: Props) {
  const cards: { key: SamplingGapKind | 'pending' | 'critical'; label: string; value: number; color: string }[] = [
    { key: 'missed', label: 'Missed', value: missed, color: KIND_COLORS.missed },
    { key: 'at_risk', label: 'At-Risk', value: atRisk, color: KIND_COLORS.at_risk },
    { key: 'pending', label: 'Pending Triage', value: pending, color: 'bg-white/[0.05] text-text-secondary border-white/[0.08]' },
    { key: 'critical', label: 'Critical Severity', value: critical, color: SEVERITY_COLORS.critical },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const isKind = card.key === 'missed' || card.key === 'at_risk';
        const isActive = isKind && activeKind === card.key;

        return (
          <button
            key={card.key}
            type="button"
            disabled={!isKind || !onKindClick}
            onClick={() => {
              if (isKind && onKindClick) onKindClick(card.key as SamplingGapKind);
            }}
            className={cn(
              'rounded-xl border p-4 text-left transition-colors',
              card.color,
              isKind && onKindClick && 'hover:brightness-110 cursor-pointer',
              isActive && 'ring-1 ring-white/30',
              !isKind && 'cursor-default',
            )}
          >
            <p className="text-[11px] uppercase tracking-wide opacity-80">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
          </button>
        );
      })}
    </div>
  );
}

export function GapKindBadge({ kind }: { kind: SamplingGapKind }) {
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase', KIND_COLORS[kind])}>
      {GAP_KIND_LABELS[kind]}
    </span>
  );
}

export function GapSeverityBadge({ severity }: { severity: SamplingGapSeverity }) {
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase', SEVERITY_COLORS[severity])}>
      {severity}
    </span>
  );
}

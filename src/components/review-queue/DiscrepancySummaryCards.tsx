import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { AlertTriangle, AlertCircle, Info, ChevronDown } from 'lucide-react';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

const CARDS = [
  {
    key: 'critical' as const,
    label: 'Critical',
    icon: AlertTriangle,
    spotlightColor: 'rgba(239, 68, 68, 0.08)',
    valueColor: 'text-red-400',
  },
  {
    key: 'high' as const,
    label: 'High',
    icon: AlertCircle,
    spotlightColor: 'rgba(249, 115, 22, 0.08)',
    valueColor: 'text-orange-400',
  },
  {
    key: 'medium' as const,
    label: 'Medium',
    icon: Info,
    spotlightColor: 'rgba(234, 179, 8, 0.08)',
    valueColor: 'text-amber-400',
  },
  {
    key: 'low' as const,
    label: 'Low',
    icon: ChevronDown,
    spotlightColor: 'rgba(59, 130, 246, 0.08)',
    valueColor: 'text-blue-400',
  },
];

interface Props {
  counts: SeverityCounts;
  loading?: boolean;
}

export function DiscrepancySummaryCards({ counts, loading }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, spotlightColor, valueColor }) => (
        <SpotlightCard key={key} spotlightColor={spotlightColor} className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
                {label}
              </p>
              {loading ? (
                <div className="mt-1 h-8 w-16 animate-pulse rounded bg-white/[0.06]" />
              ) : (
                <AnimatedCounter
                  value={counts[key]}
                  className={`text-2xl font-semibold ${valueColor} mt-1 block`}
                />
              )}
            </div>
            <Icon size={20} className="text-text-muted" />
          </div>
        </SpotlightCard>
      ))}
    </div>
  );
}

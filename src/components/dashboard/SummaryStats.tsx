import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { useComplianceMatrix } from '@/hooks/useComplianceMatrix';
import { FileText, GitBranch, Ruler, AlertCircle } from 'lucide-react';

const CARDS = [
  {
    key: 'totalPermits' as const,
    label: 'Total Permits',
    icon: FileText,
    spotlightColor: 'rgba(59, 130, 246, 0.08)',
  },
  {
    key: 'totalOutfalls' as const,
    label: 'Total Outfalls',
    icon: GitBranch,
    spotlightColor: 'rgba(6, 182, 212, 0.08)',
  },
  {
    key: 'totalLimits' as const,
    label: 'Total Limits',
    icon: Ruler,
    spotlightColor: 'rgba(16, 185, 129, 0.08)',
  },
  {
    key: 'awaitingReview' as const,
    label: 'Awaiting Review',
    icon: AlertCircle,
    spotlightColor: 'rgba(139, 92, 246, 0.08)',
  },
];

/**
 * Four SpotlightCard stat cards at the top of the dashboard.
 * Animated counters transition from old → new values.
 */
export function SummaryStats() {
  const { stats } = useComplianceMatrix();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, spotlightColor }) => (
        <SpotlightCard key={key} spotlightColor={spotlightColor} className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
                {label}
              </p>
              <AnimatedCounter
                value={stats[key]}
                className="text-2xl font-semibold text-text-primary mt-1 block"
              />
            </div>
            <Icon size={20} className="text-text-muted" />
          </div>
        </SpotlightCard>
      ))}
    </div>
  );
}

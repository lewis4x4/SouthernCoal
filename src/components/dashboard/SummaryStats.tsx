import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { useComplianceMatrix } from '@/hooks/useComplianceMatrix';
import { useUploadDashboardDomainStats } from '@/hooks/useUploadDashboardDomainStats';
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

const DOMAIN_KEYS = ['totalPermits', 'totalOutfalls', 'totalLimits'] as const;

/**
 * Four SpotlightCard stat cards at the top of the dashboard.
 * Animated counters transition from old → new values.
 */
export function SummaryStats() {
  const { stats: queueStats } = useComplianceMatrix();
  const domainStats = useUploadDashboardDomainStats();

  const stats = {
    totalPermits: domainStats.totalPermits,
    totalOutfalls: domainStats.totalOutfalls,
    totalLimits: domainStats.totalLimits,
    awaitingReview: queueStats.awaitingReview,
  };

  function displayValue(key: (typeof CARDS)[number]['key']): number | null {
    if (key === 'awaitingReview') return stats[key];
    if (domainStats.loading && stats[key] === 0) return null;
    if (domainStats.error) return null;
    return stats[key];
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, spotlightColor }) => {
        const value = displayValue(key);
        const isDomainCard = (DOMAIN_KEYS as readonly string[]).includes(key);
        const showError = isDomainCard && domainStats.error;

        return (
          <SpotlightCard key={key} spotlightColor={spotlightColor} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
                  {label}
                </p>
                {showError ? (
                  <p className="text-sm text-status-failed mt-1" title={domainStats.error}>
                    Unavailable
                  </p>
                ) : value === null ? (
                  <span className="text-2xl font-semibold text-text-muted mt-1 block animate-pulse">
                    —
                  </span>
                ) : (
                  <AnimatedCounter
                    value={value}
                    className="text-2xl font-semibold text-text-primary mt-1 block"
                  />
                )}
              </div>
              <Icon size={20} className="text-text-muted" />
            </div>
          </SpotlightCard>
        );
      })}
    </div>
  );
}

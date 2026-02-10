import { FinancialRiskCard } from '@/components/executive/FinancialRiskCard';
import { OperationalStatusCard } from '@/components/executive/OperationalStatusCard';
import { ActionQueueCard } from '@/components/executive/ActionQueueCard';
import { QuickAccessTiles } from '@/components/executive/QuickAccessTiles';

export function Dashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Executive Dashboard
        </h1>
        <p className="text-sm text-text-secondary">
          Real-time compliance posture across all Southern Coal facilities
        </p>
      </div>

      {/* Three Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FinancialRiskCard />
        <OperationalStatusCard />
        <ActionQueueCard />
      </div>

      {/* Quick Access Tiles */}
      <QuickAccessTiles />
    </div>
  );
}

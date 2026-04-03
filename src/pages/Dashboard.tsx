import { usePermissions } from '@/hooks/usePermissions';
import { FinancialRiskCard } from '@/components/executive/FinancialRiskCard';
import { OperationalStatusCard } from '@/components/executive/OperationalStatusCard';
import { ActionQueueCard } from '@/components/executive/ActionQueueCard';
import { QuickAccessTiles } from '@/components/executive/QuickAccessTiles';
import { RoleDashboardHeader } from '@/components/dashboard/RoleDashboardHeader';
import { TodaysRouteSummaryCard } from '@/components/dashboard/TodaysRouteSummaryCard';
import { RecentVisitsCard } from '@/components/dashboard/RecentVisitsCard';
import { OutboundQueueCard } from '@/components/dashboard/OutboundQueueCard';
import { CorrectiveActionSummaryCard } from '@/components/dashboard/CorrectiveActionSummaryCard';
import { UploadQueueSummaryCard } from '@/components/dashboard/UploadQueueSummaryCard';
import { RainEventAlertCard } from '@/components/weather/RainEventAlertCard';

function FieldSamplerDashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      <RoleDashboardHeader
        title="Field Sampler Dashboard"
        subtitle="Here's your day — today's route, recent visits, and sync status"
      />
      <TodaysRouteSummaryCard scope="mine" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentVisitsCard />
        <OutboundQueueCard />
      </div>
      <QuickAccessTiles />
    </div>
  );
}

function LabTechDashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      <RoleDashboardHeader
        title="Lab Dashboard"
        subtitle="Upload status, system health, and corrective actions"
      />
      <UploadQueueSummaryCard />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OperationalStatusCard />
        <CorrectiveActionSummaryCard />
      </div>
      <QuickAccessTiles />
    </div>
  );
}

function SafetyManagerDashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      <RoleDashboardHeader
        title="Safety Dashboard"
        subtitle="Corrective actions overview and system health"
      />
      <CorrectiveActionSummaryCard />
      <OperationalStatusCard />
      <QuickAccessTiles />
    </div>
  );
}

function SiteManagerDashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      <RoleDashboardHeader
        title="Site Manager Dashboard"
        subtitle="Field activity across your sites, corrective actions, and compliance status"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <TodaysRouteSummaryCard scope="org" />
        <CorrectiveActionSummaryCard />
        <RainEventAlertCard />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OperationalStatusCard />
        <ActionQueueCard />
      </div>
      <QuickAccessTiles />
    </div>
  );
}

function EnvManagerDashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      <RoleDashboardHeader
        title="Compliance Dashboard"
        subtitle="Financial risk, corrective actions, field operations, and obligations"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FinancialRiskCard />
        <CorrectiveActionSummaryCard />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <OperationalStatusCard />
        <ActionQueueCard />
        <RainEventAlertCard />
      </div>
      <TodaysRouteSummaryCard scope="org" />
      <QuickAccessTiles />
    </div>
  );
}

function ExecutiveDashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      <RoleDashboardHeader
        title="Executive Dashboard"
        subtitle="Real-time compliance posture across all Southern Coal facilities"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FinancialRiskCard />
        <OperationalStatusCard />
        <ActionQueueCard />
      </div>
      <QuickAccessTiles />
    </div>
  );
}

function ReadOnlyDashboard() {
  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      <RoleDashboardHeader
        title="Dashboard"
        subtitle="System health overview"
      />
      <OperationalStatusCard />
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-text-secondary">
          You have read-only access. Contact your administrator for additional permissions.
        </p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { getEffectiveRole, loading } = usePermissions();

  if (loading) {
    return (
      <div className="mx-auto max-w-[1920px] space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="space-y-2">
            <div className="h-8 w-64 rounded bg-white/[0.06]" />
            <div className="h-4 w-96 rounded bg-white/[0.04]" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const role = getEffectiveRole();

  switch (role) {
    case 'field_sampler':
    case 'float_sampler':
      return <FieldSamplerDashboard />;
    case 'lab_tech':
    case 'lab_liaison':
      return <LabTechDashboard />;
    case 'safety_manager':
    case 'maintenance_owner':
      return <SafetyManagerDashboard />;
    case 'site_manager':
    case 'wv_supervisor':
      return <SiteManagerDashboard />;
    case 'environmental_manager':
    case 'compliance_reviewer':
      return <EnvManagerDashboard />;
    case 'executive':
    case 'admin':
    case 'coo':
    case 'ceo_view':
    case 'chief_counsel':
      return <ExecutiveDashboard />;
    case 'courier':
    case 'read_only':
      return <ReadOnlyDashboard />;
    default:
      return <ExecutiveDashboard />;
  }
}

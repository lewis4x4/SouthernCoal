import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LoginPage } from '@/pages/LoginPage';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { FieldShell } from '@/components/layout/FieldShell';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { lazyRoute } from '@/lib/lazyRoute';
import type { Role } from '@/types/auth';
import {
  ALL_ROLES,
  COMPLIANCE_UPLOAD_ROLES,
  COMPLIANCE_FULL_ROLES,
  COMPLIANCE_ADVANCED_ROLES,
  CORRECTIVE_ACTION_ROLES,
  REPORTING_ROLES,
  ADMIN_ROLES,
  ADMIN_ONLY_ROLES,
  FIELD_ROUTE_ROLES,
  FIELD_SCHEDULE_ROLES,
  GOVERNANCE_ROUTE_ROLES,
  AUDIT_LOG_ROUTE_ROLES,
  NOTIFICATION_ADMIN_ROLES,
  TRAINING_ADMIN_ROLES,
  EQUIPMENT_ADMIN_ROLES,
  PROFILE_ROLES,
  INCIDENT_ROLES,
  CA_ANALYTICS_ROLES,
  DMR_SUBMISSION_ROLES,
  WORK_ORDER_ROLES,
  COMPLIANCE_DB_ROLES,
  EXECUTIVE_DASHBOARD_ROLES,
  REPORT_SCHEDULE_ROLES,
  AUDIT_READINESS_ROLES,
  EMERGENCY_ROLES,
  SYSTEM_HEALTH_ROLES,
  GO_LIVE_ROLES,
  RAIN_EVENT_CONFIG_ROLES,
  RAIN_EVENT_ALERT_ROLES,
  RAIN_EVENT_VIEW_ROLES,
} from '@/lib/rbac';

// ---------------------------------------------------------------------------
// Lazy-loaded pages — code splitting for ~40% bundle reduction
// ---------------------------------------------------------------------------
const Dashboard = lazyRoute(() => import('@/pages/Dashboard'), 'Dashboard');
const UploadDashboard = lazyRoute(() => import('@/pages/UploadDashboard'), 'UploadDashboard');
const Obligations = lazyRoute(() => import('@/pages/Obligations'), 'Obligations');
const Monitoring = lazyRoute(() => import('@/pages/Monitoring'), 'Monitoring');
const Reports = lazyRoute(() => import('@/pages/Reports'), 'Reports');
const Admin = lazyRoute(() => import('@/pages/Admin'), 'Admin');
const CoverageGaps = lazyRoute(() => import('@/pages/CoverageGaps'), 'CoverageGaps');
const AuditLogPage = lazyRoute(() => import('@/pages/AuditLogPage'), 'AuditLogPage');
const AccessControlPage = lazyRoute(() => import('@/pages/AccessControlPage'), 'AccessControlPage');
const CorrectionsPage = lazyRoute(() => import('@/pages/CorrectionsPage'), 'CorrectionsPage');
const RoadmapPage = lazyRoute(() => import('@/pages/RoadmapPage'), 'RoadmapPage');
const SearchPage = lazyRoute(() => import('@/pages/SearchPage'), 'SearchPage');
const SearchObservabilityPage = lazyRoute(
  () => import('@/pages/SearchObservabilityPage'),
  'SearchObservabilityPage',
);
const ReviewQueuePage = lazyRoute(() => import('@/pages/ReviewQueuePage'), 'ReviewQueuePage');
const CorrectiveActionsPage = lazyRoute(
  () => import('@/pages/CorrectiveActionsPage'),
  'CorrectiveActionsPage',
);
const CorrectiveActionDetailPage = lazyRoute(
  () => import('@/pages/CorrectiveActionDetailPage'),
  'CorrectiveActionDetailPage',
);
const FailureToSamplePage = lazyRoute(() => import('@/pages/FailureToSamplePage'), 'FailureToSamplePage');
const ExternalDataPage = lazyRoute(() => import('@/pages/ExternalDataPage'), 'ExternalDataPage');
const AdminReportsPage = lazyRoute(() => import('@/pages/AdminReportsPage'), 'AdminReportsPage');
const FieldSchedulePage = lazyRoute(() => import('@/pages/FieldSchedulePage'), 'FieldSchedulePage');
const FieldDispatchPage = lazyRoute(() => import('@/pages/FieldDispatchPage'), 'FieldDispatchPage');
const FieldRouteTodayPage = lazyRoute(() => import('@/pages/FieldRouteTodayPage'), 'FieldRouteTodayPage');
const FieldVisitPage = lazyRoute(() => import('@/pages/FieldVisitPage'), 'FieldVisitPage');
const GovernanceIssuesPage = lazyRoute(() => import('@/pages/GovernanceIssuesPage'), 'GovernanceIssuesPage');
const SyncQueuePage = lazyRoute(() => import('@/pages/SyncQueuePage'), 'SyncQueuePage');
const NotificationPreferencesPage = lazyRoute(() => import('@/pages/NotificationPreferencesPage'), 'NotificationPreferencesPage');
const TrainingAdminPage = lazyRoute(() => import('@/pages/TrainingAdminPage'), 'TrainingAdminPage');
const EquipmentAdminPage = lazyRoute(() => import('@/pages/EquipmentAdminPage'), 'EquipmentAdminPage');
const ProfileCertificationsPage = lazyRoute(() => import('@/pages/ProfileCertificationsPage'), 'ProfileCertificationsPage');
const IncidentsPage = lazyRoute(() => import('@/pages/IncidentsPage'), 'IncidentsPage');
const IncidentDetailPage = lazyRoute(() => import('@/pages/IncidentDetailPage'), 'IncidentDetailPage');
const CAAnalyticsPage = lazyRoute(() => import('@/pages/CAAnalyticsPage'), 'CAAnalyticsPage');
const DmrSubmissionsPage = lazyRoute(() => import('@/pages/DmrSubmissionsPage'), 'DmrSubmissionsPage');
const DmrDetailPage = lazyRoute(() => import('@/pages/DmrDetailPage'), 'DmrDetailPage');
const WorkOrdersPage = lazyRoute(() => import('@/pages/WorkOrdersPage'), 'WorkOrdersPage');
const WorkOrderDetailPage = lazyRoute(() => import('@/pages/WorkOrderDetailPage'), 'WorkOrderDetailPage');
const ComplianceViolationsPage = lazyRoute(() => import('@/pages/ComplianceViolationsPage'), 'ComplianceViolationsPage');
const ComplianceViolationDetailPage = lazyRoute(() => import('@/pages/ComplianceViolationDetailPage'), 'ComplianceViolationDetailPage');
const ComplianceDashboardPage = lazyRoute(() => import('@/pages/ComplianceDashboardPage'), 'ComplianceDashboardPage');
const ScheduledReportsPage = lazyRoute(() => import('@/pages/ScheduledReportsPage'), 'ScheduledReportsPage');
const AuditChecklistsPage = lazyRoute(() => import('@/pages/AuditChecklistsPage'), 'AuditChecklistsPage');
const AuditChecklistDetailPage = lazyRoute(() => import('@/pages/AuditChecklistDetailPage'), 'AuditChecklistDetailPage');
const DocumentCompletenessPage = lazyRoute(() => import('@/pages/DocumentCompletenessPage'), 'DocumentCompletenessPage');
const ObligationEvidencePage = lazyRoute(() => import('@/pages/ObligationEvidencePage'), 'ObligationEvidencePage');
const EmergencyProceduresPage = lazyRoute(() => import('@/pages/EmergencyProceduresPage'), 'EmergencyProceduresPage');
const SystemHealthPage = lazyRoute(() => import('@/pages/SystemHealthPage'), 'SystemHealthPage');
const GoLiveValidationPage = lazyRoute(() => import('@/pages/GoLiveValidationPage'), 'GoLiveValidationPage');
const AdminCutoverPage = lazyRoute(() => import('@/pages/AdminCutoverPage'), 'AdminCutoverPage');
const AdminArchivePage = lazyRoute(() => import('@/pages/AdminArchivePage'), 'AdminArchivePage');
const WeatherStationsPage = lazyRoute(() => import('@/pages/WeatherStationsPage'), 'WeatherStationsPage');
const RainEventAlertsPage = lazyRoute(() => import('@/pages/RainEventAlertsPage'), 'RainEventAlertsPage');
const PrecipitationDataPage = lazyRoute(() => import('@/pages/PrecipitationDataPage'), 'PrecipitationDataPage');

// ---------------------------------------------------------------------------
// Route configuration — TypeScript requires `roles` on every entry.
// Adding a page without specifying roles is a compile error.
// ---------------------------------------------------------------------------
interface RouteConfig {
  path: string;
  element: React.ReactNode;
  roles: Role[];
  guardScope?: 'global' | 'assignment';
  shell?: 'app' | 'field';
}

const APP_ROUTES: RouteConfig[] = [
  { path: '/dashboard',                    element: <Dashboard />,                  roles: ALL_ROLES,                  guardScope: 'assignment', shell: 'app' },
  { path: '/compliance',                   element: <UploadDashboard />,            roles: COMPLIANCE_UPLOAD_ROLES,    guardScope: 'assignment', shell: 'app' },
  { path: '/obligations',                  element: <Obligations />,                roles: COMPLIANCE_FULL_ROLES,      guardScope: 'assignment', shell: 'app' },
  { path: '/coverage',                     element: <CoverageGaps />,               roles: COMPLIANCE_FULL_ROLES,      guardScope: 'assignment', shell: 'app' },
  { path: '/monitoring',                   element: <Monitoring />,                 roles: COMPLIANCE_FULL_ROLES,      guardScope: 'assignment', shell: 'app' },
  { path: '/reports',                      element: <Reports />,                    roles: REPORTING_ROLES,            guardScope: 'global',     shell: 'app' },
  { path: '/admin',                        element: <Admin />,                      roles: ADMIN_ROLES,                guardScope: 'global',     shell: 'app' },
  { path: '/admin/audit-log',              element: <AuditLogPage />,               roles: AUDIT_LOG_ROUTE_ROLES,      guardScope: 'global',     shell: 'app' },
  { path: '/admin/reports',                element: <AdminReportsPage />,           roles: ADMIN_ROLES,                guardScope: 'global',     shell: 'app' },
  { path: '/admin/access-control',         element: <AccessControlPage />,          roles: ADMIN_ONLY_ROLES,           guardScope: 'global',     shell: 'app' },
  { path: '/admin/sync-queue',             element: <SyncQueuePage />,              roles: ADMIN_ROLES,                guardScope: 'global',     shell: 'app' },
  { path: '/admin/notifications',          element: <NotificationPreferencesPage />, roles: NOTIFICATION_ADMIN_ROLES,   guardScope: 'global',     shell: 'app' },
  { path: '/admin/training',               element: <TrainingAdminPage />,           roles: TRAINING_ADMIN_ROLES,       guardScope: 'global',     shell: 'app' },
  { path: '/admin/equipment',              element: <EquipmentAdminPage />,          roles: EQUIPMENT_ADMIN_ROLES,      guardScope: 'global',     shell: 'app' },
  { path: '/profile/certifications',       element: <ProfileCertificationsPage />,   roles: PROFILE_ROLES,              guardScope: 'assignment', shell: 'app' },
  { path: '/incidents',                    element: <IncidentsPage />,              roles: INCIDENT_ROLES,             guardScope: 'global',     shell: 'app' },
  { path: '/incidents/:id',                element: <IncidentDetailPage />,         roles: INCIDENT_ROLES,             guardScope: 'global',     shell: 'app' },
  { path: '/corrections',                  element: <CorrectionsPage />,            roles: REPORTING_ROLES,            guardScope: 'global',     shell: 'app' },
  { path: '/roadmap',                      element: <RoadmapPage />,                roles: ADMIN_ROLES,                guardScope: 'global',     shell: 'app' },
  { path: '/search',                       element: <SearchPage />,                 roles: ALL_ROLES,                  guardScope: 'assignment', shell: 'app' },
  { path: '/compliance/failure-to-sample', element: <FailureToSamplePage />,        roles: COMPLIANCE_ADVANCED_ROLES,  guardScope: 'global',     shell: 'app' },
  { path: '/compliance/review-queue',      element: <ReviewQueuePage />,            roles: COMPLIANCE_ADVANCED_ROLES,  guardScope: 'global',     shell: 'app' },
  { path: '/compliance/external-data',     element: <ExternalDataPage />,           roles: COMPLIANCE_ADVANCED_ROLES,  guardScope: 'global',     shell: 'app' },
  { path: '/field/schedule',               element: <FieldSchedulePage />,          roles: FIELD_SCHEDULE_ROLES,       guardScope: 'assignment', shell: 'app' },
  { path: '/sampling',                     element: <FieldSchedulePage />,          roles: FIELD_SCHEDULE_ROLES,       guardScope: 'assignment', shell: 'app' },
  { path: '/field/dispatch',               element: <FieldDispatchPage />,          roles: FIELD_ROUTE_ROLES,          guardScope: 'assignment', shell: 'field' },
  { path: '/field/route',                  element: <FieldRouteTodayPage />,        roles: FIELD_ROUTE_ROLES,          guardScope: 'assignment', shell: 'field' },
  { path: '/field/visits/:id',             element: <FieldVisitPage />,             roles: FIELD_ROUTE_ROLES,          guardScope: 'assignment', shell: 'field' },
  { path: '/governance/issues',            element: <GovernanceIssuesPage />,       roles: GOVERNANCE_ROUTE_ROLES,     guardScope: 'global',     shell: 'app' },
  { path: '/search/observability',         element: <SearchObservabilityPage />,    roles: ADMIN_ONLY_ROLES,           guardScope: 'global',     shell: 'app' },
  { path: '/dmr',                           element: <DmrSubmissionsPage />,          roles: DMR_SUBMISSION_ROLES,       guardScope: 'global',     shell: 'app' },
  { path: '/dmr/:id',                      element: <DmrDetailPage />,              roles: DMR_SUBMISSION_ROLES,       guardScope: 'global',     shell: 'app' },
  { path: '/work-orders',                  element: <WorkOrdersPage />,             roles: WORK_ORDER_ROLES,           guardScope: 'global',     shell: 'app' },
  { path: '/work-orders/:id',              element: <WorkOrderDetailPage />,        roles: WORK_ORDER_ROLES,           guardScope: 'global',     shell: 'app' },
  { path: '/compliance/violations',        element: <ComplianceViolationsPage />,   roles: COMPLIANCE_DB_ROLES,        guardScope: 'global',     shell: 'app' },
  { path: '/compliance/violations/:id',    element: <ComplianceViolationDetailPage />, roles: COMPLIANCE_DB_ROLES,     guardScope: 'global',     shell: 'app' },
  { path: '/compliance/dashboard',         element: <ComplianceDashboardPage />,    roles: EXECUTIVE_DASHBOARD_ROLES,  guardScope: 'global',     shell: 'app' },
  { path: '/admin/scheduled-reports',      element: <ScheduledReportsPage />,       roles: REPORT_SCHEDULE_ROLES,      guardScope: 'global',     shell: 'app' },
  { path: '/audit/checklists',             element: <AuditChecklistsPage />,        roles: AUDIT_READINESS_ROLES,      guardScope: 'global',     shell: 'app' },
  { path: '/audit/checklists/:id',         element: <AuditChecklistDetailPage />,   roles: AUDIT_READINESS_ROLES,      guardScope: 'global',     shell: 'app' },
  { path: '/audit/documents',              element: <DocumentCompletenessPage />,   roles: AUDIT_READINESS_ROLES,      guardScope: 'global',     shell: 'app' },
  { path: '/audit/evidence',               element: <ObligationEvidencePage />,     roles: AUDIT_READINESS_ROLES,      guardScope: 'global',     shell: 'app' },
  { path: '/corrective-actions',           element: <CorrectiveActionsPage />,      roles: CORRECTIVE_ACTION_ROLES,    guardScope: 'assignment', shell: 'app' },
  { path: '/corrective-actions/analytics', element: <CAAnalyticsPage />,            roles: CA_ANALYTICS_ROLES,         guardScope: 'global',     shell: 'app' },
  { path: '/corrective-actions/:id',       element: <CorrectiveActionDetailPage />, roles: CORRECTIVE_ACTION_ROLES,    guardScope: 'assignment', shell: 'app' },
  { path: '/emergency',                   element: <EmergencyProceduresPage />,    roles: EMERGENCY_ROLES,            guardScope: 'global',     shell: 'app' },
  { path: '/admin/system-health',         element: <SystemHealthPage />,           roles: SYSTEM_HEALTH_ROLES,        guardScope: 'global',     shell: 'app' },
  { path: '/admin/go-live',              element: <GoLiveValidationPage />,       roles: GO_LIVE_ROLES,              guardScope: 'global',     shell: 'app' },
  { path: '/admin/cutover',              element: <AdminCutoverPage />,           roles: ADMIN_ONLY_ROLES,           guardScope: 'global',     shell: 'app' },
  { path: '/admin/archive',              element: <AdminArchivePage />,           roles: ADMIN_ONLY_ROLES,           guardScope: 'global',     shell: 'app' },
  { path: '/weather/stations',           element: <WeatherStationsPage />,        roles: RAIN_EVENT_CONFIG_ROLES,    guardScope: 'global',     shell: 'app' },
  { path: '/weather/alerts',             element: <RainEventAlertsPage />,        roles: RAIN_EVENT_ALERT_ROLES,     guardScope: 'global',     shell: 'app' },
  { path: '/weather/data',               element: <PrecipitationDataPage />,      roles: RAIN_EVENT_VIEW_ROLES,      guardScope: 'assignment', shell: 'app' },
];

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(13, 17, 23, 0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#f1f5f9',
            fontFamily: 'Satoshi, system-ui, sans-serif',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {APP_ROUTES.map(({ path, element, roles, guardScope = 'assignment', shell = 'app' }) => (
          <Route
            key={path}
            path={path}
            element={
              <AuthGuard>
                <RoleGuard allowedRoles={roles} scope={guardScope}>
                  {shell === 'field' ? (
                    <FieldShell>
                      <LazyPage>{element}</LazyPage>
                    </FieldShell>
                  ) : (
                    <AppShell>
                      <LazyPage>{element}</LazyPage>
                    </AppShell>
                  )}
                </RoleGuard>
              </AuthGuard>
            }
          />
        ))}

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

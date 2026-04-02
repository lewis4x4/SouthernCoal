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
  { path: '/corrective-actions',           element: <CorrectiveActionsPage />,      roles: CORRECTIVE_ACTION_ROLES,    guardScope: 'assignment', shell: 'app' },
  { path: '/corrective-actions/:id',       element: <CorrectiveActionDetailPage />, roles: CORRECTIVE_ACTION_ROLES,    guardScope: 'assignment', shell: 'app' },
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

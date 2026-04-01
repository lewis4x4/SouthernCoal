import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LoginPage } from '@/pages/LoginPage';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { lazyRoute } from '@/lib/lazyRoute';
import type { Role } from '@/types/auth';

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
// Role-group constants — single source of truth for route + sidebar guards
// ---------------------------------------------------------------------------
const COMPLIANCE_UPLOAD_ROLES: Role[] = ['admin', 'executive', 'environmental_manager', 'site_manager', 'lab_tech'];
const COMPLIANCE_FULL_ROLES: Role[] = ['admin', 'executive', 'environmental_manager', 'site_manager'];
const COMPLIANCE_ADVANCED_ROLES: Role[] = ['admin', 'executive', 'environmental_manager'];
const CORRECTIVE_ACTION_ROLES: Role[] = ['admin', 'executive', 'environmental_manager', 'site_manager', 'safety_manager', 'field_sampler'];
const REPORTING_ROLES: Role[] = ['admin', 'executive', 'environmental_manager'];
const ADMIN_ROLES: Role[] = ['admin', 'executive'];
const ADMIN_ONLY_ROLES: Role[] = ['admin'];
const FIELD_ROUTE_ROLES: Role[] = ['field_sampler', 'site_manager', 'environmental_manager', 'executive', 'admin'];
const FIELD_SCHEDULE_ROLES: Role[] = ['site_manager', 'environmental_manager', 'executive', 'admin'];
const GOVERNANCE_ROUTE_ROLES: Role[] = ['environmental_manager', 'executive', 'admin'];
const AUDIT_LOG_ROUTE_ROLES: Role[] = ['environmental_manager', 'executive', 'admin'];

/**
 * Page loading fallback — matches Living Crystal design system
 */
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

/**
 * Wrapper for lazy-loaded pages with Suspense boundary
 */
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

        {/* Executive Dashboard — new home page */}
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><Dashboard /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Upload Dashboard — moved from /dashboard */}
        <Route
          path="/compliance"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={COMPLIANCE_UPLOAD_ROLES}>
                <AppShell>
                  <LazyPage><UploadDashboard /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Consent Decree Obligations */}
        <Route
          path="/obligations"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={COMPLIANCE_FULL_ROLES}>
                <AppShell>
                  <LazyPage><Obligations /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Coverage Gap Analysis */}
        <Route
          path="/coverage"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={COMPLIANCE_FULL_ROLES}>
                <AppShell>
                  <LazyPage><CoverageGaps /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Real-Time Monitoring */}
        <Route
          path="/monitoring"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={COMPLIANCE_FULL_ROLES}>
                <AppShell>
                  <LazyPage><Monitoring /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Report Generator */}
        <Route
          path="/reports"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={REPORTING_ROLES}>
                <AppShell>
                  <LazyPage><Reports /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Administration */}
        <Route
          path="/admin"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={ADMIN_ROLES}>
                <AppShell>
                  <LazyPage><Admin /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Audit Log */}
        <Route
          path="/admin/audit-log"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={AUDIT_LOG_ROUTE_ROLES}>
                <AppShell>
                  <LazyPage><AuditLogPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Report Administration */}
        <Route
          path="/admin/reports"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={ADMIN_ROLES}>
                <AppShell>
                  <LazyPage><AdminReportsPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Access Control — admin only (DB-level user/role management) */}
        <Route
          path="/admin/access-control"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={ADMIN_ONLY_ROLES}>
                <AppShell>
                  <LazyPage><AccessControlPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Data Corrections */}
        <Route
          path="/corrections"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={REPORTING_ROLES}>
                <AppShell>
                  <LazyPage><CorrectionsPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Implementation Roadmap */}
        <Route
          path="/roadmap"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={ADMIN_ROLES}>
                <AppShell>
                  <LazyPage><RoadmapPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Compliance Search */}
        <Route
          path="/search"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><SearchPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Failure to Sample Penalties */}
        <Route
          path="/compliance/failure-to-sample"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={COMPLIANCE_ADVANCED_ROLES}>
                <AppShell>
                  <LazyPage><FailureToSamplePage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Review Queue — discrepancy triage */}
        <Route
          path="/compliance/review-queue"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={COMPLIANCE_ADVANCED_ROLES}>
                <AppShell>
                  <LazyPage><ReviewQueuePage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* External Data — ECHO Sync Coverage */}
        <Route
          path="/compliance/external-data"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={COMPLIANCE_ADVANCED_ROLES}>
                <AppShell>
                  <LazyPage><ExternalDataPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Field queue and dispatch */}
        <Route
          path="/field/schedule"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={FIELD_SCHEDULE_ROLES}>
                <AppShell>
                  <LazyPage><FieldSchedulePage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        <Route
          path="/sampling"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={FIELD_SCHEDULE_ROLES}>
                <AppShell>
                  <LazyPage><FieldSchedulePage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        <Route
          path="/field/dispatch"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={FIELD_ROUTE_ROLES}>
                <AppShell>
                  <LazyPage><FieldDispatchPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        <Route
          path="/field/route"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={FIELD_ROUTE_ROLES}>
                <AppShell>
                  <LazyPage><FieldRouteTodayPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Field visit execution */}
        <Route
          path="/field/visits/:id"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={FIELD_ROUTE_ROLES}>
                <AppShell>
                  <LazyPage><FieldVisitPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Governance issue inbox */}
        <Route
          path="/governance/issues"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={GOVERNANCE_ROUTE_ROLES}>
                <AppShell>
                  <LazyPage><GovernanceIssuesPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Search Observability — admin only (developer tooling) */}
        <Route
          path="/search/observability"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={ADMIN_ONLY_ROLES}>
                <AppShell>
                  <LazyPage><SearchObservabilityPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Corrective Actions List */}
        <Route
          path="/corrective-actions"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={CORRECTIVE_ACTION_ROLES}>
                <AppShell>
                  <LazyPage><CorrectiveActionsPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        {/* Corrective Action Detail */}
        <Route
          path="/corrective-actions/:id"
          element={
            <AuthGuard>
              <RoleGuard allowedRoles={CORRECTIVE_ACTION_ROLES}>
                <AppShell>
                  <LazyPage><CorrectiveActionDetailPage /></LazyPage>
                </AppShell>
              </RoleGuard>
            </AuthGuard>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

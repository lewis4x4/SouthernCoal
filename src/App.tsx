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
const FIELD_ROUTE_ROLES: Role[] = ['field_sampler', 'site_manager', 'environmental_manager', 'executive', 'admin'];
const FIELD_SCHEDULE_ROLES: Role[] = ['site_manager', 'environmental_manager', 'executive', 'admin'];
const GOVERNANCE_ROUTE_ROLES: Role[] = ['environmental_manager', 'executive', 'admin'];

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
    <BrowserRouter>
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
              <AppShell>
                <LazyPage><UploadDashboard /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Consent Decree Obligations */}
        <Route
          path="/obligations"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><Obligations /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Coverage Gap Analysis */}
        <Route
          path="/coverage"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><CoverageGaps /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Real-Time Monitoring */}
        <Route
          path="/monitoring"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><Monitoring /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Report Generator */}
        <Route
          path="/reports"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><Reports /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Administration */}
        <Route
          path="/admin"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><Admin /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Audit Log */}
        <Route
          path="/admin/audit-log"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><AuditLogPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Report Administration */}
        <Route
          path="/admin/reports"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><AdminReportsPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Access Control */}
        <Route
          path="/admin/access-control"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><AccessControlPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Data Corrections */}
        <Route
          path="/corrections"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><CorrectionsPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Implementation Roadmap */}
        <Route
          path="/roadmap"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><RoadmapPage /></LazyPage>
              </AppShell>
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
              <AppShell>
                <LazyPage><FailureToSamplePage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Review Queue — discrepancy triage */}
        <Route
          path="/compliance/review-queue"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><ReviewQueuePage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* External Data — ECHO Sync Coverage */}
        <Route
          path="/compliance/external-data"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><ExternalDataPage /></LazyPage>
              </AppShell>
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

        {/* Search Observability */}
        <Route
          path="/search/observability"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><SearchObservabilityPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Corrective Actions List */}
        <Route
          path="/corrective-actions"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><CorrectiveActionsPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        {/* Corrective Action Detail */}
        <Route
          path="/corrective-actions/:id"
          element={
            <AuthGuard>
              <AppShell>
                <LazyPage><CorrectiveActionDetailPage /></LazyPage>
              </AppShell>
            </AuthGuard>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

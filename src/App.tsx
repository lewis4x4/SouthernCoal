import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LoginPage } from '@/pages/LoginPage';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// ---------------------------------------------------------------------------
// Lazy-loaded pages — code splitting for ~40% bundle reduction
// ---------------------------------------------------------------------------
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const UploadDashboard = lazy(() => import('@/pages/UploadDashboard').then(m => ({ default: m.UploadDashboard })));
const Obligations = lazy(() => import('@/pages/Obligations').then(m => ({ default: m.Obligations })));
const Monitoring = lazy(() => import('@/pages/Monitoring').then(m => ({ default: m.Monitoring })));
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })));
const Admin = lazy(() => import('@/pages/Admin').then(m => ({ default: m.Admin })));
const CoverageGaps = lazy(() => import('@/pages/CoverageGaps').then(m => ({ default: m.CoverageGaps })));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const AccessControlPage = lazy(() => import('@/pages/AccessControlPage').then(m => ({ default: m.AccessControlPage })));
const CorrectionsPage = lazy(() => import('@/pages/CorrectionsPage').then(m => ({ default: m.CorrectionsPage })));
const RoadmapPage = lazy(() => import('@/pages/RoadmapPage').then(m => ({ default: m.RoadmapPage })));
const SearchPage = lazy(() => import('@/pages/SearchPage').then(m => ({ default: m.SearchPage })));
const SearchObservabilityPage = lazy(() => import('@/pages/SearchObservabilityPage').then(m => ({ default: m.SearchObservabilityPage })));
const ReviewQueuePage = lazy(() => import('@/pages/ReviewQueuePage').then(m => ({ default: m.ReviewQueuePage })));
const CorrectiveActionsPage = lazy(() => import('@/pages/CorrectiveActionsPage').then(m => ({ default: m.CorrectiveActionsPage })));
const CorrectiveActionDetailPage = lazy(() => import('@/pages/CorrectiveActionDetailPage').then(m => ({ default: m.CorrectiveActionDetailPage })));
const FailureToSamplePage = lazy(() => import('@/pages/FailureToSamplePage').then(m => ({ default: m.FailureToSamplePage })));

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

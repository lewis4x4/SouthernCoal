import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LoginPage } from '@/pages/LoginPage';
import { UploadDashboard } from '@/pages/UploadDashboard';
import { Dashboard } from '@/pages/Dashboard';
import { Obligations } from '@/pages/Obligations';
import { Monitoring } from '@/pages/Monitoring';
import { Reports } from '@/pages/Reports';
import { Admin } from '@/pages/Admin';
import { CoverageGaps } from '@/pages/CoverageGaps';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { AccessControlPage } from '@/pages/AccessControlPage';
import { CorrectionsPage } from '@/pages/CorrectionsPage';
import { RoadmapPage } from '@/pages/RoadmapPage';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGuard } from '@/components/layout/AuthGuard';

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
                <Dashboard />
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
                <UploadDashboard />
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
                <Obligations />
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
                <CoverageGaps />
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
                <Monitoring />
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
                <Reports />
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
                <Admin />
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
                <AuditLogPage />
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
                <AccessControlPage />
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
                <CorrectionsPage />
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
                <RoadmapPage />
              </AppShell>
            </AuthGuard>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

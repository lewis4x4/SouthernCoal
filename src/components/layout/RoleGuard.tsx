import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import type { Role } from '@/types/auth';
import type { PermissionScope } from '@/hooks/usePermissions';

interface RoleGuardProps {
  allowedRoles: Role[];
  children: ReactNode;
  scope?: PermissionScope;
}

export function RoleGuard({ allowedRoles, children, scope = 'assignment' }: RoleGuardProps) {
  const { hasAllowedRole, loading, availability } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-text-muted border-t-status-queued rounded-full animate-spin" />
          <span className="text-sm text-text-secondary">Loading permissions...</span>
        </div>
      </div>
    );
  }

  if (availability === 'unavailable') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-5 text-center">
          <div className="text-lg font-semibold text-text-primary">Permissions unavailable</div>
          <div className="mt-2 text-sm text-text-secondary">
            The app could not verify your role assignments. Refresh or sign in again before continuing.
          </div>
        </div>
      </div>
    );
  }

  if (!hasAllowedRole(allowedRoles, scope)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

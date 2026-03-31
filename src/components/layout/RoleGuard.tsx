import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import type { Role } from '@/types/auth';

interface RoleGuardProps {
  allowedRoles: Role[];
  children: ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { getEffectiveRole, loading } = usePermissions();
  const role = getEffectiveRole();

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

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

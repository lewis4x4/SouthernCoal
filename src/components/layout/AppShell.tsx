import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePermissions } from '@/hooks/usePermissions';
import { DisclaimerFooter } from '@/components/legal/DisclaimerFooter';

interface AppShellProps {
  children: ReactNode;
}

const ROLE_LABELS: Record<string, string> = {
  executive: 'Executive',
  site_manager: 'Site Manager',
  environmental_manager: 'Env. Manager',
  safety_manager: 'Safety Manager',
  field_sampler: 'Field Sampler',
  lab_tech: 'Lab Tech',
  admin: 'Admin',
  read_only: 'Read-Only',
};

export function AppShell({ children }: AppShellProps) {
  const { user, signOut } = useAuth();
  const { organizationName } = useUserProfile();
  const { getEffectiveRole } = usePermissions();

  const role = getEffectiveRole();
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-crystal-surface/80 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">
            SCC Compliance Monitor
          </h1>
          {organizationName && (
            <span className="text-xs text-text-secondary">{organizationName}</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Cmd+K hint */}
          <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-text-muted border border-white/[0.08] rounded-md bg-white/[0.02]">
            <span className="text-[11px]">⌘</span>K
          </kbd>

          {/* Role badge */}
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-white/[0.05] text-text-secondary border border-white/[0.08]">
            {roleLabel}
          </span>

          {/* User + Sign out */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">{user?.email}</span>
            <button
              onClick={() => signOut()}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-6">{children}</main>

      {/* Disclaimer footer */}
      <DisclaimerFooter />
    </div>
  );
}

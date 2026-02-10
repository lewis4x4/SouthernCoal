import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Upload,
  ClipboardList,
  Grid3X3,
  Activity,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePermissions } from '@/hooks/usePermissions';

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

const NAV_ITEMS = [
  { label: 'Home', href: '/dashboard', icon: Home },
  { label: 'Upload', href: '/compliance', icon: Upload },
  { label: 'Obligations', href: '/obligations', icon: ClipboardList },
  { label: 'Coverage', href: '/coverage', icon: Grid3X3 },
  { label: 'Monitoring', href: '/monitoring', icon: Activity },
  { label: 'Reports', href: '/reports', icon: FileText },
  { label: 'Admin', href: '/admin', icon: Settings },
] as const;

export function TopNav() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { organizationName } = useUserProfile();
  const { getEffectiveRole } = usePermissions();

  const role = getEffectiveRole();
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-crystal-surface/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[1920px] px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo + Org */}
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="text-lg font-semibold tracking-tight text-text-primary"
            >
              SCC Compliance Monitor
            </Link>
            {organizationName && (
              <span className="hidden text-xs text-text-secondary lg:inline">
                {organizationName}
              </span>
            )}
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-white/10 text-white shadow-lg shadow-white/5'
                      : 'text-text-muted hover:bg-white/[0.05] hover:text-text-secondary',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right side: Role + User + Sign out */}
          <div className="flex items-center gap-3">
            {/* Cmd+K hint */}
            <kbd className="hidden items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-text-muted md:inline-flex">
              <span className="text-[11px]">&#8984;</span>K
            </kbd>

            {/* Role badge */}
            <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-text-secondary">
              {roleLabel}
            </span>

            {/* User + Sign out */}
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-text-secondary sm:inline">
                {user?.email}
              </span>
              <button
                onClick={() => signOut()}
                className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text-secondary"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

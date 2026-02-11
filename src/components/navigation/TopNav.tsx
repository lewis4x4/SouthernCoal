import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Search,
  Upload,
  ClipboardList,
  Grid3X3,
  Activity,
  FileText,
  Settings,
  LogOut,
  FileEdit,
  Map,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
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

const NAV_GROUPS = [
  {
    items: [
      { label: 'Home', href: '/dashboard', icon: Home },
      { label: 'Search', href: '/search', icon: Search },
    ],
    activeColor: 'bg-white/10 text-white shadow-lg shadow-white/5',
    hoverColor: 'hover:text-text-secondary',
  },
  {
    items: [
      { label: 'Upload', href: '/compliance', icon: Upload },
      { label: 'Obligations', href: '/obligations', icon: ClipboardList },
      { label: 'Coverage', href: '/coverage', icon: Grid3X3 },
      { label: 'Monitoring', href: '/monitoring', icon: Activity },
    ],
    activeColor: 'bg-cyan-500/15 text-cyan-300 shadow-lg shadow-cyan-500/5',
    hoverColor: 'hover:text-cyan-400',
  },
  {
    items: [
      { label: 'Reports', href: '/reports', icon: FileText },
      { label: 'Corrections', href: '/corrections', icon: FileEdit },
    ],
    activeColor: 'bg-amber-500/15 text-amber-300 shadow-lg shadow-amber-500/5',
    hoverColor: 'hover:text-amber-400',
  },
  {
    items: [
      { label: 'Roadmap', href: '/roadmap', icon: Map },
      { label: 'Admin', href: '/admin', icon: Settings },
    ],
    activeColor: 'bg-purple-500/15 text-purple-300 shadow-lg shadow-purple-500/5',
    hoverColor: 'hover:text-purple-400',
  },
];

export function TopNav() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { getEffectiveRole } = usePermissions();

  const role = getEffectiveRole();
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-crystal-surface/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[1920px] px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo placeholder — user will add custom logo */}
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
              <span className="text-sm font-bold text-white">SC</span>
            </div>
          </Link>

          {/* Nav Links — grouped with dividers */}
          <div className="flex items-center gap-1">
            {NAV_GROUPS.map((group, groupIdx) => (
              <div key={groupIdx} className="flex items-center">
                {groupIdx > 0 && (
                  <div className="mx-1.5 h-6 border-l border-white/[0.08]" />
                )}
                <div className="flex items-center gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                          isActive
                            ? group.activeColor
                            : cn('text-text-muted hover:bg-white/[0.05]', group.hoverColor),
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden lg:inline">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
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

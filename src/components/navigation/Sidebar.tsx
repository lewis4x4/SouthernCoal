import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Search,
  Upload,
  ClipboardList,
  ClipboardCheck,
  Grid3X3,
  Activity,
  FileText,
  Settings,
  LogOut,
  FileEdit,
  Map,
  ShieldAlert,
  DollarSign,
  Pin,
  PinOff,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useFtsNavBadge } from '@/hooks/useFtsNavBadge';

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
    label: 'Main',
    items: [
      { label: 'Home', href: '/dashboard', icon: Home },
      { label: 'Search', href: '/search', icon: Search },
    ],
    activeColor: 'bg-white/10 text-white shadow-lg shadow-white/5',
    hoverColor: 'hover:text-text-secondary',
    accentColor: 'border-white/20',
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Upload', href: '/compliance', icon: Upload },
      { label: 'Obligations', href: '/obligations', icon: ClipboardList },
      { label: 'Coverage', href: '/coverage', icon: Grid3X3 },
      { label: 'Monitoring', href: '/monitoring', icon: Activity },
      { label: 'Failure to Sample', href: '/compliance/failure-to-sample', icon: DollarSign },
      { label: 'Review', href: '/compliance/review-queue', icon: ShieldAlert },
      { label: 'Actions', href: '/corrective-actions', icon: ClipboardCheck },
    ],
    activeColor: 'bg-cyan-500/15 text-cyan-300 shadow-lg shadow-cyan-500/5',
    hoverColor: 'hover:text-cyan-400',
    accentColor: 'border-cyan-500/30',
  },
  {
    label: 'Reporting',
    items: [
      { label: 'Reports', href: '/reports', icon: FileText },
      { label: 'Corrections', href: '/corrections', icon: FileEdit },
    ],
    activeColor: 'bg-amber-500/15 text-amber-300 shadow-lg shadow-amber-500/5',
    hoverColor: 'hover:text-amber-400',
    accentColor: 'border-amber-500/30',
  },
  {
    label: 'Admin',
    items: [
      { label: 'Roadmap', href: '/roadmap', icon: Map },
      { label: 'Admin', href: '/admin', icon: Settings },
    ],
    activeColor: 'bg-purple-500/15 text-purple-300 shadow-lg shadow-purple-500/5',
    hoverColor: 'hover:text-purple-400',
    accentColor: 'border-purple-500/30',
  },
];

const SIDEBAR_COLLAPSED_WIDTH = 'w-16';
const SIDEBAR_EXPANDED_WIDTH = 'w-56';

export function Sidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { getEffectiveRole } = usePermissions();

  // Load pinned state from localStorage
  const [isPinned, setIsPinned] = useState(() => {
    const saved = localStorage.getItem('sidebar-pinned');
    return saved === 'true';
  });
  const [isHovered, setIsHovered] = useState(false);

  // Sidebar is expanded when pinned OR hovered
  const isExpanded = isPinned || isHovered;

  const role = getEffectiveRole();
  const roleLabel = ROLE_LABELS[role] ?? role;
  const ftsBadge = useFtsNavBadge();

  // Persist pin state and dispatch event for AppShell to listen
  useEffect(() => {
    localStorage.setItem('sidebar-pinned', String(isPinned));
    window.dispatchEvent(new CustomEvent('sidebar-pin-change', { detail: isPinned }));
  }, [isPinned]);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-white/[0.06] bg-crystal-surface/95 backdrop-blur-xl transition-all duration-300 ease-in-out',
        isExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo + Pin Toggle */}
      <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
            <span className="text-sm font-bold text-white">SC</span>
          </div>
          {isExpanded && (
            <span className="whitespace-nowrap text-sm font-semibold text-white">
              SCC Monitor
            </span>
          )}
        </Link>

        {isExpanded && (
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={cn(
              'rounded-lg p-1.5 transition-colors',
              isPinned
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-text-muted hover:bg-white/[0.05] hover:text-text-secondary'
            )}
            title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          >
            {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-hide">
        {NAV_GROUPS.map((group, groupIdx) => (
          <div key={groupIdx} className="mb-4">
            {/* Group Label */}
            {isExpanded && (
              <div className="mb-2 px-4">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {group.label}
                </span>
              </div>
            )}

            {/* Group Divider when collapsed */}
            {!isExpanded && groupIdx > 0 && (
              <div className="mx-3 mb-3 border-t border-white/[0.08]" />
            )}

            {/* Items */}
            <div className="space-y-1 px-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      isExpanded ? '' : 'justify-center',
                      isActive
                        ? group.activeColor
                        : cn('text-text-muted hover:bg-white/[0.05]', group.hoverColor)
                    )}
                    title={!isExpanded ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {isExpanded && (
                      <>
                        <span className="whitespace-nowrap">{item.label}</span>
                        {item.href === '/compliance/failure-to-sample' && ftsBadge && (
                          <span className="ml-auto inline-flex items-center rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-400">
                            {ftsBadge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Section: Role + User */}
      <div className="border-t border-white/[0.06] p-3">
        {/* Role Badge */}
        <div
          className={cn(
            'mb-3 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2',
            !isExpanded && 'justify-center px-0'
          )}
        >
          {isExpanded ? (
            <>
              <span className="text-xs font-medium text-text-secondary">{roleLabel}</span>
            </>
          ) : (
            <span className="text-[10px] font-bold text-text-muted">
              {roleLabel.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {/* User Email + Sign Out */}
        <div className={cn('flex items-center gap-2', !isExpanded && 'flex-col')}>
          {isExpanded && (
            <span className="flex-1 truncate text-xs text-text-secondary">
              {user?.email}
            </span>
          )}
          <button
            onClick={() => signOut()}
            className={cn(
              'rounded-lg p-2 text-text-muted transition-colors hover:bg-white/[0.05] hover:text-red-400',
              !isExpanded && 'w-full'
            )}
            title="Sign out"
          >
            <LogOut size={18} className={cn(!isExpanded && 'mx-auto')} />
          </button>
        </div>

        {/* Cmd+K Hint */}
        {isExpanded && (
          <kbd className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] py-1.5 font-mono text-[10px] text-text-muted">
            <span className="text-[11px]">&#8984;</span>K to search
          </kbd>
        )}
      </div>
    </aside>
  );
}

// Export the width for use in AppShell
export const SIDEBAR_WIDTH = {
  collapsed: '4rem', // 64px
  expanded: '14rem', // 224px
};

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useFtsNavBadge } from '@/hooks/useFtsNavBadge';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer';
import { readStoredBoolean, writeStoredBoolean } from '@/lib/safeStorage';
import { NAV_GROUPS } from '@/lib/navGroups';

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

const SIDEBAR_COLLAPSED_WIDTH = 'w-16';
const SIDEBAR_EXPANDED_WIDTH = 'w-56';

export function Sidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { getEffectiveRole } = usePermissions();

  // Load pinned state from localStorage
  const [isPinned, setIsPinned] = useState(() => readStoredBoolean('sidebar-pinned'));
  const [isHovered, setIsHovered] = useState(false);

  // Sidebar is expanded when pinned OR hovered
  const isExpanded = isPinned || isHovered;

  const role = getEffectiveRole();
  const roleLabel = ROLE_LABELS[role] ?? role;
  const ftsBadge = useFtsNavBadge();
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Persist pin state and dispatch event for AppShell to listen
  useEffect(() => {
    writeStoredBoolean('sidebar-pinned', isPinned);
    window.dispatchEvent(new CustomEvent('sidebar-pin-change', { detail: isPinned }));
  }, [isPinned]);

  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
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
            aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          >
            {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-hide">
        {visibleGroups.map((group, groupIdx) => (
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

      {/* Bottom Section: Notifications + Role + User */}
      <div className="border-t border-white/[0.06] p-3">
        {/* Notification Bell */}
        <div className="mb-2 px-1">
          <NotificationBell
            unreadCount={unreadCount}
            isExpanded={isExpanded}
            onClick={() => setDrawerOpen((prev) => !prev)}
          />
        </div>

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
            aria-label="Sign out"
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

      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDismiss={dismiss}
      />
    </>
  );
}

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

  const [isPinned, setIsPinned] = useState(() => readStoredBoolean('sidebar-pinned'));
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = isPinned || isHovered;

  const role = getEffectiveRole();
  const roleLabel = ROLE_LABELS[role] ?? role;
  const ftsBadge = useFtsNavBadge();
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-black/20 bg-qo-sidebar transition-all duration-300 ease-in-out',
          isExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Brand */}
        <div className="flex h-[72px] items-center justify-between border-b border-qo-sidebar-border px-3">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-qo-accent font-mono text-[13px] font-semibold tracking-wide text-[#F4EFE6]">
              SC
            </div>
            {isExpanded && (
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold tracking-wide text-qo-sidebar-text">
                  Site Command
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-qo-sidebar-muted">
                  Operations Console
                </div>
              </div>
            )}
          </Link>

          {isExpanded && (
            <button
              onClick={() => setIsPinned(!isPinned)}
              className={cn(
                'rounded-lg p-1.5 transition-colors',
                isPinned
                  ? 'bg-qo-accent/20 text-qo-accent-soft'
                  : 'text-qo-sidebar-muted hover:bg-[rgba(231,227,219,0.08)] hover:text-qo-sidebar-text',
              )}
              title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            >
              {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-x-hidden overflow-y-auto py-3 scrollbar-hide">
          {visibleGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-3 px-3">
              {isExpanded && (
                <div className="mb-1.5 px-3">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#6B655B]">
                    {group.label}
                  </span>
                </div>
              )}

              {!isExpanded && groupIdx > 0 && (
                <div className="mx-1 mb-2 border-t border-qo-sidebar-border" />
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isExpanded ? '' : 'justify-center',
                        isActive
                          ? 'bg-[rgba(231,227,219,0.08)] text-qo-sidebar-text'
                          : 'text-[#B8B2A8] hover:bg-[rgba(231,227,219,0.05)] hover:text-qo-sidebar-text',
                      )}
                      title={!isExpanded ? item.label : undefined}
                    >
                      {isExpanded && (
                        <span
                          className={cn(
                            'h-4 w-0.5 shrink-0 rounded-full',
                            isActive ? 'bg-qo-accent' : 'bg-transparent',
                          )}
                          aria-hidden
                        />
                      )}
                      <Icon className="h-5 w-5 shrink-0" />
                      {isExpanded && (
                        <>
                          <span className="whitespace-nowrap">{item.label}</span>
                          {item.href === '/compliance/failure-to-sample' && ftsBadge && (
                            <span className="ml-auto inline-flex items-center rounded-full border border-qo-risk/40 bg-qo-risk/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#E8A89A]">
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

        {/* Footer */}
        <div className="border-t border-qo-sidebar-border p-3">
          <div className="mb-2 px-1">
            <NotificationBell
              unreadCount={unreadCount}
              isExpanded={isExpanded}
              onClick={() => setDrawerOpen((prev) => !prev)}
            />
          </div>

          <div
            className={cn(
              'mb-3 flex items-center gap-2 rounded-lg border border-qo-sidebar-border bg-[rgba(231,227,219,0.04)] px-3 py-2',
              !isExpanded && 'justify-center px-0',
            )}
          >
            {isExpanded ? (
              <span className="text-xs font-medium text-[#B8B2A8]">{roleLabel}</span>
            ) : (
              <span className="text-[10px] font-bold text-qo-sidebar-muted">
                {roleLabel.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className={cn('flex items-center gap-2', !isExpanded && 'flex-col')}>
            {isExpanded && (
              <span className="flex-1 truncate text-xs text-[#B8B2A8]">{user?.email}</span>
            )}
            <button
              onClick={() => signOut()}
              className={cn(
                'rounded-lg p-2 text-qo-sidebar-muted transition-colors hover:bg-[rgba(231,227,219,0.08)] hover:text-[#E8A89A]',
                !isExpanded && 'w-full',
              )}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={18} className={cn(!isExpanded && 'mx-auto')} />
            </button>
          </div>

          {isExpanded && (
            <kbd className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-qo-sidebar-border bg-[rgba(231,227,219,0.04)] py-1.5 font-mono text-[10px] text-qo-sidebar-muted">
              <span className="text-[11px]">&#8984;</span>K to search
            </kbd>
          )}

          {isExpanded && (
            <div className="mt-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 animate-qo-pulse rounded-full bg-qo-sage" />
              <span className="text-[10.5px] tracking-wide text-[#B8B2A8]">All systems reporting</span>
            </div>
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

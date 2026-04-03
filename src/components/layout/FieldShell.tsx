import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, LayoutGrid, ListTodo, Route, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useFtsNavBadge } from '@/hooks/useFtsNavBadge';
import { NAV_GROUPS } from '@/lib/navGroups';
import { FIELD_ROUTE_ROLES, FIELD_SCHEDULE_ROLES } from '@/lib/rbac';

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function getOnlineSnapshot() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

const FIELD_NAV_ITEMS = [
  { href: '/field/route', label: "Today's Route", shortLabel: 'Route', icon: Route, roles: FIELD_ROUTE_ROLES },
  { href: '/field/dispatch', label: 'Field Queue', shortLabel: 'Queue', icon: ListTodo, roles: FIELD_ROUTE_ROLES },
  { href: '/field/schedule', label: 'Calendar', shortLabel: 'Calendar', icon: CalendarDays, roles: FIELD_SCHEDULE_ROLES },
] as const;

interface FieldShellProps {
  children: ReactNode;
}

function isFieldRouteActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === '/field/route' && pathname.startsWith('/field/visits/')) return true;
  return false;
}

export function FieldShell({ children }: FieldShellProps) {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { getEffectiveRole } = usePermissions();
  const role = getEffectiveRole();
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  const [moreOpen, setMoreOpen] = useState(false);
  const ftsBadge = useFtsNavBadge();

  const visibleFieldNav = FIELD_NAV_ITEMS.filter((item) => item.roles.includes(role));

  const visibleAppGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-crystal-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-5">
          <Link
            to="/field/route"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white"
            aria-label="Open field home"
          >
            SC
          </Link>

          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold tracking-tight text-text-primary">Field Ops</div>
            <div className="text-xs text-text-muted">Tablet-first route execution</div>
          </div>

          <div
            className={cn(
              'inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium',
              online
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-100',
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full', online ? 'bg-emerald-300' : 'bg-amber-300')} />
            {online ? 'Online' : 'Offline'}
          </div>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Field sections">
            {visibleFieldNav.map((item) => {
              const Icon = item.icon;
              const active = isFieldRouteActive(location.pathname, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-cyan-500/15 text-cyan-100'
                      : 'bg-white/[0.03] text-text-secondary hover:bg-white/[0.06] hover:text-text-primary',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="px-4 py-4 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:py-5 md:pb-5">
        {children}
      </main>

      {/* Mobile: primary field tabs + entry to full app nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-crystal-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl md:hidden"
        aria-label="Field mobile navigation"
      >
        <div className="mx-auto flex max-w-6xl">
          {visibleFieldNav.map((item) => {
            const Icon = item.icon;
            const active = isFieldRouteActive(location.pathname, item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition-colors',
                  active ? 'text-cyan-200' : 'text-text-muted',
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-cyan-300' : 'text-text-secondary')} />
                <span className="truncate">{item.shortLabel}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition-colors',
              moreOpen ? 'text-cyan-200' : 'text-text-muted',
            )}
            aria-label="Open main app menu"
          >
            <LayoutGrid className={cn('h-5 w-5 shrink-0', moreOpen ? 'text-cyan-300' : 'text-text-secondary')} />
            <span>More</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={() => setMoreOpen(false)}
            aria-label="Close main app menu"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[min(85vh,32rem)] rounded-t-3xl border border-white/[0.08] border-b-0 bg-crystal-surface/98 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div>
                <div className="text-base font-semibold text-text-primary">SCC Monitor</div>
                <div className="text-xs text-text-muted">All pages for your role</div>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-text-secondary"
                aria-label="Close main app menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[min(70vh,26rem)] overflow-y-auto px-3 py-3 pb-[env(safe-area-inset-bottom,0px)]">
              {visibleAppGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="mb-4 last:mb-0">
                  <div className="mb-2 px-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            'flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                            isActive
                              ? group.activeColor
                              : cn('bg-white/[0.03] text-text-secondary hover:bg-white/[0.06] hover:text-text-primary'),
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          {item.href === '/compliance/failure-to-sample' && ftsBadge ? (
                            <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-400">
                              {ftsBadge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {user?.email ? (
                <p className="mb-3 truncate px-2 text-xs text-text-muted">{user.email}</p>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  void signOut();
                }}
                className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

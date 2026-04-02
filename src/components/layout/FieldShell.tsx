import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, ListTodo, Menu, Route, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';

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
  { href: '/field/route', label: "Today's Route", icon: Route },
  { href: '/field/dispatch', label: 'Field Queue', icon: ListTodo },
  { href: '/field/schedule', label: 'Calendar', icon: CalendarDays },
] as const;

interface FieldShellProps {
  children: ReactNode;
}

export function FieldShell({ children }: FieldShellProps) {
  const location = useLocation();
  const { signOut } = useAuth();
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

          <div className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium',
            online
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-100',
          )}>
            <span className={cn('h-2.5 w-2.5 rounded-full', online ? 'bg-emerald-300' : 'bg-amber-300')} />
            {online ? 'Online' : 'Offline'}
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {FIELD_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.href || (item.href === '/field/route' && location.pathname.startsWith('/field/visits/'));
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

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary md:hidden"
            aria-label="Open field navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close field navigation"
          />
          <div className="absolute right-0 top-0 h-full w-[84vw] max-w-sm border-l border-white/[0.08] bg-crystal-surface/98 px-4 py-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-text-primary">Field Navigation</div>
                <div className="text-xs text-text-muted">Sampler workflow</div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-text-secondary"
                aria-label="Close field navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {FIELD_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.href || (item.href === '/field/route' && location.pathname.startsWith('/field/visits/'));
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-cyan-500/15 text-cyan-100'
                        : 'bg-white/[0.03] text-text-secondary hover:bg-white/[0.06] hover:text-text-primary',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                void signOut();
              }}
              className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      <main className="px-4 py-4 sm:px-5 sm:py-5">{children}</main>
    </div>
  );
}

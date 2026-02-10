import { Link } from 'react-router-dom';
import { Settings, ScrollText, Shield, Bell, MapPin } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';

const ADMIN_CARDS = [
  {
    label: 'Audit Log',
    description: 'Human-readable change log — who changed what, when, with before/after values.',
    href: '/admin/audit-log',
    icon: ScrollText,
    color: 'rgba(168, 85, 247, 0.08)',
    ready: true,
  },
  {
    label: 'Access Control',
    description: 'User management, role assignments, quarterly access review, RBAC verification.',
    href: '/admin/access-control',
    icon: Shield,
    color: 'rgba(59, 130, 246, 0.08)',
    ready: true,
  },
  {
    label: 'Notification Preferences',
    description: 'Email, SMS, and in-app notification settings per event type.',
    href: '/admin',
    icon: Bell,
    color: 'rgba(245, 158, 11, 0.08)',
    ready: false,
  },
  {
    label: 'State Regulatory Config',
    description: 'Agency contacts, DMR system settings, and state-specific rules.',
    href: '/admin',
    icon: MapPin,
    color: 'rgba(16, 185, 129, 0.08)',
    ready: false,
  },
] as const;

export function Admin() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-slate-500/10 p-2.5">
          <Settings className="h-6 w-6 text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Administration
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            System configuration, user management, and compliance audit tools.
          </p>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {ADMIN_CARDS.map((card) => {
          const Icon = card.icon;

          if (!card.ready) {
            return (
              <div
                key={card.label}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-6 opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/[0.05] p-2">
                    <Icon className="h-5 w-5 text-text-muted" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-secondary">{card.label}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-text-muted">Coming Soon</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-text-muted">{card.description}</p>
              </div>
            );
          }

          return (
            <Link key={card.label} to={card.href}>
              <SpotlightCard
                spotlightColor={card.color}
                className="h-full p-6 transition-all hover:border-white/[0.12]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/[0.05] p-2">
                    <Icon className="h-5 w-5 text-text-secondary" />
                  </div>
                  <h3 className="text-sm font-semibold text-text-primary">{card.label}</h3>
                </div>
                <p className="mt-3 text-xs text-text-muted">{card.description}</p>
              </SpotlightCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

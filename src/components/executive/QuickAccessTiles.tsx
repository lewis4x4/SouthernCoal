import { Link } from 'react-router-dom';
import {
  Upload, ClipboardList, FileText, Activity, DollarSign,
  MapPin, ClipboardCheck,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import type { Role } from '@/types/auth';

type Tile = {
  title: string;
  description: string;
  href: string;
  icon: typeof Upload;
  gradient: string;
  roles: Role[];
};

const TILES: Tile[] = [
  {
    title: 'Upload Documents',
    description: 'Process permits, lab data, and compliance reports',
    href: '/compliance',
    icon: Upload,
    gradient: 'from-blue-600 to-blue-500',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager', 'lab_tech'],
  },
  {
    title: 'View Obligations',
    description: 'Track Consent Decree requirements and deadlines',
    href: '/obligations',
    icon: ClipboardList,
    gradient: 'from-purple-600 to-purple-500',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager'],
  },
  {
    title: 'Generate Reports',
    description: 'Create DMRs and quarterly EPA submissions',
    href: '/reports',
    icon: FileText,
    gradient: 'from-emerald-600 to-emerald-500',
    roles: ['admin', 'executive', 'environmental_manager'],
  },
  {
    title: 'View Penalties',
    description: 'Failure to Sample penalty tracking and trends',
    href: '/compliance/failure-to-sample',
    icon: DollarSign,
    gradient: 'from-red-600 to-red-500',
    roles: ['admin', 'executive', 'environmental_manager'],
  },
  {
    title: 'Check Alerts',
    description: 'Monitor exceedances and real-time violations',
    href: '/monitoring',
    icon: Activity,
    gradient: 'from-orange-600 to-orange-500',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager'],
  },
  {
    title: 'Field Queue',
    description: 'Manage sampling assignments and dispatch',
    href: '/field/dispatch',
    icon: MapPin,
    gradient: 'from-teal-600 to-teal-500',
    roles: ['field_sampler', 'site_manager', 'environmental_manager', 'executive', 'admin'],
  },
  {
    title: 'Corrective Actions',
    description: 'Track and resolve compliance issues',
    href: '/corrective-actions',
    icon: ClipboardCheck,
    gradient: 'from-cyan-600 to-cyan-500',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager', 'safety_manager', 'field_sampler'],
  },
];

export function QuickAccessTiles() {
  const { getEffectiveRole } = usePermissions();
  const role = getEffectiveRole();

  const visibleTiles = TILES.filter((tile) => tile.roles.includes(role));

  if (visibleTiles.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-text-primary">Quick Access</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {visibleTiles.map((tile) => {
          const Icon = tile.icon;

          return (
            <Link
              key={tile.href}
              to={tile.href}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-crystal-surface/50 to-crystal-surface/20 p-6 backdrop-blur-xl transition-all hover:scale-[1.02] hover:border-white/[0.12]"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${tile.gradient} opacity-0 transition-opacity group-hover:opacity-10`}
              />

              <div className={`mb-4 inline-flex rounded-lg bg-gradient-to-br ${tile.gradient} p-3`}>
                <Icon className="h-6 w-6 text-white" />
              </div>

              <h3 className="mb-1 text-base font-semibold text-text-primary">{tile.title}</h3>
              <p className="text-sm text-text-muted">{tile.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

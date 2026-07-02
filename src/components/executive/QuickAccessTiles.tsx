import { Link } from 'react-router-dom';
import {
  Upload, ClipboardList, FileText, Activity, DollarSign,
  MapPin, ClipboardCheck, CloudRain, AlertTriangle, Scale, Shield,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import {
  COMPLIANCE_UPLOAD_ROLES,
  COMPLIANCE_ADVANCED_ROLES,
  PENALTY_LEDGER_ROLES,
  COUNSEL_EVIDENCE_ROLES,
} from '@/lib/rbac';
import type { Role } from '@/types/auth';

type Tile = {
  title: string;
  description: string;
  href: string;
  icon: typeof Upload;
  accent: string;
  roles: Role[];
};

const TILES: Tile[] = [
  {
    title: 'Upload Documents',
    description: 'Process permits, lab data, and compliance reports',
    href: '/compliance',
    icon: Upload,
    accent: 'bg-qo-accent',
    roles: COMPLIANCE_UPLOAD_ROLES,
  },
  {
    title: 'View Obligations',
    description: 'Track Consent Decree requirements and deadlines',
    href: '/obligations',
    icon: ClipboardList,
    accent: 'bg-qo-sidebar',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager'],
  },
  {
    title: 'Generate Reports',
    description: 'Create DMRs and quarterly EPA submissions',
    href: '/reports',
    icon: FileText,
    accent: 'bg-qo-sage',
    roles: ['admin', 'executive', 'environmental_manager'],
  },
  {
    title: 'View Penalties',
    description: 'Failure to Sample penalty tracking and trends',
    href: '/compliance/failure-to-sample',
    icon: DollarSign,
    accent: 'bg-qo-risk',
    roles: ['admin', 'executive', 'environmental_manager'],
  },
  {
    title: 'Check Alerts',
    description: 'Monitor exceedances and real-time violations',
    href: '/monitoring',
    icon: Activity,
    accent: 'bg-qo-ochre',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager'],
  },
  {
    title: 'Field Queue',
    description: 'Manage sampling assignments and dispatch',
    href: '/field/dispatch',
    icon: MapPin,
    accent: 'bg-qo-sage',
    roles: ['field_sampler', 'site_manager', 'environmental_manager', 'executive', 'admin'],
  },
  {
    title: 'Corrective Actions',
    description: 'Track and resolve compliance issues',
    href: '/corrective-actions',
    icon: ClipboardCheck,
    accent: 'bg-qo-accent',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager', 'safety_manager', 'field_sampler'],
  },
  {
    title: 'Rain Events',
    description: 'Weather alerts and precipitation monitoring',
    href: '/weather/alerts',
    icon: CloudRain,
    accent: 'bg-qo-ochre',
    roles: ['admin', 'executive', 'environmental_manager', 'site_manager', 'wv_supervisor', 'coo'],
  },
  {
    title: 'Missed Sampling',
    description: 'Calendar-gap detection and at-risk events',
    href: '/compliance/missed-at-risk',
    icon: AlertTriangle,
    accent: 'bg-qo-ochre',
    roles: COMPLIANCE_ADVANCED_ROLES,
  },
  {
    title: 'Penalty Ledger',
    description: 'Draft stipulated-penalty exposure by source',
    href: '/compliance/penalty-ledger',
    icon: Scale,
    accent: 'bg-qo-risk',
    roles: PENALTY_LEDGER_ROLES,
  },
  {
    title: 'Defensible Miss',
    description: 'Counsel review packets for missed events',
    href: '/compliance/defensible-miss',
    icon: Shield,
    accent: 'bg-qo-accent',
    roles: COUNSEL_EVIDENCE_ROLES,
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
              className="group rounded-qo border border-black/[0.08] bg-white p-6 transition-colors hover:border-black/[0.12] hover:bg-qo-nested"
            >
              <div className={`mb-4 inline-flex rounded-[9px] ${tile.accent} p-3`}>
                <Icon className="h-6 w-6 text-[#F4EFE6]" />
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

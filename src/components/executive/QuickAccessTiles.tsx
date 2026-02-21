import { Link } from 'react-router-dom';
import { Upload, ClipboardList, FileText, Activity, DollarSign } from 'lucide-react';

const TILES = [
  {
    title: 'Upload Documents',
    description: 'Process permits, lab data, and compliance reports',
    href: '/compliance',
    icon: Upload,
    gradient: 'from-blue-600 to-blue-500',
  },
  {
    title: 'View Obligations',
    description: 'Track Consent Decree requirements and deadlines',
    href: '/obligations',
    icon: ClipboardList,
    gradient: 'from-purple-600 to-purple-500',
  },
  {
    title: 'Generate Reports',
    description: 'Create DMRs and quarterly EPA submissions',
    href: '/reports',
    icon: FileText,
    gradient: 'from-emerald-600 to-emerald-500',
  },
  {
    title: 'View Penalties',
    description: 'Failure to Sample penalty tracking and trends',
    href: '/compliance/failure-to-sample',
    icon: DollarSign,
    gradient: 'from-red-600 to-red-500',
  },
  {
    title: 'Check Alerts',
    description: 'Monitor exceedances and real-time violations',
    href: '/monitoring',
    icon: Activity,
    gradient: 'from-orange-600 to-orange-500',
  },
] as const;

export function QuickAccessTiles() {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-text-primary">Quick Access</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TILES.map((tile) => {
          const Icon = tile.icon;

          return (
            <Link
              key={tile.href}
              to={tile.href}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-crystal-surface/50 to-crystal-surface/20 p-6 backdrop-blur-xl transition-all hover:scale-[1.02] hover:border-white/[0.12]"
            >
              {/* Gradient hover overlay */}
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

import type { LucideIcon } from 'lucide-react';
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
  FileEdit,
  Map,
  MapPin,
  Route,
  ShieldAlert,
  DollarSign,
  Satellite,
  CalendarDays,
} from 'lucide-react';
import type { Role } from '@/types/auth';
import {
  ALL_ROLES,
  COMPLIANCE_UPLOAD_ROLES,
  COMPLIANCE_FULL_ROLES,
  COMPLIANCE_ADVANCED_ROLES,
  CORRECTIVE_ACTION_ROLES,
  REPORTING_ROLES,
  ADMIN_ROLES,
  FIELD_ROUTE_ROLES,
  FIELD_SCHEDULE_ROLES,
  GOVERNANCE_ROUTE_ROLES,
} from '@/lib/rbac';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
  activeColor: string;
  hoverColor: string;
  accentColor: string;
};

/**
 * Main app navigation — shared by Sidebar and FieldShell (mobile “More” menu).
 * When adding a route, update APP_ROUTES and this list per RBAC checklist.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { label: 'Home', href: '/dashboard', icon: Home, roles: ALL_ROLES },
      { label: 'Search', href: '/search', icon: Search, roles: ALL_ROLES },
    ],
    activeColor: 'bg-white/10 text-white shadow-lg shadow-white/5',
    hoverColor: 'hover:text-text-secondary',
    accentColor: 'border-white/20',
  },
  {
    label: 'Field Ops',
    items: [
      { label: 'Sampling Calendar', href: '/field/schedule', icon: CalendarDays, roles: FIELD_SCHEDULE_ROLES },
      { label: "Today's route", href: '/field/route', icon: Route, roles: FIELD_ROUTE_ROLES },
      { label: 'Field Queue', href: '/field/dispatch', icon: MapPin, roles: FIELD_ROUTE_ROLES },
      { label: 'Governance', href: '/governance/issues', icon: ShieldAlert, roles: GOVERNANCE_ROUTE_ROLES },
    ],
    activeColor: 'bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-500/5',
    hoverColor: 'hover:text-emerald-400',
    accentColor: 'border-emerald-500/30',
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Upload', href: '/compliance', icon: Upload, roles: COMPLIANCE_UPLOAD_ROLES },
      { label: 'Obligations', href: '/obligations', icon: ClipboardList, roles: COMPLIANCE_FULL_ROLES },
      { label: 'Coverage', href: '/coverage', icon: Grid3X3, roles: COMPLIANCE_FULL_ROLES },
      { label: 'Monitoring', href: '/monitoring', icon: Activity, roles: COMPLIANCE_FULL_ROLES },
      { label: 'Failure to Sample', href: '/compliance/failure-to-sample', icon: DollarSign, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'Review', href: '/compliance/review-queue', icon: ShieldAlert, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'ECHO Data', href: '/compliance/external-data', icon: Satellite, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'Actions', href: '/corrective-actions', icon: ClipboardCheck, roles: CORRECTIVE_ACTION_ROLES },
    ],
    activeColor: 'bg-cyan-500/15 text-cyan-300 shadow-lg shadow-cyan-500/5',
    hoverColor: 'hover:text-cyan-400',
    accentColor: 'border-cyan-500/30',
  },
  {
    label: 'Reporting',
    items: [
      { label: 'Reports', href: '/reports', icon: FileText, roles: REPORTING_ROLES },
      { label: 'Corrections', href: '/corrections', icon: FileEdit, roles: REPORTING_ROLES },
    ],
    activeColor: 'bg-amber-500/15 text-amber-300 shadow-lg shadow-amber-500/5',
    hoverColor: 'hover:text-amber-400',
    accentColor: 'border-amber-500/30',
  },
  {
    label: 'Admin',
    items: [
      { label: 'Roadmap', href: '/roadmap', icon: Map, roles: ADMIN_ROLES },
      { label: 'Admin', href: '/admin', icon: Settings, roles: ADMIN_ROLES },
    ],
    activeColor: 'bg-purple-500/15 text-purple-300 shadow-lg shadow-purple-500/5',
    hoverColor: 'hover:text-purple-400',
    accentColor: 'border-purple-500/30',
  },
];

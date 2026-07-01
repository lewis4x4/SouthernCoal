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
  AlertTriangle,
  Clock,
  Shield,
  DollarSign,
  Satellite,
  CalendarDays,
  Bell,
  Award,
  Wrench,
  AlertOctagon,
  BarChart3,
  Scale,
  FileCheck,
  Siren,
  HeartPulse,
  Rocket,
  CloudRain,
  Archive,
  FolderInput,
} from 'lucide-react';
import type { Role } from '@/types/auth';
import {
  ALL_ROLES,
  COMPLIANCE_UPLOAD_ROLES,
  COMPLIANCE_FULL_ROLES,
  COMPLIANCE_ADVANCED_ROLES,
  COUNSEL_EVIDENCE_ROLES,
  PENALTY_LEDGER_ROLES,
  CORRECTIVE_ACTION_ROLES,
  CA_ANALYTICS_ROLES,
  DMR_SUBMISSION_ROLES,
  WORK_ORDER_ROLES,
  COMPLIANCE_DB_ROLES,
  EXECUTIVE_DASHBOARD_ROLES,
  REPORT_SCHEDULE_ROLES,
  REPORTING_ROLES,
  ADMIN_ROLES,
  ADMIN_ONLY_ROLES,
  FIELD_ROUTE_ROLES,
  FIELD_SCHEDULE_ROLES,
  GOVERNANCE_ROUTE_ROLES,
  NOTIFICATION_ADMIN_ROLES,
  TRAINING_ADMIN_ROLES,
  EQUIPMENT_ADMIN_ROLES,
  INCIDENT_ROLES,
  AUDIT_READINESS_ROLES,
  EMERGENCY_ROLES,
  SYSTEM_HEALTH_ROLES,
  GO_LIVE_ROLES,
  RAIN_EVENT_CONFIG_ROLES,
  RAIN_EVENT_ALERT_ROLES,
  RAIN_EVENT_VIEW_ROLES,
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
    activeColor: 'bg-qo-accent/15 text-qo-sidebar-text',
    hoverColor: 'hover:text-qo-sidebar-text',
    accentColor: 'border-qo-accent/40',
  },
  {
    label: 'Field Ops',
    items: [
      { label: 'Sampling Calendar', href: '/field/schedule', icon: CalendarDays, roles: FIELD_SCHEDULE_ROLES },
      { label: "Today's route", href: '/field/route', icon: Route, roles: FIELD_ROUTE_ROLES },
      { label: 'Field Queue', href: '/field/dispatch', icon: MapPin, roles: FIELD_ROUTE_ROLES },
      { label: 'Work Orders', href: '/work-orders', icon: ClipboardList, roles: WORK_ORDER_ROLES },
      { label: 'Governance', href: '/governance/issues', icon: ShieldAlert, roles: GOVERNANCE_ROUTE_ROLES },
      { label: 'Emergency', href: '/emergency', icon: Siren, roles: EMERGENCY_ROLES },
    ],
    activeColor: 'bg-qo-sage/15 text-qo-sidebar-text',
    hoverColor: 'hover:text-qo-sage',
    accentColor: 'border-qo-sage/40',
  },
  {
    label: 'Weather',
    items: [
      { label: 'Stations', href: '/weather/stations', icon: Satellite, roles: RAIN_EVENT_CONFIG_ROLES },
      { label: 'Rain Events', href: '/weather/alerts', icon: CloudRain, roles: RAIN_EVENT_ALERT_ROLES },
      { label: 'Precipitation', href: '/weather/data', icon: BarChart3, roles: RAIN_EVENT_VIEW_ROLES },
    ],
    activeColor: 'bg-qo-sage/15 text-qo-sidebar-text',
    hoverColor: 'hover:text-qo-sage',
    accentColor: 'border-qo-sage/40',
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Upload', href: '/compliance', icon: Upload, roles: COMPLIANCE_UPLOAD_ROLES },
      { label: 'Obligations', href: '/obligations', icon: ClipboardList, roles: COMPLIANCE_FULL_ROLES },
      { label: 'Coverage', href: '/coverage', icon: Grid3X3, roles: COMPLIANCE_FULL_ROLES },
      { label: 'Monitoring', href: '/monitoring', icon: Activity, roles: COMPLIANCE_FULL_ROLES },
      { label: 'Failure to Sample', href: '/compliance/failure-to-sample', icon: DollarSign, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'Missed / At-Risk', href: '/compliance/missed-at-risk', icon: AlertTriangle, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'Late / Incomplete EDD', href: '/compliance/late-incomplete-edd', icon: Clock, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'Penalty Ledger', href: '/compliance/penalty-ledger', icon: Scale, roles: PENALTY_LEDGER_ROLES },
      { label: 'Defensible Miss', href: '/compliance/defensible-miss', icon: Shield, roles: COUNSEL_EVIDENCE_ROLES },
      { label: 'Review', href: '/compliance/review-queue', icon: ShieldAlert, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'ECHO Data', href: '/compliance/external-data', icon: Satellite, roles: COMPLIANCE_ADVANCED_ROLES },
      { label: 'Incidents', href: '/incidents', icon: AlertOctagon, roles: INCIDENT_ROLES },
      { label: 'Actions', href: '/corrective-actions', icon: ClipboardCheck, roles: CORRECTIVE_ACTION_ROLES },
      { label: 'CA Analytics', href: '/corrective-actions/analytics', icon: BarChart3, roles: CA_ANALYTICS_ROLES },
      { label: 'DMR Submissions', href: '/dmr', icon: FileText, roles: DMR_SUBMISSION_ROLES },
      { label: 'Violations', href: '/compliance/violations', icon: ShieldAlert, roles: COMPLIANCE_DB_ROLES },
      { label: 'Dashboard', href: '/compliance/dashboard', icon: BarChart3, roles: EXECUTIVE_DASHBOARD_ROLES },
    ],
    activeColor: 'bg-qo-accent/15 text-qo-sidebar-text',
    hoverColor: 'hover:text-qo-accent-soft',
    accentColor: 'border-qo-accent/40',
  },
  {
    label: 'Audit',
    items: [
      { label: 'Checklists', href: '/audit/checklists', icon: ClipboardCheck, roles: AUDIT_READINESS_ROLES },
      { label: 'Documents', href: '/audit/documents', icon: FileCheck, roles: AUDIT_READINESS_ROLES },
      { label: 'Evidence', href: '/audit/evidence', icon: Scale, roles: AUDIT_READINESS_ROLES },
    ],
    activeColor: 'bg-qo-accent/15 text-qo-sidebar-text',
    hoverColor: 'hover:text-qo-accent-soft',
    accentColor: 'border-qo-accent/40',
  },
  {
    label: 'Reporting',
    items: [
      { label: 'Reports', href: '/reports', icon: FileText, roles: REPORTING_ROLES },
      { label: 'Corrections', href: '/corrections', icon: FileEdit, roles: REPORTING_ROLES },
    ],
    activeColor: 'bg-qo-ochre/15 text-qo-sidebar-text',
    hoverColor: 'hover:text-qo-ochre',
    accentColor: 'border-qo-ochre/40',
  },
  {
    label: 'Admin',
    items: [
      { label: 'Roadmap', href: '/roadmap', icon: Map, roles: ADMIN_ROLES },
      { label: 'Admin', href: '/admin', icon: Settings, roles: ADMIN_ROLES },
      { label: 'Notifications', href: '/admin/notifications', icon: Bell, roles: NOTIFICATION_ADMIN_ROLES },
      { label: 'Training', href: '/admin/training', icon: Award, roles: TRAINING_ADMIN_ROLES },
      { label: 'Equipment', href: '/admin/equipment', icon: Wrench, roles: EQUIPMENT_ADMIN_ROLES },
      { label: 'Scheduled Reports', href: '/admin/scheduled-reports', icon: FileText, roles: REPORT_SCHEDULE_ROLES },
      { label: 'System Health', href: '/admin/system-health', icon: HeartPulse, roles: SYSTEM_HEALTH_ROLES },
      { label: 'Go-Live', href: '/admin/go-live', icon: Rocket, roles: GO_LIVE_ROLES },
      { label: 'Cutover', href: '/admin/cutover', icon: FolderInput, roles: ADMIN_ONLY_ROLES },
      { label: 'Archive', href: '/admin/archive', icon: Archive, roles: ADMIN_ONLY_ROLES },
    ],
    activeColor: 'bg-qo-accent/15 text-qo-sidebar-text',
    hoverColor: 'hover:text-qo-accent-soft',
    accentColor: 'border-qo-accent/40',
  },
];

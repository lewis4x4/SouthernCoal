import type { Role } from '@/types/auth';

/**
 * RBAC role-group constants — single source of truth.
 *
 * Used by App.tsx (route guards), Sidebar.tsx (nav filtering),
 * QuickAccessTiles.tsx, and Dashboard.tsx (role switching).
 *
 * ADDING A NEW PAGE CHECKLIST:
 *  1. Pick the role group below (or create a new one here).
 *  2. Add a RouteConfig entry in APP_ROUTES (App.tsx) with `roles`.
 *  3. Add a NavItem in NAV_GROUPS (`src/lib/navGroups.ts`) with `roles`.
 *  4. TypeScript will refuse to compile if `roles` is missing.
 */

export const ALL_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'safety_manager', 'field_sampler', 'lab_tech', 'read_only',
  // Phase 2 — expanded roles
  'wv_supervisor', 'float_sampler', 'courier', 'compliance_reviewer',
  'coo', 'ceo_view', 'chief_counsel', 'maintenance_owner', 'lab_liaison',
];

export const COMPLIANCE_UPLOAD_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager', 'lab_tech',
  'coo', 'compliance_reviewer', 'lab_liaison',
];

export const COMPLIANCE_FULL_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'coo', 'compliance_reviewer',
];

export const COMPLIANCE_ADVANCED_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
  'coo', 'compliance_reviewer',
];

export const CORRECTIVE_ACTION_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager', 'safety_manager', 'field_sampler',
  'coo', 'wv_supervisor', 'compliance_reviewer', 'maintenance_owner',
];

export const REPORTING_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
  'coo', 'ceo_view', 'chief_counsel',
];

export const ADMIN_ROLES: Role[] = ['admin', 'executive', 'coo'];

export const ADMIN_ONLY_ROLES: Role[] = ['admin'];

export const FIELD_ROUTE_ROLES: Role[] = [
  'field_sampler', 'site_manager', 'environmental_manager', 'executive', 'admin',
  'wv_supervisor', 'float_sampler',
];

export const FIELD_SCHEDULE_ROLES: Role[] = [
  'site_manager', 'environmental_manager', 'executive', 'admin',
  'wv_supervisor', 'coo',
];

export const GOVERNANCE_ROUTE_ROLES: Role[] = [
  'environmental_manager', 'executive', 'admin',
  'coo', 'ceo_view', 'chief_counsel', 'compliance_reviewer',
];

export const AUDIT_LOG_ROUTE_ROLES: Role[] = [
  'environmental_manager', 'executive', 'admin',
  'coo', 'chief_counsel',
];

export const NOTIFICATION_ADMIN_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
  'coo',
];

export const TRAINING_ADMIN_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'coo', 'wv_supervisor',
];

export const EQUIPMENT_ADMIN_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'coo', 'wv_supervisor', 'maintenance_owner',
];

export const INCIDENT_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'safety_manager', 'field_sampler',
  'coo', 'wv_supervisor', 'compliance_reviewer', 'chief_counsel',
  'maintenance_owner',
];

export const CA_ANALYTICS_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
  'coo', 'compliance_reviewer',
];

export const DMR_SUBMISSION_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'coo', 'compliance_reviewer', 'lab_liaison',
];

export const WORK_ORDER_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'safety_manager', 'wv_supervisor', 'maintenance_owner',
];

export const COMPLIANCE_DB_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
  'coo', 'compliance_reviewer', 'chief_counsel',
];

export const LEGAL_HOLD_ROLES: Role[] = [
  'admin', 'chief_counsel', 'coo',
];

export const EXECUTIVE_DASHBOARD_ROLES: Role[] = [
  'admin', 'executive', 'coo', 'ceo_view', 'chief_counsel',
];

export const REPORT_SCHEDULE_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'coo',
];

export const AUDIT_READINESS_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
  'coo', 'chief_counsel', 'compliance_reviewer',
];

export const EMERGENCY_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'safety_manager', 'coo', 'chief_counsel', 'wv_supervisor',
];

export const SYSTEM_HEALTH_ROLES: Role[] = [
  'admin', 'coo',
];

export const GO_LIVE_ROLES: Role[] = [
  'admin', 'coo', 'executive', 'chief_counsel',
];

export const PROFILE_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
  'safety_manager', 'field_sampler', 'lab_tech',
  'wv_supervisor', 'float_sampler', 'courier',
  'compliance_reviewer', 'coo', 'ceo_view', 'chief_counsel',
  'maintenance_owner', 'lab_liaison',
];

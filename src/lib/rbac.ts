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
];

export const COMPLIANCE_UPLOAD_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager', 'lab_tech',
];

export const COMPLIANCE_FULL_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager',
];

export const COMPLIANCE_ADVANCED_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
];

export const CORRECTIVE_ACTION_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager', 'site_manager', 'safety_manager', 'field_sampler',
];

export const REPORTING_ROLES: Role[] = [
  'admin', 'executive', 'environmental_manager',
];

export const ADMIN_ROLES: Role[] = ['admin', 'executive'];

export const ADMIN_ONLY_ROLES: Role[] = ['admin'];

export const FIELD_ROUTE_ROLES: Role[] = [
  'field_sampler', 'site_manager', 'environmental_manager', 'executive', 'admin',
];

export const FIELD_SCHEDULE_ROLES: Role[] = [
  'site_manager', 'environmental_manager', 'executive', 'admin',
];

export const GOVERNANCE_ROUTE_ROLES: Role[] = [
  'environmental_manager', 'executive', 'admin',
];

export const AUDIT_LOG_ROUTE_ROLES: Role[] = [
  'environmental_manager', 'executive', 'admin',
];

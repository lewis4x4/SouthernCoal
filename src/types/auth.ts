export const ROLES = [
  'executive',
  'site_manager',
  'environmental_manager',
  'safety_manager',
  'field_sampler',
  'lab_tech',
  'admin',
  'read_only',
] as const;

export type Role = (typeof ROLES)[number];

export interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  organization_id: string;
  created_at: string;
}

/** From user_role_assignments table — roles can be global or site-scoped */
export interface RoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  role_name: Role;
  site_id: string | null; // null = global assignment
  created_at: string;
}

export type Permission =
  | 'view'
  | 'upload'
  | 'process'
  | 'retry'
  | 'bulk_process'
  | 'export'
  | 'verify'
  | 'set_expected'
  | 'command_palette'
  | 'search'
  // Corrective Action permissions
  | 'ca_view'
  | 'ca_edit'
  | 'ca_advance_workflow'
  | 'ca_sign_responsible'
  | 'ca_sign_approver'
  | 'ca_reopen'
  | 'ca_generate_pdf';

export const ROLES = [
  'executive',
  'site_manager',
  'environmental_manager',
  'safety_manager',
  'field_sampler',
  'lab_tech',
  'admin',
  'read_only',
  // Phase 2 — expanded roles
  'wv_supervisor',
  'float_sampler',
  'courier',
  'compliance_reviewer',
  'coo',
  'ceo_view',
  'chief_counsel',
  'maintenance_owner',
  'lab_liaison',
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
  | 'ca_generate_pdf'
  // Phase 2 — governance & classification permissions
  | 'governance_review'
  | 'governance_decide'
  | 'classify_records'
  | 'legal_hold'
  | 'dispatch_override';

/** 6-level record classification per Phase 2 spec. */
export type RecordClassification =
  | 'operational_internal'
  | 'compliance_sensitive'
  | 'privileged'
  | 'public_eligible'
  | 'regulator_shareable'
  | 'restricted';

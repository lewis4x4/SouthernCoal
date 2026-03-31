export type FieldVisitStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type FieldVisitOutcome = 'sample_collected' | 'no_discharge' | 'access_issue';
export type GovernanceIssueType = 'access_issue' | 'potential_force_majeure';
export type GovernanceIssueStatus = 'open' | 'under_review' | 'decision_recorded' | 'closed';

export interface FieldOpsUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  role_name: string | null;
}

export interface PermitOption {
  id: string;
  permit_number: string;
  state_code: string | null;
  permittee_name: string | null;
}

export interface OutfallOption {
  id: string;
  permit_id: string;
  outfall_number: string;
}

export interface FieldVisitRecord {
  id: string;
  organization_id: string;
  permit_id: string;
  outfall_id: string;
  assigned_to: string;
  assigned_by: string;
  scheduled_date: string;
  visit_status: FieldVisitStatus;
  outcome: FieldVisitOutcome | null;
  started_at: string | null;
  completed_at: string | null;
  started_latitude: number | null;
  started_longitude: number | null;
  completed_latitude: number | null;
  completed_longitude: number | null;
  weather_conditions: string | null;
  field_notes: string | null;
  potential_force_majeure: boolean;
  potential_force_majeure_notes: string | null;
  linked_sampling_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldVisitListItem extends FieldVisitRecord {
  permit_number: string | null;
  outfall_number: string | null;
  assigned_to_name: string;
}

export interface OutletInspectionRecord {
  id: string;
  field_visit_id: string;
  flow_status: 'flowing' | 'no_flow' | 'obstructed' | 'unknown';
  signage_condition: string | null;
  pipe_condition: string | null;
  erosion_observed: boolean;
  obstruction_observed: boolean;
  obstruction_details: string | null;
  inspector_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FieldMeasurementRecord {
  id: string;
  field_visit_id: string;
  parameter_name: string;
  measured_value: number | null;
  measured_text: string | null;
  unit: string | null;
  measured_at: string;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface FieldEvidenceAssetRecord {
  id: string;
  organization_id: string;
  field_visit_id: string | null;
  governance_issue_id: string | null;
  evidence_type: 'photo' | 'document' | 'signature' | 'other';
  bucket: string;
  storage_path: string;
  uploaded_by: string;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_at: string;
}

export interface NoDischargeRecord {
  id: string;
  field_visit_id: string;
  narrative: string;
  observed_condition: string | null;
  obstruction_observed: boolean;
  obstruction_details: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AccessIssueRecord {
  id: string;
  field_visit_id: string;
  issue_type: string;
  obstruction_narrative: string;
  contact_attempted: boolean;
  contact_name: string | null;
  contact_outcome: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceIssueRecord {
  id: string;
  organization_id: string;
  field_visit_id: string | null;
  access_issue_id: string | null;
  issue_type: GovernanceIssueType;
  related_entity_type: 'field_visit' | 'access_issue';
  related_entity_id: string;
  related_outfall_id: string | null;
  related_permit_id: string | null;
  state_code: string;
  decree_paragraphs: string[];
  title: string;
  issue_summary: string;
  current_status: GovernanceIssueStatus;
  current_step: number;
  current_owner_name: string;
  current_owner_role: string;
  current_owner_user_id: string | null;
  raised_at: string;
  response_deadline: string | null;
  notice_deadline: string | null;
  written_deadline: string | null;
  final_disposition: string | null;
  final_decision_at: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceIssueEventRecord {
  id: string;
  governance_issue_id: string;
  event_type: 'created' | 'status_changed' | 'decision_recorded' | 'owner_changed' | 'note_added' | 'evidence_linked';
  from_status: string | null;
  to_status: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CompleteFieldVisitResult {
  linked_sampling_event_id: string | null;
  governance_issue_id: string | null;
}

export interface FieldVisitDetails {
  visit: FieldVisitListItem;
  inspection: OutletInspectionRecord | null;
  measurements: FieldMeasurementRecord[];
  evidence: FieldEvidenceAssetRecord[];
  noDischarge: NoDischargeRecord | null;
  accessIssue: AccessIssueRecord | null;
  governanceIssues: GovernanceIssueRecord[];
}

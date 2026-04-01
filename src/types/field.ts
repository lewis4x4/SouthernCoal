export type FieldVisitStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type FieldVisitOutcome = 'sample_collected' | 'no_discharge' | 'access_issue';
export type GovernanceIssueType = 'access_issue' | 'potential_force_majeure';
export type GovernanceIssueStatus = 'open' | 'under_review' | 'decision_recorded' | 'closed';
export type SamplingFrequencyCode = 'weekly' | 'monthly' | 'semi_monthly' | 'manual' | 'rain_event';
export type SamplingCalendarStatus = 'pending' | 'completed' | 'overdue' | 'skipped';
export type SamplingDispatchStatus = 'ready' | 'dispatched' | 'in_progress' | 'completed' | 'skipped' | 'exception';
export type SamplingCalendarAdjustmentType = 'manual_entry' | 'rain_event' | 'skip' | 'reschedule' | 'makeup';
export type SamplingRouteBatchStatus = 'draft' | 'dispatched' | 'in_progress' | 'completed' | 'exception' | 'cancelled';
export type SamplingRouteStopStatus = 'pending' | 'dispatched' | 'in_progress' | 'completed' | 'skipped' | 'exception';

export interface FieldOpsUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  role_name: string | null;
}

/** Permit row for field dispatch UI; `state_code` comes from `sites` → `states.code` (see `fetchSiteIdToStateCodeMap`). Filter uses `FIELD_DISPATCH_STATE_CODE`. */
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
  latitude: number | null;
  longitude: number | null;
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
  sampling_calendar_id: string | null;
  route_batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldVisitListItem extends FieldVisitRecord {
  permit_number: string | null;
  outfall_number: string | null;
  assigned_to_name: string;
  /** Stop order within a dispatched route batch (from sampling_route_stops). */
  route_stop_sequence: number | null;
  route_priority_rank?: number | null;
  route_priority_reason?: string | null;
  /** From `outfalls` when loaded; used for Maps links on visit detail. */
  outfall_latitude?: number | null;
  outfall_longitude?: number | null;
  /** Filled when saving offline route copy or loading visit detail; used offline on visit shell. */
  scheduled_parameter_label?: string | null;
  schedule_instructions?: string | null;
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

export interface ParameterOption {
  id: string;
  name: string;
  short_name: string;
  default_unit: string | null;
}

export interface SamplingScheduleRecord {
  id: string;
  organization_id: string;
  permit_id: string;
  outfall_id: string;
  parameter_id: string;
  frequency_code: string;
  frequency_description: string | null;
  sample_type: string;
  min_days_between_samples: number | null;
  max_samples_per_period: number | null;
  period_type: string | null;
  seasonal_restriction: string | null;
  condition_restriction: string | null;
  route_zone: string | null;
  default_assigned_to: string | null;
  schedule_anchor_date: string | null;
  preferred_day_of_week: number | null;
  preferred_day_of_month: number | null;
  secondary_day_of_month: number | null;
  instructions: string | null;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SamplingScheduleListItem extends SamplingScheduleRecord {
  permit_number: string | null;
  outfall_number: string | null;
  parameter_name: string | null;
  default_assigned_to_name: string | null;
}

export interface SamplingCalendarRecord {
  id: string;
  organization_id: string;
  schedule_id: string;
  outfall_id: string;
  parameter_id: string;
  scheduled_date: string;
  window_start: string | null;
  window_end: string | null;
  status: SamplingCalendarStatus;
  dispatch_status: SamplingDispatchStatus;
  current_field_visit_id: string | null;
  current_route_batch_id: string | null;
  sampling_event_id: string | null;
  skip_reason: string | null;
  override_reason: string | null;
  route_zone: string | null;
  default_assigned_to: string | null;
  source_calendar_id: string | null;
  reminder_sent: boolean | null;
  overdue_alert_sent: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface SamplingCalendarListItem extends SamplingCalendarRecord {
  permit_id: string;
  permit_number: string | null;
  outfall_number: string | null;
  parameter_name: string | null;
  frequency_code: string | null;
  sample_type: string | null;
  instructions: string | null;
  default_assigned_to_name: string | null;
  current_field_visit_status: FieldVisitStatus | null;
  current_field_visit_outcome: FieldVisitOutcome | null;
}

export interface SamplingCalendarAdjustmentRecord {
  id: string;
  organization_id: string;
  calendar_id: string;
  adjustment_type: SamplingCalendarAdjustmentType;
  prior_scheduled_date: string | null;
  new_scheduled_date: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface SamplingRouteBatchRecord {
  id: string;
  organization_id: string;
  route_date: string;
  route_zone: string;
  assigned_to: string | null;
  route_status: SamplingRouteBatchStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SamplingRouteBatchListItem extends SamplingRouteBatchRecord {
  assigned_to_name: string | null;
  stop_count: number;
  completed_stop_count: number;
  due_soon_stop_count: number;
}

export interface SamplingRouteStopRecord {
  id: string;
  route_batch_id: string;
  calendar_id: string;
  stop_sequence: number;
  priority_rank: number;
  priority_reason: string | null;
  estimated_drive_minutes: number | null;
  stop_status: SamplingRouteStopStatus;
  created_at: string;
  updated_at: string;
}

export interface SamplingRouteStopListItem extends SamplingRouteStopRecord {
  scheduled_date: string;
  route_zone: string | null;
  outfall_id: string | null;
  permit_number: string | null;
  outfall_number: string | null;
  parameter_name: string | null;
  dispatch_status: SamplingDispatchStatus;
  current_field_visit_id: string | null;
  current_field_visit_status: FieldVisitStatus | null;
}

export interface FieldVisitStopRequirement {
  calendar_id: string;
  schedule_id: string | null;
  parameter_id: string;
  parameter_name: string;
  parameter_short_name: string | null;
  parameter_label: string;
  category: string | null;
  default_unit: string | null;
  sample_type: string | null;
  schedule_instructions: string | null;
}

export interface FieldVisitRequiredMeasurement {
  key: string;
  parameter_name: string;
  display_label: string;
  default_unit: string | null;
  rationale: string;
  source_parameter_names: string[];
}

export type FieldVisitPhotoCategory =
  | 'outlet_signage'
  | 'flow_no_flow'
  | 'sample_containers'
  | 'obstruction_deficiency'
  | 'site_weather';

export type FieldVisitContainerCaptureMethod = 'scan' | 'manual';
export type FieldVisitContainerValidationStatus = 'match' | 'warning' | 'unknown';

export interface FieldVisitScannedContainer {
  raw_value: string;
  container_id: string;
  serial_id: string | null;
  bottle_type: string | null;
  preservative_hint: string | null;
}

export interface FieldVisitContainerValidation {
  status: FieldVisitContainerValidationStatus;
  blocking: boolean;
  message: string | null;
  guidance: string[];
  expected_bottle_types: string[];
  actual_bottle_type: string | null;
}

export interface FieldVisitPreviousContext {
  visit_id: string;
  scheduled_date: string;
  completed_at: string | null;
  outcome: FieldVisitOutcome | null;
  inspection_flow_status: OutletInspectionRecord['flow_status'] | null;
  signage_condition: string | null;
  pipe_condition: string | null;
  erosion_observed: boolean;
  obstruction_observed: boolean;
  obstruction_details: string | null;
  inspector_notes: string | null;
  access_issue_type: string | null;
  access_issue_narrative: string | null;
  no_discharge_narrative: string | null;
  field_notes: string | null;
  weather_conditions: string | null;
  photo_evidence_paths: string[];
}

export interface FieldVisitDetails {
  visit: FieldVisitListItem;
  inspection: OutletInspectionRecord | null;
  measurements: FieldMeasurementRecord[];
  evidence: FieldEvidenceAssetRecord[];
  noDischarge: NoDischargeRecord | null;
  accessIssue: AccessIssueRecord | null;
  governanceIssues: GovernanceIssueRecord[];
  /** Resolved from sampling_calendar.parameter_id → parameters when the visit is calendar-driven. */
  scheduled_parameter_label: string | null;
  /** From sampling_schedules.instructions via sampling_calendar.schedule_id when set. */
  schedule_instructions: string | null;
  stop_requirements: FieldVisitStopRequirement[];
  required_field_measurements: FieldVisitRequiredMeasurement[];
  previous_visit_context: FieldVisitPreviousContext | null;
}

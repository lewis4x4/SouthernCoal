/**
 * Database Table Type Definitions
 *
 * Types for tables created in recent migrations:
 * - parameter_aliases (20260217170001)
 * - outfall_aliases (20260217170002)
 * - permit_limits review fields (20260217170005)
 */

// ---------------------------------------------------------------------------
// Parameter Aliases (Migration 001)
// ---------------------------------------------------------------------------

/** Source context for where alias was discovered */
export type ParameterAliasSource =
  | 'lab_edd'
  | 'permit_sheet'
  | 'dmr'
  | 'netdmr'
  | 'osmre'
  | 'manual';

/** Parameter alias record — maps lab/permit variants to canonical parameters */
export interface ParameterAlias {
  id: string;
  parameter_id: string;
  alias: string;
  source: ParameterAliasSource | null;
  state_code: string | null;
  created_at: string;
}

/** Parameter alias with joined canonical parameter name */
export interface ParameterAliasWithName extends ParameterAlias {
  parameters: { name: string } | null;
}

// ---------------------------------------------------------------------------
// Outfall Aliases (Migration 002)
// ---------------------------------------------------------------------------

/** Source context for where alias was discovered */
export type OutfallAliasSource =
  | 'lab_edd'
  | 'permit_sheet'
  | 'dmr'
  | 'netdmr'
  | 'osmre'
  | 'manual';

/** Match method that created the alias */
export type OutfallMatchMethod =
  | 'exact'
  | 'zero_strip'
  | 'digits_only'
  | 'user_confirmed';

/** Outfall alias record — maps lab/permit outfall identifiers to canonical outfalls */
export interface OutfallAlias {
  id: string;
  outfall_id: string;
  alias: string;
  source: OutfallAliasSource | null;
  match_method: OutfallMatchMethod | null;
  organization_id: string;
  permit_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Permit Limits Review Status (Migration 005)
// ---------------------------------------------------------------------------

/** AI extraction trust layer statuses */
export type PermitLimitReviewStatus =
  | 'pending_review'
  | 'in_review'
  | 'verified'
  | 'disputed';

/** Source of limit data */
export type ExtractionSource =
  | 'ai_excel'
  | 'ai_pdf'
  | 'manual'
  | 'netdmr'
  | 'osmre';

/** Review fields added to permit_limits table */
export interface PermitLimitReviewFields {
  review_status: PermitLimitReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  extraction_confidence: number | null;
  extraction_source: ExtractionSource | null;
  import_batch_id: string | null;
}

// ---------------------------------------------------------------------------
// Category Types
// ---------------------------------------------------------------------------

/** Database key for file categories — single source of truth */
export type FileCategoryKey =
  | 'npdes_permit'
  | 'lab_data'
  | 'field_inspection'
  | 'quarterly_report'
  | 'dmr'
  | 'audit_report'
  | 'enforcement'
  | 'other';

// ---------------------------------------------------------------------------
// DMR Submissions (Migration 008)
// ---------------------------------------------------------------------------

/** Submission types for DMR reports */
export type DmrSubmissionType =
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'semi_annual';

/** Status of a DMR submission */
export type DmrSubmissionStatus =
  | 'draft'
  | 'pending_submission'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'amended';

/** EPA NODI (No Data Indicator) codes */
export type NodiCode =
  | 'C'  // No Discharge
  | '9'  // Conditional
  | 'N'  // No Data
  | 'B'  // Below Detection
  | 'E'  // Estimate
  | 'G'  // Greater Than
  | 'K'  // Actual Value
  | 'Q'  // Quantity
  | 'R'  // Rejected
  | 'T'  // Too numerous
  | 'U'  // Unable to measure
  | 'W'; // Waived

/** DMR submission record */
export interface DmrSubmission {
  id: string;
  organization_id: string;
  permit_id: string;
  monitoring_period_start: string;
  monitoring_period_end: string;
  submission_type: DmrSubmissionType;
  status: DmrSubmissionStatus;
  no_discharge: boolean;
  nodi_code: NodiCode | null;
  submitted_by: string | null;
  submitted_at: string | null;
  submission_confirmation: string | null;
  source_file_id: string | null;
  import_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// DMR Line Items (Migration 008)
// ---------------------------------------------------------------------------

/** Statistical base for DMR measurements */
export type DmrStatisticalBase =
  | 'minimum'
  | 'average'
  | 'maximum'
  | 'daily_maximum'
  | 'weekly_average'
  | 'monthly_average'
  | 'instantaneous'
  | 'sample_measurement';

/** Limit type for permit limits */
export type DmrLimitType =
  | 'daily_max'
  | 'weekly_avg'
  | 'monthly_avg'
  | 'instantaneous'
  | 'report_only';

/** DMR line item record — individual parameter measurement */
export interface DmrLineItem {
  id: string;
  submission_id: string;
  outfall_id: string;
  parameter_id: string;
  statistical_base: DmrStatisticalBase;
  limit_value: number | null;
  limit_unit: string | null;
  limit_type: DmrLimitType | null;
  measured_value: number | null;
  measured_unit: string | null;
  nodi_code: NodiCode | null;
  is_exceedance: boolean;
  exceedance_pct: number | null;
  sample_count: number | null;
  sample_frequency: string | null;
  storet_code: string | null;
  qualifier: string | null;
  comments: string | null;
  created_at: string;
}

/** DMR line item with joined relations for display */
export interface DmrLineItemWithRelations extends DmrLineItem {
  submission: {
    permit_id: string;
    monitoring_period_end: string;
    status: DmrSubmissionStatus;
  } | null;
  outfall: {
    outfall_id: string;
    permit_id: string;
  } | null;
  parameter: {
    name: string;
    short_name: string | null;
    storet_code: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Sampling Events (existing table)
// ---------------------------------------------------------------------------

/** Sampling event — one per outfall × date × time */
export interface SamplingEvent {
  id: string;
  outfall_id: string;
  site_id: string | null;
  sampled_by: string | null;
  sample_date: string;
  sample_time: string | null;
  sample_type: string | null;
  field_notes: string | null;
  weather_conditions: string | null;
  chain_of_custody_id: string | null;
  lab_name: string | null;
  lab_received_date: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  precipitation_event_id: string | null;
  is_precipitation_sample: boolean | null;
  precipitation_inches_24hr: number | null;
}

/** Sampling event with joined relations for display */
export interface SamplingEventWithRelations extends SamplingEvent {
  outfall: {
    outfall_id: string;
    permit_id: string;
  } | null;
  site: {
    name: string;
    organization_id: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Lab Results (existing table)
// ---------------------------------------------------------------------------

/** Lab result — individual parameter measurement */
export interface LabResult {
  id: string;
  sampling_event_id: string;
  parameter_id: string;
  result_value: number | null;
  result_text: string | null;
  unit: string | null;
  detection_limit: number | null;
  is_non_detect: boolean | null;
  qualifier: string | null;
  analyzed_date: string | null;
  method: string | null;
  created_at: string;
  updated_at: string;
  quantification_limit: number | null;
  minimum_level: number | null;
  method_detection_limit: number | null;
  hold_time_met: boolean | null;
  lab_qc_passed: boolean | null;
  duplicate_rpd: number | null;
  sample_matrix: string | null;
  import_id: string | null;
}

/** Lab result with joined relations for display */
export interface LabResultWithRelations extends LabResult {
  sampling_event: SamplingEvent | null;
  parameter: {
    name: string;
    short_name: string | null;
    storet_code: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Parsed Lab Data Types (from parse-lab-data-edd Edge Function)
// ---------------------------------------------------------------------------

/** Individual parsed record from lab EDD file */
export interface ParsedLabRecord {
  row_number: number;
  permittee_name: string;
  permit_number: string;
  site_name: string;
  site_state: string;
  site_county: string;
  lab_name: string;
  sampler: string;
  outfall_raw: string;
  outfall_matched: string | null;
  outfall_db_id: string | null;
  outfall_match_method: string | null;
  latitude: number | null;
  longitude: number | null;
  stream_name: string;
  sample_date: string | null;
  sample_time: string | null;
  analysis_date: string | null;
  parameter_raw: string;
  parameter_canonical: string;
  parameter_id: string | null;
  value: number | null;
  value_raw: string;
  unit: string;
  below_detection: boolean;
  data_qualifier: string | null;
  comments: string | null;
  hold_time_days: number | null;
  hold_time_compliant: boolean | null;
  is_duplicate: boolean;
}

/**
 * Extracted data envelope for lab_data_edd files
 * Stored in file_processing_queue.extracted_data
 * Contains both raw records for import AND summary fields for UI display
 */
export interface ExtractedLabData {
  document_type: 'lab_data_edd';

  // Raw records for import (used by import-lab-data Edge Function)
  records?: ParsedLabRecord[];
  import_id: string | null;

  // Parse metadata
  file_format?: string;
  column_count?: number;
  total_rows?: number;
  parsed_rows?: number;
  skipped_rows?: number;
  records_truncated?: boolean;

  // Summary fields for UI display
  permit_numbers?: string[];
  permit_number?: string;  // Legacy single permit
  states?: string[];
  sites?: string[];
  site_name?: string;  // Legacy single site
  date_range?: {
    earliest?: string | null;
    latest?: string | null;
    start?: string;
    end?: string;
  };
  lab_names?: string[];

  // Parameter summary
  parameters_found?: number;
  unique_parameters?: number;
  parameter_summary?: Array<{
    canonical_name: string;
    sample_count: number;
    below_detection_count: number;
  }>;

  // Outfall summary
  outfalls_found?: number;
  outfall_summary?: Array<{
    raw_name: string;
    matched_id: string | null;
    sample_count: number;
  }>;

  // Validation results
  warnings?: string[];
  validation_warnings?: string[];  // Legacy alias
  validation_errors?: Array<{ row: number; column: string; message: string }>;
  hold_time_violations?: Array<{
    row: number;
    parameter: string;
    outfall: string;
    sample_date: string;
    analysis_date: string;
    days_held: number;
    max_hold_days: number;
  }>;

  // Human-readable summary
  summary?: string;
}

// ---------------------------------------------------------------------------
// Extracted Parameter Sheet Types (from parse-parameter-sheet Edge Function)
// ---------------------------------------------------------------------------

/** Individual extracted limit from permit parameter sheet */
export interface ExtractedLimit {
  row_number: number;
  outfall_number: string;
  outfall_status: string;
  parameter_raw: string;
  parameter_id: string | null;
  parameter_canonical: string | null;
  limit_min: number | null;
  limit_avg: number | null;
  limit_max: number | null;
  is_range: boolean;
  range_min: number | null;
  range_max: number | null;
  unit: string;
  frequency: string;
  sample_type: string;
  is_report_only: boolean;
  is_not_constructed: boolean;
  extraction_confidence: number;
}

/** Extracted outfall metadata from permit parameter sheet */
export interface ExtractedOutfall {
  outfall_number: string;
  is_active: boolean;
  status_notes: string | null;
  limit_count: number;
}

/** Extracted permit data from parameter sheet tab */
export interface ExtractedPermit {
  permit_number: string;
  tab_name: string;
  subsidiary_name: string | null;
  address: string | null;
  outfalls: ExtractedOutfall[];
  limits: ExtractedLimit[];
}

/**
 * Extracted data envelope for npdes_permit parameter sheets
 * Stored in file_processing_queue.extracted_data
 * Contains both raw data for import AND summary fields for UI display
 */
export interface ExtractedParameterSheet {
  document_type: 'parameter_sheet';
  file_format: 'xlsx' | 'xls';
  state_code: string;
  total_tabs: number;
  valid_permit_tabs: number;
  skipped_tabs: string[];
  permits: ExtractedPermit[];
  summary: {
    total_permits: number;
    total_outfalls: number;
    total_limits: number;
    unmatched_parameters: string[];
    not_constructed_outfalls: number;
    report_only_limits: number;
    matched_parameters: number;
    unmatched_parameter_count: number;
  };
  warnings: string[];
  validation_errors: Array<{
    tab: string;
    row: number;
    column: string;
    message: string;
  }>;
  limits_truncated: boolean;
}

// ---------------------------------------------------------------------------
// Exceedance Types (Phase 3)
// ---------------------------------------------------------------------------

/** Severity levels for permit limit exceedances */
export type ExceedanceSeverity = 'minor' | 'moderate' | 'major' | 'critical';

/** Status of an exceedance investigation/resolution */
export type ExceedanceStatus =
  | 'open'
  | 'acknowledged'
  | 'under_investigation'
  | 'resolved'
  | 'false_positive';

/** Exceedance record — auto-detected permit limit violation */
export interface Exceedance {
  id: string;
  organization_id: string | null;
  lab_result_id: string;
  permit_limit_id: string;
  outfall_id: string;
  parameter_id: string;
  sample_date: string;
  result_value: number;
  limit_value: number;
  limit_type: string;
  unit: string;
  exceedance_pct: number | null;
  severity: ExceedanceSeverity;
  status: ExceedanceStatus;
  corrective_action_id: string | null;
  detected_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Exceedance with joined relations for display */
export interface ExceedanceWithRelations extends Exceedance {
  outfall: {
    outfall_number: string;
    permit_id: string;
  } | null;
  parameter: {
    name: string;
    short_name: string | null;
  } | null;
  lab_result: {
    sampling_event_id: string;
    unit: string | null;
  } | null;
  permit_limit: {
    limit_type: string;
    unit: string | null;
  } | null;
  corrective_action: {
    id: string;
    title: string;
    status: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Phase 8 — Work Orders
// ---------------------------------------------------------------------------

export type WorkOrderSourceType = 'field_deficiency' | 'inspection' | 'incident' | 'exceedance' | 'manual';
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'verified' | 'cancelled';
export type WorkOrderCategory =
  | 'equipment_repair' | 'erosion_control' | 'sediment_removal'
  | 'outfall_maintenance' | 'bmp_installation' | 'signage'
  | 'access_road' | 'vegetation' | 'structural' | 'other';

export interface WorkOrder {
  id: string;
  organization_id: string;
  source_type: WorkOrderSourceType;
  source_id: string | null;
  site_id: string | null;
  outfall_id: string | null;
  permit_id: string | null;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  category: WorkOrderCategory | null;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  due_date: string | null;
  sla_hours: number | null;
  completed_by: string | null;
  completed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  before_photo_path: string | null;
  after_photo_path: string | null;
  is_recurring: boolean;
  recurrence_count: number;
  previous_work_order_id: string | null;
  notes: string | null;
  decree_paragraphs: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkOrderEventType =
  | 'created' | 'assigned' | 'status_changed' | 'priority_changed'
  | 'note_added' | 'photo_uploaded' | 'reassigned' | 'completed'
  | 'verified' | 'cancelled' | 'reopened' | 'sla_warning' | 'sla_breach';

export interface WorkOrderEvent {
  id: string;
  work_order_id: string;
  event_type: WorkOrderEventType;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WorkOrderWithRelations extends WorkOrder {
  site_name?: string;
  outfall_display?: string;
  assigned_to_name?: string;
}

// ---------------------------------------------------------------------------
// Phase 8 — Compliance Violations
// ---------------------------------------------------------------------------

export type ViolationType =
  | 'permit_exceedance' | 'reporting_failure' | 'monitoring_failure'
  | 'discharge_violation' | 'bmp_failure' | 'consent_decree_violation'
  | 'spill' | 'unauthorized_discharge' | 'recordkeeping' | 'other';

export type ViolationSeverity = 'minor' | 'moderate' | 'major' | 'critical';
export type ViolationStatus = 'open' | 'under_investigation' | 'reported' | 'resolved' | 'closed';

export type RootCauseCategory =
  | 'equipment_failure' | 'human_error' | 'process_failure'
  | 'weather_event' | 'design_deficiency' | 'training_gap'
  | 'maintenance_lapse' | 'external_factor' | 'unknown' | 'other';

export interface ComplianceViolation {
  id: string;
  organization_id: string;
  exceedance_id: string | null;
  incident_id: string | null;
  corrective_action_id: string | null;
  site_id: string | null;
  permit_id: string | null;
  outfall_id: string | null;
  violation_type: ViolationType;
  violation_date: string;
  discovery_date: string | null;
  parameter_id: string | null;
  measured_value: number | null;
  limit_value: number | null;
  unit: string | null;
  exceedance_pct: number | null;
  severity: ViolationSeverity;
  status: ViolationStatus;
  root_cause: string | null;
  root_cause_category: RootCauseCategory | null;
  estimated_penalty: number | null;
  actual_penalty: number | null;
  penalty_paid_date: string | null;
  decree_paragraphs: string[] | null;
  regulatory_agency: string | null;
  state_code: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceViolationWithRelations extends ComplianceViolation {
  site_name?: string;
  permit_number?: string;
  parameter_name?: string;
  nov_count?: number;
  enforcement_count?: number;
}

// ---------------------------------------------------------------------------
// Phase 8 — NOV Records
// ---------------------------------------------------------------------------

export type NOVResponseStatus = 'pending' | 'drafting' | 'under_review' | 'submitted' | 'accepted' | 'appealed';

export interface NOVRecord {
  id: string;
  organization_id: string;
  violation_id: string | null;
  nov_number: string | null;
  issuing_agency: string;
  state_code: string | null;
  issued_date: string;
  received_date: string | null;
  response_due_date: string | null;
  response_submitted_date: string | null;
  response_status: NOVResponseStatus;
  description: string | null;
  alleged_violations: string | null;
  proposed_penalty: number | null;
  final_penalty: number | null;
  nov_document_path: string | null;
  response_document_path: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  decree_paragraphs: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 8 — Enforcement Actions
// ---------------------------------------------------------------------------

export type EnforcementActionType =
  | 'administrative_order' | 'consent_order' | 'compliance_schedule'
  | 'penalty_assessment' | 'injunctive_relief' | 'supplemental_environmental_project'
  | 'criminal_referral' | 'other';

export type EnforcementStatus = 'active' | 'in_compliance' | 'completed' | 'appealed' | 'vacated';

export interface EnforcementAction {
  id: string;
  organization_id: string;
  violation_id: string | null;
  nov_id: string | null;
  action_type: EnforcementActionType;
  issuing_agency: string;
  state_code: string | null;
  issued_date: string;
  effective_date: string | null;
  compliance_deadline: string | null;
  penalty_amount: number | null;
  penalty_paid: boolean;
  penalty_paid_date: string | null;
  status: EnforcementStatus;
  description: string | null;
  requirements: string | null;
  decree_paragraphs: string[] | null;
  document_path: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 8 — Human Overrides
// ---------------------------------------------------------------------------

export type OverrideEntityType =
  | 'exceedance' | 'classification' | 'escalation' | 'incident'
  | 'corrective_action' | 'dmr_line_item' | 'violation' | 'readiness_check';

export interface HumanOverride {
  id: string;
  organization_id: string;
  entity_type: OverrideEntityType;
  entity_id: string;
  field_name: string;
  original_value: string | null;
  override_value: string;
  reason: string;
  overridden_by: string;
  approved_by: string | null;
  approved_at: string | null;
  decree_paragraphs: string[] | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 8 — Legal Holds
// ---------------------------------------------------------------------------

export type LegalHoldEntityType =
  | 'exceedance' | 'incident' | 'corrective_action' | 'violation'
  | 'work_order' | 'dmr_submission' | 'governance_issue';

export type LegalHoldCategory = 'litigation' | 'investigation' | 'regulatory_inquiry' | 'audit' | 'other';

export interface LegalHold {
  id: string;
  organization_id: string;
  entity_type: LegalHoldEntityType;
  entity_id: string;
  hold_reason: string;
  hold_category: LegalHoldCategory;
  is_active: boolean;
  placed_by: string;
  placed_at: string;
  released_by: string | null;
  released_at: string | null;
  release_reason: string | null;
  decree_paragraphs: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 9 — Compliance Snapshots
// ---------------------------------------------------------------------------

export type SnapshotType = 'daily' | 'weekly' | 'monthly';

export interface ComplianceSnapshot {
  id: string;
  organization_id: string;
  snapshot_date: string;
  snapshot_type: SnapshotType;
  total_permits: number;
  active_permits: number;
  total_outfalls: number;
  active_outfalls: number;
  sampling_events_due: number;
  sampling_events_completed: number;
  sampling_compliance_pct: number;
  total_exceedances: number;
  open_exceedances: number;
  exceedance_rate_pct: number;
  total_violations: number;
  open_violations: number;
  critical_violations: number;
  total_corrective_actions: number;
  open_corrective_actions: number;
  overdue_corrective_actions: number;
  avg_ca_closure_days: number | null;
  total_work_orders: number;
  open_work_orders: number;
  overdue_work_orders: number;
  dmr_submissions_due: number;
  dmr_submissions_completed: number;
  dmr_submission_rate_pct: number;
  total_incidents: number;
  open_incidents: number;
  total_penalties: number;
  compliance_score: number;
  state_breakdown: StateBreakdownEntry[] | null;
  generated_by: string | null;
  created_at: string;
}

export interface StateBreakdownEntry {
  state: string;
  permits: number;
  outfalls: number;
  exceedances: number;
  violations: number;
}

export interface ComplianceTrendPoint {
  snapshot_date: string;
  compliance_score: number;
  sampling_compliance_pct: number;
  exceedance_rate_pct: number;
  open_violations: number;
  open_corrective_actions: number;
  open_work_orders: number;
  open_incidents: number;
  total_penalties: number;
}

// ---------------------------------------------------------------------------
// Phase 9 — KPI Targets
// ---------------------------------------------------------------------------

export type KPIDirection = 'above' | 'below';

export interface KPITarget {
  id: string;
  organization_id: string;
  kpi_key: string;
  display_name: string;
  description: string | null;
  target_value: number;
  warning_threshold: number | null;
  critical_threshold: number | null;
  direction: KPIDirection;
  unit: string | null;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 9 — Scheduled Reports
// ---------------------------------------------------------------------------

export type ReportType =
  | 'compliance_summary' | 'exceedance_detail' | 'sampling_status'
  | 'violation_summary' | 'ca_status' | 'work_order_status'
  | 'dmr_status' | 'executive_brief' | 'state_breakdown'
  | 'custom';

export type ReportOutputFormat = 'csv' | 'pdf' | 'markdown';

export interface ScheduledReport {
  id: string;
  organization_id: string;
  title: string;
  report_type: ReportType;
  description: string | null;
  output_format: ReportOutputFormat;
  schedule_cron: string | null;
  is_active: boolean;
  state_filter: string[] | null;
  site_filter: string[] | null;
  date_range_days: number | null;
  recipients: string[];
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ReportRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ReportTriggerType = 'manual' | 'scheduled' | 'api';

export interface ReportRun {
  id: string;
  scheduled_report_id: string;
  status: ReportRunStatus;
  started_at: string | null;
  completed_at: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  row_count: number | null;
  error_message: string | null;
  triggered_by: ReportTriggerType;
  triggered_by_user: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 10 — Audit Checklists
// ---------------------------------------------------------------------------

export type AuditType =
  | 'epa_inspection' | 'state_dep_audit' | 'consent_decree_review'
  | 'internal_audit' | 'msha_inspection' | 'osmre_inspection' | 'custom';

export type ChecklistStatus = 'draft' | 'active' | 'in_progress' | 'complete' | 'archived';

export interface AuditChecklist {
  id: string;
  organization_id: string;
  title: string;
  audit_type: AuditType;
  description: string | null;
  target_date: string | null;
  state_code: string | null;
  site_id: string | null;
  status: ChecklistStatus;
  total_items: number;
  completed_items: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ChecklistItemStatus = 'pending' | 'in_progress' | 'complete' | 'na' | 'blocked';

export interface AuditChecklistItem {
  id: string;
  checklist_id: string;
  category: string;
  item_text: string;
  description: string | null;
  sort_order: number;
  status: ChecklistItemStatus;
  assigned_to: string | null;
  due_date: string | null;
  evidence_notes: string | null;
  evidence_file_path: string | null;
  evidence_record_type: string | null;
  evidence_record_id: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 10 — Document Completeness
// ---------------------------------------------------------------------------

export type DocumentType =
  | 'permit_copy' | 'dmr_current' | 'dmr_archive' | 'sampling_schedule'
  | 'outfall_map' | 'site_map' | 'om_manual' | 'spcc_plan' | 'swppp'
  | 'training_records' | 'inspection_logs' | 'monitoring_data'
  | 'corrective_action_log' | 'annual_report' | 'discharge_log'
  | 'chain_of_custody' | 'lab_certifications' | 'calibration_records'
  | 'emergency_plan' | 'consent_decree_copy';

export interface DocumentCompleteness {
  id: string;
  organization_id: string;
  permit_id: string;
  document_type: DocumentType;
  is_on_file: boolean;
  is_current: boolean;
  file_path: string | null;
  last_updated: string | null;
  expiry_date: string | null;
  notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentCompletenessResult {
  permit_id: string;
  permit_number: string;
  site_name: string;
  total_required: number;
  on_file: number;
  current_docs: number;
  expired_docs: number;
  completeness_pct: number;
}

// ---------------------------------------------------------------------------
// Phase 10 — Obligation Evidence
// ---------------------------------------------------------------------------

export type EvidenceType =
  | 'document' | 'record' | 'report' | 'photo' | 'certification'
  | 'training_completion' | 'inspection_report' | 'lab_result'
  | 'dmr_submission' | 'corrective_action' | 'other';

export type EvidenceVerificationStatus = 'unverified' | 'verified' | 'expired' | 'insufficient' | 'disputed';

export interface ObligationEvidence {
  id: string;
  organization_id: string;
  obligation_id: string;
  evidence_type: EvidenceType;
  title: string;
  description: string | null;
  file_path: string | null;
  record_table: string | null;
  record_id: string | null;
  verification_status: EvidenceVerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  submitted_by: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 10 — Governance Reviews
// ---------------------------------------------------------------------------

export type GovernanceReviewType = 'quarterly' | 'annual' | 'special' | 'consent_decree';
export type GovernanceReviewStatus = 'scheduled' | 'in_progress' | 'findings_draft' | 'under_review' | 'finalized' | 'closed';

export interface GovernanceReview {
  id: string;
  organization_id: string;
  title: string;
  review_type: GovernanceReviewType;
  review_period_start: string;
  review_period_end: string;
  status: GovernanceReviewStatus;
  findings: string | null;
  action_items: Record<string, unknown>[] | null;
  recommendations: string | null;
  compliance_score: number | null;
  audit_readiness_score: number | null;
  conducted_by: string | null;
  conducted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 10 — Audit Readiness Score
// ---------------------------------------------------------------------------

export interface AuditReadinessScore {
  overall_score: number;
  checklist_score: number;
  checklist_total: number;
  checklist_completed: number;
  document_score: number;
  document_total: number;
  document_current: number;
  evidence_score: number;
  obligations_total: number;
  obligations_evidenced: number;
}

// ---------------------------------------------------------------------------
// Phase 11 — Emergency Contacts
// ---------------------------------------------------------------------------

export type EmergencyContactRole =
  | 'epa_coordinator' | 'state_dep_contact' | 'legal_counsel'
  | 'environmental_consultant' | 'lab_contact' | 'contractor'
  | 'site_manager' | 'safety_officer' | 'emergency_responder'
  | 'regulatory_liaison' | 'media_contact' | 'other';

export type ContactAvailability = '24/7' | 'business_hours' | 'on_call' | 'scheduled';

export interface EmergencyContact {
  id: string;
  organization_id: string;
  site_id: string | null;
  contact_name: string;
  contact_role: EmergencyContactRole;
  organization_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  availability: ContactAvailability;
  availability_notes: string | null;
  is_primary: boolean;
  state_code: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 11 — Emergency Procedures
// ---------------------------------------------------------------------------

export type EmergencyIncidentType =
  | 'spill' | 'unauthorized_discharge' | 'equipment_failure'
  | 'sampling_failure' | 'data_loss' | 'permit_exceedance'
  | 'weather_event' | 'site_emergency' | 'regulatory_inspection'
  | 'media_inquiry' | 'other';

export type ProcedureSeverityLevel = 'all' | 'minor' | 'moderate' | 'major' | 'critical';

export interface ProcedureStep {
  order: number;
  action: string;
  responsible: string;
  timeframe: string;
  notes?: string;
}

export interface EmergencyProcedure {
  id: string;
  organization_id: string;
  title: string;
  incident_type: EmergencyIncidentType;
  severity_level: ProcedureSeverityLevel;
  description: string | null;
  steps: ProcedureStep[];
  notification_chain: Record<string, unknown>[] | null;
  responsible_roles: string[] | null;
  decree_paragraphs: string[] | null;
  regulatory_requirements: string | null;
  reporting_deadlines: string | null;
  state_code: string | null;
  site_id: string | null;
  is_active: boolean;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 11 — Data Integrity Checks
// ---------------------------------------------------------------------------

export type IntegrityCheckStatus = 'running' | 'passed' | 'warnings' | 'failed';

export interface IntegrityCheckResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  count: number;
}

export interface DataIntegrityCheck {
  id: string;
  organization_id: string;
  run_type: 'manual' | 'scheduled' | 'startup';
  status: IntegrityCheckStatus;
  checks_total: number;
  checks_passed: number;
  checks_warned: number;
  checks_failed: number;
  results: IntegrityCheckResult[];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  run_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 11 — Retention Policies
// ---------------------------------------------------------------------------

export interface RetentionPolicy {
  id: string;
  organization_id: string;
  record_type: string;
  display_name: string;
  description: string | null;
  retention_years: number;
  regulatory_basis: string;
  is_enforced: boolean;
  last_audit_at: string | null;
  records_within_policy: number | null;
  records_outside_policy: number | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 11 — System Health Logs
// ---------------------------------------------------------------------------

export interface SystemHealthLog {
  id: string;
  organization_id: string;
  db_size_mb: number | null;
  table_counts: Record<string, number> | null;
  storage_usage_mb: number | null;
  active_users_24h: number | null;
  error_count_24h: number | null;
  avg_response_ms: number | null;
  snapshot_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 12 — Go-Live Validation
// ---------------------------------------------------------------------------

export type GoLiveChecklistStatus =
  | 'draft' | 'in_progress' | 'blocked' | 'ready' | 'deployed' | 'rolled_back';

export interface GoLiveChecklist {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: GoLiveChecklistStatus;
  total_items: number;
  completed_items: number;
  readiness_score: number;
  deployment_version: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type GoLiveItemModule =
  | 'auth' | 'upload' | 'compliance' | 'field_ops' | 'reporting'
  | 'work_orders' | 'violations' | 'dmr' | 'incidents' | 'corrective_actions'
  | 'audit' | 'emergency' | 'system_health' | 'infrastructure' | 'security';

export type GoLiveItemStatus =
  | 'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked' | 'na';

export type GoLiveItemPriority = 'critical' | 'required' | 'recommended' | 'optional';

export interface GoLiveChecklistItem {
  id: string;
  checklist_id: string;
  organization_id: string;
  module: GoLiveItemModule;
  title: string;
  description: string | null;
  status: GoLiveItemStatus;
  priority: GoLiveItemPriority;
  assigned_to: string | null;
  evidence_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DeploymentStageName = 'dev' | 'staging' | 'canary' | 'production';
export type DeploymentStageStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'rolled_back';

export interface DeploymentStage {
  id: string;
  checklist_id: string;
  organization_id: string;
  stage_name: DeploymentStageName;
  stage_order: number;
  status: DeploymentStageStatus;
  started_at: string | null;
  completed_at: string | null;
  deployed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SmokeTestType = 'manual' | 'automated' | 'integration';
export type SmokeTestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface SmokeTestRun {
  id: string;
  checklist_id: string;
  organization_id: string;
  test_name: string;
  module: string;
  test_type: SmokeTestType;
  status: SmokeTestStatus;
  duration_ms: number | null;
  error_message: string | null;
  run_by: string | null;
  run_at: string | null;
  created_at: string;
}

export type SignOffType = 'technical' | 'compliance' | 'legal' | 'executive' | 'security' | 'operational';

export interface GoLiveSignOff {
  id: string;
  checklist_id: string;
  organization_id: string;
  sign_off_type: SignOffType;
  signed_by: string;
  signer_name: string;
  signer_role: string;
  conditions: string | null;
  notes: string | null;
  signed_at: string;
  created_at: string;
}

export interface GoLiveReadinessResult {
  readiness_score: number;
  checklist_score: number;
  smoke_test_score: number;
  sign_off_score: number;
  total_items: number;
  passed_items: number;
  critical_items: number;
  critical_passed: number;
  blockers: number;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  sign_offs_obtained: string[];
  sign_offs_required: number;
  sign_off_count: number;
  current_stage: string;
  is_go: boolean;
}

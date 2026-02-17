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

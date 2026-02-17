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
// Sampling Events (Migration 009)
// ---------------------------------------------------------------------------

/** Sampling event — one per outfall × date × time */
export interface SamplingEvent {
  id: string;
  organization_id: string;
  outfall_id: string;
  sample_date: string;
  sample_time: string | null;
  sampler_name: string | null;
  latitude: number | null;
  longitude: number | null;
  stream_name: string | null;
  lab_name: string | null;
  import_id: string | null;
  source_file_id: string | null;
  created_at: string;
}

/** Sampling event with joined relations for display */
export interface SamplingEventWithRelations extends SamplingEvent {
  outfall: {
    outfall_id: string;
    permit_id: string;
  } | null;
  organization: {
    name: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Lab Results (Migration 009)
// ---------------------------------------------------------------------------

/** Lab result — individual parameter measurement */
export interface LabResult {
  id: string;
  sampling_event_id: string;
  parameter_id: string;
  result_value: number | null;
  unit: string | null;
  below_detection: boolean;
  qualifier: string | null;
  analysis_date: string | null;
  hold_time_days: number | null;
  hold_time_compliant: boolean | null;
  import_id: string | null;
  raw_parameter_name: string | null;
  raw_value: string | null;
  row_number: number | null;
  created_at: string;
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

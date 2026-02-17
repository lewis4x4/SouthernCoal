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

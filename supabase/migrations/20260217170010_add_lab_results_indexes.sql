-- Migration 010: Add performance indexes for lab_results and sampling_events
-- Purpose: Address index gaps identified in code review
-- Part of Phase 2.5 security/performance fixes

-- ============================================================================
-- 1. Compound index for efficient lab_results lookups
-- ============================================================================
-- Supports queries that filter by both sampling_event_id AND parameter_id
-- Also improves upsert conflict detection performance
CREATE INDEX IF NOT EXISTS idx_lab_results_event_parameter
ON lab_results(sampling_event_id, parameter_id);

-- ============================================================================
-- 2. Compound index for outfall + date queries on sampling_events
-- ============================================================================
-- Supports efficient lookups by outfall and sample date
CREATE INDEX IF NOT EXISTS idx_sampling_events_outfall_date
ON sampling_events(outfall_id, sample_date DESC);

-- ============================================================================
-- 3. Partial index for non-null import_id lookups
-- ============================================================================
-- Supports efficient rollback queries and import audit
CREATE INDEX IF NOT EXISTS idx_lab_results_import_not_null
ON lab_results(import_id) WHERE import_id IS NOT NULL;

-- ============================================================================
-- 4. Documentation comments
-- ============================================================================
COMMENT ON INDEX idx_lab_results_event_parameter IS
  'Compound index for queries filtering by event + parameter. Improves upsert conflict detection.';
COMMENT ON INDEX idx_sampling_events_outfall_date IS
  'Compound index for outfall-scoped date range queries.';
COMMENT ON INDEX idx_lab_results_import_not_null IS
  'Partial index for import rollback and audit queries. Excludes null import_ids.';

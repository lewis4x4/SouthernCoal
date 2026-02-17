-- Migration 011: Add UNIQUE indexes for upsert ON CONFLICT clauses
-- Purpose: Fix ON CONFLICT detection in import-lab-data Edge Function
-- Critical: Without these, batch upserts may insert duplicates instead of updating

-- ============================================================================
-- 1. Create UNIQUE index for sampling_events upsert
-- ============================================================================
-- The existing UNIQUE constraint may not be detected by Supabase's onConflict
-- Creating explicit unique index ensures ON CONFLICT works correctly
CREATE UNIQUE INDEX IF NOT EXISTS idx_sampling_events_unique_event
ON sampling_events(outfall_id, sample_date, COALESCE(sample_time, '00:00:00'));

-- ============================================================================
-- 2. Create UNIQUE index for lab_results upsert
-- ============================================================================
-- Supports ON CONFLICT (sampling_event_id, parameter_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_results_unique_result
ON lab_results(sampling_event_id, parameter_id);

-- ============================================================================
-- 3. Documentation
-- ============================================================================
COMMENT ON INDEX idx_sampling_events_unique_event IS
  'Unique index for batch upsert conflict detection. Uses COALESCE for NULL sample_time handling.';
COMMENT ON INDEX idx_lab_results_unique_result IS
  'Unique index for batch upsert conflict detection. Prevents duplicate results per event+parameter.';

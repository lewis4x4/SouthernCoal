-- =============================================================================
-- Migration 001: Add UNIQUE constraint for permit_limits upsert
-- =============================================================================
-- Purpose: Support ON CONFLICT batch upsert in import-permit-limits Edge Function
-- Constraint: one limit per outfall + parameter + statistical_base + frequency
-- =============================================================================

-- Drop existing constraint if present (avoid duplicate index errors)
DROP INDEX IF EXISTS idx_permit_limits_upsert_key;

-- Create composite unique index for upsert deduplication
-- Uses COALESCE to handle NULL values consistently
CREATE UNIQUE INDEX idx_permit_limits_upsert_key
ON permit_limits (
  outfall_id,
  parameter_id,
  COALESCE(statistical_base, 'default'),
  COALESCE(monitoring_frequency, 'default')
);

-- Documentation
COMMENT ON INDEX idx_permit_limits_upsert_key IS
  'Unique constraint for permit limit upsert: outfall + parameter + statistical_base + frequency. Uses COALESCE for NULL handling.';

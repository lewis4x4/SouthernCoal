-- =============================================================================
-- Migration 003: Extend exceedances table for monitoring dashboard
-- =============================================================================
-- Purpose: Add columns needed for real-time monitoring and corrective actions
-- Note: Table already exists with different schema, this adds missing columns
-- =============================================================================

-- Add organization_id column for RLS scoping (required for dashboard)
ALTER TABLE exceedances
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Add corrective action link
ALTER TABLE exceedances
ADD COLUMN IF NOT EXISTS corrective_action_id uuid REFERENCES corrective_actions(id);

-- Add detected_at timestamp
ALTER TABLE exceedances
ADD COLUMN IF NOT EXISTS detected_at timestamptz DEFAULT now();

-- Add resolved_by user reference
ALTER TABLE exceedances
ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES user_profiles(id);

-- Add unit columns for display
ALTER TABLE exceedances
ADD COLUMN IF NOT EXISTS result_unit text;

ALTER TABLE exceedances
ADD COLUMN IF NOT EXISTS limit_unit text;

-- =============================================================================
-- Populate organization_id from existing data
-- =============================================================================
-- Get org_id from outfall -> permit -> organization chain
UPDATE exceedances e
SET organization_id = np.organization_id
FROM outfalls o
JOIN npdes_permits np ON np.id = o.permit_id
WHERE e.outfall_id = o.id
  AND e.organization_id IS NULL;

-- Make organization_id NOT NULL after populating
-- (commented out since some records might not have valid outfall references)
-- ALTER TABLE exceedances ALTER COLUMN organization_id SET NOT NULL;

-- =============================================================================
-- Indexes for common queries (create if not exists)
-- =============================================================================

-- Filter by status (most queries filter open exceedances)
CREATE INDEX IF NOT EXISTS idx_exceedances_status
ON exceedances(organization_id, status)
WHERE status != 'resolved';

-- Filter by severity (dashboard cards)
CREATE INDEX IF NOT EXISTS idx_exceedances_severity
ON exceedances(organization_id, severity)
WHERE status != 'resolved';

-- Time-based queries (recent exceedances)
CREATE INDEX IF NOT EXISTS idx_exceedances_detected_at
ON exceedances(organization_id, detected_at DESC);

-- Outfall drill-down
CREATE INDEX IF NOT EXISTS idx_exceedances_outfall
ON exceedances(outfall_id, sample_date DESC);

-- Parameter analysis
CREATE INDEX IF NOT EXISTS idx_exceedances_parameter
ON exceedances(parameter_id, detected_at DESC);

-- Unique constraint for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_exceedances_unique
ON exceedances(lab_result_id, permit_limit_id);

-- =============================================================================
-- Row Level Security (add if not exists)
-- =============================================================================

-- Enable RLS (idempotent)
ALTER TABLE exceedances ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any and recreate
DROP POLICY IF EXISTS "Users view own org exceedances" ON exceedances;
CREATE POLICY "Users view own org exceedances"
  ON exceedances FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Managers can update exceedances" ON exceedances;
CREATE POLICY "Managers can update exceedances"
  ON exceedances FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "System can insert exceedances" ON exceedances;
CREATE POLICY "System can insert exceedances"
  ON exceedances FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id() OR organization_id IS NOT NULL);

-- =============================================================================
-- Documentation
-- =============================================================================

COMMENT ON TABLE exceedances IS 'Auto-detected permit limit violations. Extended for real-time monitoring dashboard.';
COMMENT ON COLUMN exceedances.organization_id IS 'Organization owning this exceedance, used for RLS scoping';
COMMENT ON COLUMN exceedances.corrective_action_id IS 'Link to auto-created corrective action';
COMMENT ON COLUMN exceedances.detected_at IS 'Timestamp when exceedance was auto-detected by trigger';
COMMENT ON COLUMN exceedances.severity IS 'Calculated: minor (<10%), moderate (10-50%), major (50-100%), critical (>100%)';

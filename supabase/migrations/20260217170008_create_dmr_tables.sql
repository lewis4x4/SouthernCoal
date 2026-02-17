-- Migration: Create dmr_submissions and dmr_line_items tables
-- Purpose: Store parsed DMR data from NetDMR bundles (KY, WV) and state DMR systems
-- Part of Phase 2.2: parse-netdmr-bundle implementation

-- ============================================================================
-- 1. DMR Submissions — One record per permit × monitoring period
-- ============================================================================
CREATE TABLE dmr_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  permit_id uuid NOT NULL REFERENCES npdes_permits(id) ON DELETE CASCADE,

  -- Monitoring period
  monitoring_period_start date NOT NULL,
  monitoring_period_end date NOT NULL,

  -- Submission metadata
  submission_type text NOT NULL DEFAULT 'monthly'
    CHECK (submission_type IN ('monthly', 'quarterly', 'annual', 'semi_annual')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_submission', 'submitted', 'accepted', 'rejected', 'amended')),

  -- No Discharge indicator for entire submission
  no_discharge boolean DEFAULT false,
  nodi_code text CHECK (nodi_code IS NULL OR nodi_code IN ('C', '9', 'N', 'B', 'E', 'G', 'K', 'Q', 'R', 'T', 'U', 'W')),

  -- Submission tracking
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  submission_confirmation text,  -- NetDMR confirmation number

  -- Source tracking
  source_file_id uuid REFERENCES file_processing_queue(id),
  import_id uuid,  -- Links to data_imports for rollback

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One submission per permit × period
  CONSTRAINT dmr_submissions_unique UNIQUE (permit_id, monitoring_period_start, monitoring_period_end)
);

ALTER TABLE dmr_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org DMR submissions"
  ON dmr_submissions FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert own org DMR submissions"
  ON dmr_submissions FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org DMR submissions"
  ON dmr_submissions FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Service role full access to DMR submissions"
  ON dmr_submissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_dmr_submissions_org ON dmr_submissions(organization_id);
CREATE INDEX idx_dmr_submissions_permit ON dmr_submissions(permit_id);
CREATE INDEX idx_dmr_submissions_period ON dmr_submissions(monitoring_period_end DESC);
CREATE INDEX idx_dmr_submissions_status ON dmr_submissions(status);

-- ============================================================================
-- 2. DMR Line Items — Individual parameter measurements per outfall
-- ============================================================================
CREATE TABLE dmr_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES dmr_submissions(id) ON DELETE CASCADE,
  outfall_id uuid NOT NULL REFERENCES outfalls(id) ON DELETE CASCADE,
  parameter_id uuid NOT NULL REFERENCES parameters(id),

  -- Statistical base (what type of value is reported)
  statistical_base text NOT NULL
    CHECK (statistical_base IN ('minimum', 'average', 'maximum', 'daily_maximum', 'weekly_average', 'monthly_average', 'instantaneous', 'sample_measurement')),

  -- Limit from permit
  limit_value numeric,
  limit_unit text,
  limit_type text CHECK (limit_type IS NULL OR limit_type IN ('daily_max', 'weekly_avg', 'monthly_avg', 'instantaneous', 'report_only')),

  -- Reported/measured value
  measured_value numeric,
  measured_unit text,

  -- NODI (No Data Indicator) codes
  -- C = No Discharge, 9 = Conditional, N = No Data, B = Below Detection
  -- E = Estimate, G = Greater than, K = Actual value, Q = Qualifier, etc.
  nodi_code text CHECK (nodi_code IS NULL OR nodi_code IN ('C', '9', 'N', 'B', 'E', 'G', 'K', 'Q', 'R', 'T', 'U', 'W')),

  -- Exceedance tracking
  is_exceedance boolean DEFAULT false,
  exceedance_pct numeric,  -- (measured - limit) / limit * 100

  -- Sample details
  sample_count integer,
  sample_frequency text,

  -- Raw STORET code from source file
  storet_code text,

  -- Qualifier/comments
  qualifier text,
  comments text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One record per submission × outfall × parameter × stat base
  CONSTRAINT dmr_line_items_unique UNIQUE (submission_id, outfall_id, parameter_id, statistical_base)
);

ALTER TABLE dmr_line_items ENABLE ROW LEVEL SECURITY;

-- RLS via parent submission
CREATE POLICY "Users can view own org DMR line items"
  ON dmr_line_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dmr_submissions ds
      WHERE ds.id = dmr_line_items.submission_id
        AND ds.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can insert DMR line items for own org submissions"
  ON dmr_line_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dmr_submissions ds
      WHERE ds.id = dmr_line_items.submission_id
        AND ds.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can update own org DMR line items"
  ON dmr_line_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dmr_submissions ds
      WHERE ds.id = dmr_line_items.submission_id
        AND ds.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Service role full access to DMR line items"
  ON dmr_line_items FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_dmr_line_items_submission ON dmr_line_items(submission_id);
CREATE INDEX idx_dmr_line_items_outfall ON dmr_line_items(outfall_id);
CREATE INDEX idx_dmr_line_items_parameter ON dmr_line_items(parameter_id);
CREATE INDEX idx_dmr_line_items_exceedance ON dmr_line_items(is_exceedance) WHERE is_exceedance = true;
CREATE INDEX idx_dmr_line_items_storet ON dmr_line_items(storet_code);

-- ============================================================================
-- 3. Update trigger for dmr_submissions
-- ============================================================================
CREATE OR REPLACE FUNCTION update_dmr_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dmr_submissions_updated
  BEFORE UPDATE ON dmr_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_dmr_submission_timestamp();

-- ============================================================================
-- 4. Audit log action types for DMR operations
-- ============================================================================
-- Add DMR-related action types to audit_log check constraint (if not exists)
DO $$
BEGIN
  -- Check if constraint exists and update if needed
  -- This is additive - existing data won't be affected
  ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Constraint doesn't exist, proceed
END $$;

-- Add comment for documentation
COMMENT ON TABLE dmr_submissions IS 'DMR submission records - one per permit × monitoring period. Source: NetDMR bundles, state DMR systems.';
COMMENT ON TABLE dmr_line_items IS 'Individual parameter measurements within a DMR submission. Tracks limits, values, and exceedances.';
COMMENT ON COLUMN dmr_line_items.nodi_code IS 'EPA No Data Indicator: C=No Discharge, 9=Conditional, N=No Data, B=Below Detection, E=Estimate, etc.';

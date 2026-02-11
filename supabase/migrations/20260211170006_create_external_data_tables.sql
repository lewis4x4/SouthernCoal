-- Migration 013: Layer 2 — External data tables for EPA ECHO + MSHA integration
-- Creates 5 tables for caching public compliance data and surfacing discrepancies
-- Part of: Public API Integration layer (cross-validation pipeline)

-- ============================================================================
-- 1. external_echo_facilities — Cached EPA ECHO facility/permit metadata
-- ============================================================================
CREATE TABLE external_echo_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- ECHO identifiers
  npdes_id text NOT NULL,
  facility_name text,

  -- Permit / compliance status
  permit_status text,           -- EFF (effective), ADC (admin continued), EXP (expired)
  compliance_status text,       -- SNC, No Violation, etc.
  qtrs_in_nc integer,           -- quarters in non-compliance (0-12)

  -- Inspection / enforcement
  last_inspection_date date,
  last_penalty_amount numeric,
  last_penalty_date date,

  -- Location
  facility_address text,
  city text,
  state_code text REFERENCES states(code),
  zip text,
  latitude numeric,
  longitude numeric,

  -- Permit dates
  permit_effective_date date,
  permit_expiration_date date,

  -- Classification
  sic_codes text[],
  naics_codes text[],

  -- Raw API response for debugging/auditing
  raw_response jsonb,

  -- Sync tracking
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One record per NPDES ID per org
  UNIQUE (organization_id, npdes_id)
);

ALTER TABLE external_echo_facilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org ECHO facilities"
ON external_echo_facilities FOR SELECT TO authenticated
USING (organization_id = get_user_org_id());

CREATE POLICY "Service role can manage ECHO facilities"
ON external_echo_facilities FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_eef_org_id ON external_echo_facilities(organization_id);
CREATE INDEX idx_eef_npdes_id ON external_echo_facilities(npdes_id);
CREATE INDEX idx_eef_state ON external_echo_facilities(state_code);
CREATE INDEX idx_eef_compliance ON external_echo_facilities(compliance_status);

-- ============================================================================
-- 2. external_echo_dmrs — Cached DMR effluent data from EPA ECHO
-- ============================================================================
CREATE TABLE external_echo_dmrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- Link to cached facility
  facility_id uuid REFERENCES external_echo_facilities(id) ON DELETE CASCADE,
  npdes_id text NOT NULL,

  -- Monitoring period
  monitoring_period_start date,
  monitoring_period_end date,

  -- DMR detail
  outfall text,
  parameter_code text,
  parameter_desc text,
  statistical_base text,        -- avg, max, min, etc.

  -- Limit
  limit_value numeric,
  limit_unit text,

  -- Reported value
  dmr_value numeric,
  dmr_unit text,
  nodi_code text,               -- No Data Indicator

  -- Violation info
  violation_code text,
  violation_desc text,
  exceedance_pct numeric,

  -- Raw for debugging
  raw_response jsonb,

  -- Sync tracking
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One record per outfall × parameter × stat base × period × org
  UNIQUE (organization_id, npdes_id, outfall, parameter_code, statistical_base, monitoring_period_end)
);

ALTER TABLE external_echo_dmrs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org ECHO DMRs"
ON external_echo_dmrs FOR SELECT TO authenticated
USING (organization_id = get_user_org_id());

CREATE POLICY "Service role can manage ECHO DMRs"
ON external_echo_dmrs FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_eed_org_id ON external_echo_dmrs(organization_id);
CREATE INDEX idx_eed_npdes_id ON external_echo_dmrs(npdes_id);
CREATE INDEX idx_eed_facility ON external_echo_dmrs(facility_id);
CREATE INDEX idx_eed_period ON external_echo_dmrs(monitoring_period_end);
CREATE INDEX idx_eed_violation ON external_echo_dmrs(violation_code) WHERE violation_code IS NOT NULL;

-- ============================================================================
-- 3. external_msha_inspections — Cached MSHA inspection/violation records
--    (skeleton — actual sync blocked until mine ID mapping from Tom)
-- ============================================================================
CREATE TABLE external_msha_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- MSHA identifiers
  mine_id text NOT NULL,
  event_number text,

  -- Inspection details
  inspection_date date,
  inspection_type text,

  -- Violation details
  violation_number text,
  violation_type text,
  section_of_act text,
  significant_substantial boolean DEFAULT false,
  negligence text,

  -- Penalties
  proposed_penalty numeric,
  penalty_amount numeric,
  current_status text,

  -- Raw MSHA data row
  raw_data jsonb,

  -- Sync tracking
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, mine_id, event_number)
);

ALTER TABLE external_msha_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org MSHA inspections"
ON external_msha_inspections FOR SELECT TO authenticated
USING (organization_id = get_user_org_id());

CREATE POLICY "Service role can manage MSHA inspections"
ON external_msha_inspections FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_emi_org_id ON external_msha_inspections(organization_id);
CREATE INDEX idx_emi_mine_id ON external_msha_inspections(mine_id);
CREATE INDEX idx_emi_date ON external_msha_inspections(inspection_date);

-- ============================================================================
-- 4. external_sync_log — Audit trail of all sync operations
-- ============================================================================
CREATE TABLE external_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),

  -- Sync metadata
  source text NOT NULL,          -- echo_facility, echo_dmr, msha
  sync_type text NOT NULL DEFAULT 'manual',  -- scheduled, manual
  status text NOT NULL DEFAULT 'running',    -- running, completed, failed
  triggered_by uuid REFERENCES auth.users(id),

  -- Timing
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- Results
  records_synced integer DEFAULT 0,
  records_failed integer DEFAULT 0,
  error_details jsonb,
  metadata jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE external_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org sync logs"
ON external_sync_log FOR SELECT TO authenticated
USING (organization_id = get_user_org_id());

CREATE POLICY "Service role can manage sync logs"
ON external_sync_log FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_esl_org ON external_sync_log(organization_id);
CREATE INDEX idx_esl_source ON external_sync_log(source);
CREATE INDEX idx_esl_status ON external_sync_log(status);
CREATE INDEX idx_esl_started ON external_sync_log(started_at DESC);

-- ============================================================================
-- 5. discrepancy_reviews — Triage queue for cross-validation mismatches
-- ============================================================================
CREATE TABLE discrepancy_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- Identifiers
  npdes_id text,
  mine_id text,
  source text NOT NULL,          -- echo, msha

  -- Discrepancy classification
  discrepancy_type text NOT NULL, -- missing_internal, missing_external, value_mismatch, status_mismatch
  severity text NOT NULL DEFAULT 'medium', -- critical, high, medium, low
  status text NOT NULL DEFAULT 'pending',  -- pending, reviewed, dismissed, escalated, resolved

  -- Period
  monitoring_period_start date,
  monitoring_period_end date,

  -- Comparison detail
  description text NOT NULL,
  internal_value text,
  external_value text,
  internal_source_table text,
  internal_source_id uuid,
  external_source_id uuid,

  -- Triage workflow
  detected_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  dismiss_reason text,
  escalated_to uuid REFERENCES auth.users(id),
  escalated_at timestamptz,
  resolved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE discrepancy_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org discrepancies"
ON discrepancy_reviews FOR SELECT TO authenticated
USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org discrepancies"
ON discrepancy_reviews FOR UPDATE TO authenticated
USING (organization_id = get_user_org_id());

CREATE POLICY "Service role can manage discrepancies"
ON discrepancy_reviews FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_dr_org ON discrepancy_reviews(organization_id);
CREATE INDEX idx_dr_npdes ON discrepancy_reviews(npdes_id);
CREATE INDEX idx_dr_severity ON discrepancy_reviews(severity);
CREATE INDEX idx_dr_status ON discrepancy_reviews(status);
CREATE INDEX idx_dr_type ON discrepancy_reviews(discrepancy_type);
CREATE INDEX idx_dr_detected ON discrepancy_reviews(detected_at DESC);
CREATE INDEX idx_dr_source ON discrepancy_reviews(source);

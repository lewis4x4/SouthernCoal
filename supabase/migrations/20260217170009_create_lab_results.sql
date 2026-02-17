-- Migration 009: Create sampling_events and lab_results tables
-- Purpose: Store imported lab data from parsed EDD files
-- Part of Phase 2.5: Approve & Import flow

-- ============================================================================
-- 1. Sampling Events — One record per outfall × date × time
-- ============================================================================
CREATE TABLE sampling_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outfall_id uuid NOT NULL REFERENCES outfalls(id) ON DELETE CASCADE,

  -- Sampling details
  sample_date date NOT NULL,
  sample_time time,
  sampler_name text,

  -- Location (may differ from outfall location for field measurements)
  latitude numeric,
  longitude numeric,
  stream_name text,

  -- Lab info
  lab_name text,

  -- Import tracking
  import_id uuid REFERENCES data_imports(id),
  source_file_id uuid REFERENCES file_processing_queue(id),

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One event per outfall × date × time (time can be null for single daily samples)
  CONSTRAINT sampling_events_unique UNIQUE NULLS NOT DISTINCT (outfall_id, sample_date, sample_time)
);

ALTER TABLE sampling_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org sampling events"
  ON sampling_events FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert own org sampling events"
  ON sampling_events FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Service role full access to sampling events"
  ON sampling_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_sampling_events_org ON sampling_events(organization_id);
CREATE INDEX idx_sampling_events_outfall ON sampling_events(outfall_id);
CREATE INDEX idx_sampling_events_date ON sampling_events(sample_date DESC);
CREATE INDEX idx_sampling_events_import ON sampling_events(import_id);

-- ============================================================================
-- 2. Lab Results — Individual parameter measurements
-- ============================================================================
CREATE TABLE lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sampling_event_id uuid NOT NULL REFERENCES sampling_events(id) ON DELETE CASCADE,
  parameter_id uuid NOT NULL REFERENCES parameters(id),

  -- Measurement
  result_value numeric,
  unit text,
  below_detection boolean DEFAULT false,
  qualifier text,

  -- Analysis tracking (for hold time validation)
  analysis_date date,
  hold_time_days numeric,
  hold_time_compliant boolean,

  -- Import tracking
  import_id uuid REFERENCES data_imports(id),

  -- Raw values for audit
  raw_parameter_name text,
  raw_value text,
  row_number integer,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One result per event × parameter
  CONSTRAINT lab_results_unique UNIQUE (sampling_event_id, parameter_id)
);

ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;

-- RLS via parent sampling_event
CREATE POLICY "Users can view own org lab results"
  ON lab_results FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sampling_events se
      WHERE se.id = lab_results.sampling_event_id
        AND se.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can insert lab results for own org events"
  ON lab_results FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sampling_events se
      WHERE se.id = lab_results.sampling_event_id
        AND se.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Service role full access to lab results"
  ON lab_results FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_lab_results_event ON lab_results(sampling_event_id);
CREATE INDEX idx_lab_results_parameter ON lab_results(parameter_id);
CREATE INDEX idx_lab_results_import ON lab_results(import_id);
CREATE INDEX idx_lab_results_below_det ON lab_results(below_detection) WHERE below_detection = true;
CREATE INDEX idx_lab_results_hold_time ON lab_results(hold_time_compliant) WHERE hold_time_compliant = false;

-- ============================================================================
-- 3. Comments for documentation
-- ============================================================================
COMMENT ON TABLE sampling_events IS 'Field sampling events - one per outfall × date × time. Links lab_results to physical sampling location.';
COMMENT ON TABLE lab_results IS 'Individual parameter measurements from lab analysis. Tracks result values, detection limits, and hold time compliance.';
COMMENT ON COLUMN lab_results.hold_time_days IS 'Days between sample_date and analysis_date. Used for 40 CFR Part 136 compliance checking.';
COMMENT ON COLUMN lab_results.hold_time_compliant IS 'Whether hold time meets regulatory requirements for this parameter (40 CFR Part 136).';
COMMENT ON COLUMN lab_results.below_detection IS 'True if result was below method detection limit (MDL). Qualifier typically shows "<".';

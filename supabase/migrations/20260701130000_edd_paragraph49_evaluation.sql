-- Lane C QW2: CD ¶49 48-hour EDD-arrival clock + exceedance-only transmittal flag

CREATE TABLE IF NOT EXISTS edd_paragraph49_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_id uuid REFERENCES data_imports(id) ON DELETE SET NULL,
  source_file_id uuid REFERENCES file_processing_queue(id) ON DELETE SET NULL,
  lab_name text,
  site_state text,
  file_name text,
  arrival_at timestamptz NOT NULL,
  earliest_analysis_date date,
  latest_analysis_date date,
  hours_analysis_to_arrival numeric(10, 2),
  is_late_48h boolean NOT NULL DEFAULT false,
  is_exceedance_only boolean NOT NULL DEFAULT false,
  parameters_received integer NOT NULL DEFAULT 0,
  parameters_expected integer NOT NULL DEFAULT 0,
  exceedance_parameter_count integer NOT NULL DEFAULT 0,
  sampling_event_count integer NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'acknowledged', 'disputed', 'resolved')),
  review_notes text,
  reviewed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_edd_p49_eval_import
  ON edd_paragraph49_evaluations(import_id)
  WHERE import_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_edd_p49_eval_org_flags
  ON edd_paragraph49_evaluations(organization_id, is_late_48h, is_exceedance_only, review_status);

CREATE INDEX IF NOT EXISTS idx_edd_p49_eval_lab_state
  ON edd_paragraph49_evaluations(organization_id, lab_name, site_state);

CREATE OR REPLACE FUNCTION evaluate_edd_import_paragraph49(
  p_import_id uuid,
  p_arrival_at timestamptz DEFAULT now(),
  p_source_file_id uuid DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_lab_name text DEFAULT NULL,
  p_site_state text DEFAULT NULL
)
RETURNS edd_paragraph49_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_row edd_paragraph49_evaluations%ROWTYPE;
  v_earliest date;
  v_latest date;
  v_hours numeric;
  v_received integer := 0;
  v_expected integer := 0;
  v_exceedance integer := 0;
  v_events integer := 0;
  v_is_late boolean := false;
  v_is_exceedance_only boolean := false;
  v_lab text;
  v_state text;
BEGIN
  SELECT di.organization_id INTO v_org_id
  FROM data_imports di
  WHERE di.id = p_import_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Import not found: %', p_import_id;
  END IF;

  SELECT
    MIN(lr.analyzed_date),
    MAX(lr.analyzed_date),
    COUNT(DISTINCT (se.outfall_id, lr.parameter_id)),
    COUNT(DISTINCT se.id),
    MAX(se.lab_name),
    MAX(st.code)
  INTO v_earliest, v_latest, v_received, v_events, v_lab, v_state
  FROM lab_results lr
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN outfalls o ON o.id = se.outfall_id
  LEFT JOIN sites si ON si.id = o.site_id
  LEFT JOIN states st ON st.id = si.state_id
  WHERE lr.import_id = p_import_id;

  SELECT COUNT(DISTINCT (pl.outfall_id, pl.parameter_id)) INTO v_expected
  FROM permit_limits pl
  WHERE pl.outfall_id IN (
    SELECT DISTINCT se.outfall_id
    FROM lab_results lr
    JOIN sampling_events se ON se.id = lr.sampling_event_id
    WHERE lr.import_id = p_import_id
  );

  SELECT COUNT(DISTINCT (se.outfall_id, lr.parameter_id)) INTO v_exceedance
  FROM lab_results lr
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN exceedances e ON e.lab_result_id = lr.id
  WHERE lr.import_id = p_import_id;

  IF v_latest IS NOT NULL THEN
    v_hours := ROUND(
      EXTRACT(EPOCH FROM (
        p_arrival_at - (v_latest::timestamptz + interval '23 hours 59 minutes 59 seconds')
      )) / 3600.0,
      2
    );
    v_is_late := v_hours > 48;
  END IF;

  IF v_received > 0 AND v_expected > 0 THEN
    v_is_exceedance_only := (v_exceedance = v_received AND v_received < v_expected);
  END IF;

  INSERT INTO edd_paragraph49_evaluations (
    organization_id,
    import_id,
    source_file_id,
    lab_name,
    site_state,
    file_name,
    arrival_at,
    earliest_analysis_date,
    latest_analysis_date,
    hours_analysis_to_arrival,
    is_late_48h,
    is_exceedance_only,
    parameters_received,
    parameters_expected,
    exceedance_parameter_count,
    sampling_event_count,
    updated_at
  ) VALUES (
    v_org_id,
    p_import_id,
    p_source_file_id,
    COALESCE(p_lab_name, v_lab),
    COALESCE(p_site_state, v_state),
    p_file_name,
    p_arrival_at,
    v_earliest,
    v_latest,
    v_hours,
    v_is_late,
    v_is_exceedance_only,
    COALESCE(v_received, 0),
    COALESCE(v_expected, 0),
    COALESCE(v_exceedance, 0),
    COALESCE(v_events, 0),
    now()
  )
  ON CONFLICT (import_id) WHERE import_id IS NOT NULL
  DO UPDATE SET
    source_file_id = EXCLUDED.source_file_id,
    lab_name = EXCLUDED.lab_name,
    site_state = EXCLUDED.site_state,
    file_name = EXCLUDED.file_name,
    arrival_at = EXCLUDED.arrival_at,
    earliest_analysis_date = EXCLUDED.earliest_analysis_date,
    latest_analysis_date = EXCLUDED.latest_analysis_date,
    hours_analysis_to_arrival = EXCLUDED.hours_analysis_to_arrival,
    is_late_48h = EXCLUDED.is_late_48h,
    is_exceedance_only = EXCLUDED.is_exceedance_only,
    parameters_received = EXCLUDED.parameters_received,
    parameters_expected = EXCLUDED.parameters_expected,
    exceedance_parameter_count = EXCLUDED.exceedance_parameter_count,
    sampling_event_count = EXCLUDED.sampling_event_count,
    updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    v_org_id,
    'edd_paragraph49_evaluated',
    'environmental_compliance',
    'edd_paragraph49_evaluations',
    v_row.id,
    jsonb_build_object(
      'import_id', p_import_id,
      'is_late_48h', v_is_late,
      'is_exceedance_only', v_is_exceedance_only,
      'hours_analysis_to_arrival', v_hours,
      'parameters_received', v_received,
      'parameters_expected', v_expected,
      'arrival_at', p_arrival_at,
      'latest_analysis_date', v_latest
    ),
    'CD ¶49 EDD evaluation on ingest (advisory)'
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION update_edd_paragraph49_review_status(
  p_evaluation_id uuid,
  p_review_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS edd_paragraph49_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row edd_paragraph49_evaluations%ROWTYPE;
BEGIN
  IF p_review_status NOT IN ('pending', 'acknowledged', 'disputed', 'resolved') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_review_status;
  END IF;

  UPDATE edd_paragraph49_evaluations
  SET review_status = p_review_status,
      review_notes = COALESCE(p_review_notes, review_notes),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_evaluation_id
    AND organization_id = get_user_org_id()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found or not accessible';
  END IF;

  INSERT INTO audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    auth.uid(),
    v_row.organization_id,
    'edd_paragraph49_review_updated',
    'environmental_compliance',
    'edd_paragraph49_evaluations',
    v_row.id,
    jsonb_build_object(
      'review_status', p_review_status,
      'import_id', v_row.import_id,
      'is_late_48h', v_row.is_late_48h,
      'is_exceedance_only', v_row.is_exceedance_only
    ),
    'EDD ¶49 triage updated'
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION evaluate_edd_import_paragraph49(uuid, timestamptz, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_edd_paragraph49_review_status(uuid, text, text) TO authenticated;

ALTER TABLE edd_paragraph49_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org edd p49 evaluations"
  ON edd_paragraph49_evaluations FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Managers update own org edd p49 evaluations"
  ON edd_paragraph49_evaluations FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  );

CREATE POLICY "Service role full access edd p49 evaluations"
  ON edd_paragraph49_evaluations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE edd_paragraph49_evaluations IS
  'Advisory CD ¶49 EDD timeliness + exceedance-only completeness flags (Lane C QW2). Not auto-priced penalties.';

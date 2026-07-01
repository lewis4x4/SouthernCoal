-- Lane C QW2 fix: resolve organization from lab import graph (data_imports has no organization_id)

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
  SELECT COALESCE(p.organization_id, si.organization_id)
  INTO v_org_id
  FROM lab_results lr
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN outfalls o ON o.id = se.outfall_id
  LEFT JOIN npdes_permits p ON p.id = o.permit_id
  LEFT JOIN sites si ON si.id = COALESCE(se.site_id, o.site_id)
  WHERE lr.import_id = p_import_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT si.organization_id
    INTO v_org_id
    FROM data_imports di
    JOIN sites si ON si.id = di.site_id
    WHERE di.id = p_import_id;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Import not found or organization could not be resolved: %', p_import_id;
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
  LEFT JOIN sites si ON si.id = COALESCE(se.site_id, o.site_id)
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

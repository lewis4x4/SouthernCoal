-- Slice 2 E1 — schema-adaptive apply_dmr_mass_loading_for_submission (CMS lacks measured_value).

CREATE OR REPLACE FUNCTION apply_dmr_mass_loading_for_submission(p_submission_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission RECORD;
  v_period_start date;
  v_period_end date;
  v_flow_mgd numeric;
  v_updated integer := 0;
  rec RECORD;
  v_conc numeric;
  v_loading numeric;
  v_submission_col text;
  v_conc_expr text;
  v_has_quantity_max boolean;
BEGIN
  SELECT * INTO v_submission FROM dmr_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_submissions' AND column_name = 'monitoring_period_start'
  ) THEN
    v_period_start := v_submission.monitoring_period_start;
    v_period_end := v_submission.monitoring_period_end;
  ELSE
    v_period_start := v_submission.reporting_period_start;
    v_period_end := v_submission.reporting_period_end;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_line_items' AND column_name = 'dmr_submission_id'
  ) THEN
    v_submission_col := 'dmr_submission_id';
  ELSE
    v_submission_col := 'submission_id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_line_items' AND column_name = 'concentration_max'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dmr_line_items' AND column_name = 'measured_value'
    ) THEN
      v_conc_expr := 'COALESCE(dli.concentration_max, dli.measured_value)';
    ELSE
      v_conc_expr := 'dli.concentration_max';
    END IF;
  ELSE
    v_conc_expr := 'dli.measured_value';
  END IF;

  v_has_quantity_max := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_line_items' AND column_name = 'quantity_max'
  );

  SELECT AVG(lr.result_value) INTO v_flow_mgd
  FROM lab_results lr
  JOIN sampling_events se ON se.id = lr.sampling_event_id
  JOIN parameters p ON p.id = lr.parameter_id
  WHERE se.sample_date >= v_period_start
    AND se.sample_date <= v_period_end
    AND (
      lower(p.name) LIKE '%flow%'
      OR p.storet_code IN ('50050', '50051')
    )
    AND lower(COALESCE(lr.unit, '')) IN ('mgd', 'million gal/day', 'million gallons/day');

  FOR rec IN
    EXECUTE format($q$
      SELECT
        dli.id AS line_id,
        %s AS conc,
        pl.unit AS limit_unit
      FROM dmr_line_items dli
      JOIN permit_limits pl ON pl.outfall_id = dli.outfall_id AND pl.parameter_id = dli.parameter_id
      WHERE dli.%I = $1
        AND pl.is_active = true
        AND (
          lower(COALESCE(pl.unit, '')) LIKE '%%lb%%day%%'
          OR lower(COALESCE(pl.limit_type, '')) LIKE '%%quantity%%'
          OR lower(COALESCE(pl.limit_type, '')) LIKE '%%mass%%'
        )
    $q$, v_conc_expr, v_submission_col)
    USING p_submission_id
  LOOP
    v_conc := rec.conc;
    IF v_conc IS NULL OR v_flow_mgd IS NULL THEN CONTINUE; END IF;

    v_loading := calculate_mass_loading_lbs_day(v_conc, v_flow_mgd);

    IF v_has_quantity_max THEN
      UPDATE dmr_line_items
      SET mass_loading_lbs_day = v_loading,
          quantity_max = COALESCE(quantity_max, v_loading),
          calculation_warnings = COALESCE(calculation_warnings, '[]'::jsonb) ||
            jsonb_build_array(jsonb_build_object(
              'type', 'mass_loading_calculated',
              'message', format('Mass loading %s lbs/day from %s mg/L × %s MGD', v_loading, v_conc, ROUND(v_flow_mgd, 4)),
              'flow_mgd', v_flow_mgd
            )),
          updated_at = now()
      WHERE id = rec.line_id;
    ELSE
      UPDATE dmr_line_items
      SET mass_loading_lbs_day = v_loading,
          calculation_warnings = COALESCE(calculation_warnings, '[]'::jsonb) ||
            jsonb_build_array(jsonb_build_object(
              'type', 'mass_loading_calculated',
              'message', format('Mass loading %s lbs/day from %s mg/L × %s MGD', v_loading, v_conc, ROUND(v_flow_mgd, 4)),
              'flow_mgd', v_flow_mgd
            )),
          updated_at = now()
      WHERE id = rec.line_id;
    END IF;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION apply_dmr_mass_loading_for_submission IS
  'E1 — populate mass_loading_lbs_day for quantity-type permit limits; CMS/modern schema adaptive.';

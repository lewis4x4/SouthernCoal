-- E1: DMR mass/loading (lbs/day) for quantity-type limits + unit_conversions seed.

-- Settleable solids mg/L → mL/L (1000 mg/L = 1 mL/L)
INSERT INTO unit_conversions (parameter_id, from_unit, to_unit, conversion_factor, notes)
SELECT p.id, 'mg/L', 'mL/L', 0.001, 'Settleable solids mg/L to mL/L (1000:1)'
FROM parameters p
WHERE lower(p.name) LIKE '%settleable%solid%'
ON CONFLICT (parameter_id, from_unit, to_unit) DO NOTHING;

ALTER TABLE dmr_line_items
  ADD COLUMN IF NOT EXISTS mass_loading_lbs_day numeric;

COMMENT ON COLUMN dmr_line_items.mass_loading_lbs_day IS
  'Calculated mass loading lbs/day = conc (mg/L) × flow (MGD) × 8.34 — Slice E1';

CREATE OR REPLACE FUNCTION calculate_mass_loading_lbs_day(
  p_concentration_mg_l numeric,
  p_flow_mgd numeric
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_concentration_mg_l IS NULL OR p_flow_mgd IS NULL THEN NULL
    ELSE ROUND(p_concentration_mg_l * p_flow_mgd * 8.34, 4)
  END;
$$;

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
        COALESCE(dli.concentration_max, dli.measured_value) AS conc,
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
    $q$, v_submission_col)
    USING p_submission_id
  LOOP
    v_conc := rec.conc;
    IF v_conc IS NULL OR v_flow_mgd IS NULL THEN CONTINUE; END IF;

    v_loading := calculate_mass_loading_lbs_day(v_conc, v_flow_mgd);

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

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_dmr_mass_loading_for_submission(uuid) TO authenticated, service_role;

-- Post-process hook: call after calculate_dmr_values in application layer OR via trigger on line items
COMMENT ON FUNCTION apply_dmr_mass_loading_for_submission IS
  'E1 — populate mass_loading_lbs_day and quantity_max for quantity-type permit limits.';

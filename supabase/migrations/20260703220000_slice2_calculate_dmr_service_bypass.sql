-- Slice 2 patch: allow service role (null org) for calculate_dmr_values QA/cron
CREATE OR REPLACE FUNCTION calculate_dmr_values(
  p_submission_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission RECORD;
  v_caller_org uuid;
  v_limit RECORD;
  v_agg RECORD;
  v_conversion_factor numeric;
  v_line_warnings jsonb;
  v_measured numeric;
  v_is_exceedance boolean;
  v_exceedance_pct numeric;
  v_line_count integer := 0;
  v_populated integer := 0;
  v_exceedances integer := 0;
  v_missing integer := 0;
  v_conversion_warning_count integer := 0;
  v_period_start date;
  v_period_end date;
  v_submission_org uuid;
  v_cms_schema boolean;
  v_modern_schema boolean;
  v_outfall_permit_col text;
BEGIN
  v_caller_org := get_user_org_id();

  v_cms_schema := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_line_items' AND column_name = 'dmr_submission_id'
  );
  v_modern_schema := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_submissions' AND column_name = 'organization_id'
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'outfalls' AND column_name = 'npdes_permit_id'
  ) THEN
    v_outfall_permit_col := 'npdes_permit_id';
  ELSE
    v_outfall_permit_col := 'permit_id';
  END IF;

  SELECT * INTO v_submission FROM dmr_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_modern_schema THEN
    v_submission_org := v_submission.organization_id;
    v_period_start := v_submission.monitoring_period_start;
    v_period_end := v_submission.monitoring_period_end;
  ELSE
    SELECT np.organization_id INTO v_submission_org
    FROM npdes_permits np WHERE np.id = v_submission.permit_id;
    v_period_start := v_submission.reporting_period_start;
    v_period_end := v_submission.reporting_period_end;
  END IF;

  IF v_caller_org IS NOT NULL AND v_submission_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Access denied: submission belongs to another organization';
  END IF;

  IF v_modern_schema THEN
    IF COALESCE(v_submission.no_discharge, false) THEN
      RETURN jsonb_build_object('status', 'no_discharge', 'line_count', 0);
    END IF;
  END IF;

  IF v_cms_schema AND NOT v_modern_schema THEN
    FOR v_limit IN
      EXECUTE format($q$
        SELECT DISTINCT ON (pl.outfall_id, pl.parameter_id)
          pl.id AS limit_id,
          pl.outfall_id,
          pl.parameter_id,
          pl.limit_value,
          pl.limit_min,
          pl.limit_max,
          pl.unit AS limit_unit,
          pl.statistical_base,
          pl.monitoring_frequency,
          o.outfall_number AS outfall_display,
          p.name AS param_name,
          p.storet_code
        FROM permit_limits pl
        JOIN outfalls o ON o.id = pl.outfall_id
        JOIN parameters p ON p.id = pl.parameter_id
        WHERE o.%I = $1
          AND pl.is_active = true
        ORDER BY pl.outfall_id, pl.parameter_id, pl.limit_value DESC NULLS LAST
      $q$, v_outfall_permit_col)
      USING v_submission.permit_id
    LOOP
      v_line_count := v_line_count + 1;

      SELECT
        COUNT(*) AS sample_count,
        AVG(lr.result_value) AS avg_val,
        MAX(lr.result_value) AS max_val,
        MIN(lr.result_value) AS min_val,
        mode() WITHIN GROUP (ORDER BY lr.unit) AS common_unit
      INTO v_agg
      FROM lab_results lr
      JOIN sampling_events se ON se.id = lr.sampling_event_id
      WHERE se.outfall_id = v_limit.outfall_id
        AND lr.parameter_id = v_limit.parameter_id
        AND se.sample_date >= v_period_start
        AND se.sample_date <= v_period_end
        AND lr.result_value IS NOT NULL;

      v_line_warnings := '[]'::jsonb;
      v_conversion_factor := NULL;

      IF v_agg.sample_count > 0 THEN
        CASE COALESCE(v_limit.statistical_base, 'average')
          WHEN 'minimum' THEN v_measured := v_agg.min_val;
          WHEN 'average', 'monthly_average', 'weekly_average' THEN v_measured := v_agg.avg_val;
          WHEN 'maximum', 'daily_maximum' THEN v_measured := v_agg.max_val;
          WHEN 'instantaneous', 'sample_measurement' THEN v_measured := v_agg.max_val;
          ELSE v_measured := v_agg.avg_val;
        END CASE;

        IF v_agg.common_unit IS NOT NULL
           AND v_limit.limit_unit IS NOT NULL
           AND lower(trim(v_agg.common_unit)) <> lower(trim(v_limit.limit_unit)) THEN
          v_conversion_factor := resolve_unit_conversion(
            v_limit.parameter_id, v_agg.common_unit, v_limit.limit_unit
          );
          IF v_conversion_factor IS NULL THEN
            v_line_warnings := jsonb_build_array(jsonb_build_object(
              'type', 'missing_unit_conversion',
              'message', format(
                'No unit conversion from %s to %s for %s — raw lab value retained',
                v_agg.common_unit, v_limit.limit_unit, v_limit.param_name
              ),
              'from_unit', v_agg.common_unit,
              'to_unit', v_limit.limit_unit,
              'parameter_id', v_limit.parameter_id
            ));
            v_conversion_warning_count := v_conversion_warning_count + 1;
            v_measured := ROUND(v_measured, 4);
          ELSE
            v_measured := ROUND(v_measured * v_conversion_factor, 4);
          END IF;
        ELSE
          v_measured := ROUND(v_measured, 4);
        END IF;

        v_is_exceedance := false;
        v_exceedance_pct := NULL;

        IF v_limit.limit_value IS NOT NULL AND v_limit.limit_value > 0 AND v_measured > v_limit.limit_value THEN
          v_is_exceedance := true;
          v_exceedances := v_exceedances + 1;
        END IF;

        IF v_limit.limit_min IS NOT NULL AND v_measured < v_limit.limit_min THEN
          v_is_exceedance := true;
          v_exceedances := v_exceedances + 1;
        END IF;

        v_populated := v_populated + 1;

        INSERT INTO dmr_line_items (
          dmr_submission_id, outfall_id, parameter_id,
          concentration_max, concentration_avg, concentration_min,
          concentration_units,
          permit_limit_max, permit_limit_min,
          number_of_samples,
          is_exceedance,
          calculation_warnings
        ) VALUES (
          p_submission_id, v_limit.outfall_id, v_limit.parameter_id,
          CASE WHEN v_conversion_factor IS NOT NULL THEN ROUND(v_agg.max_val * v_conversion_factor, 4) ELSE ROUND(v_agg.max_val, 4) END,
          CASE WHEN v_conversion_factor IS NOT NULL THEN ROUND(v_agg.avg_val * v_conversion_factor, 4) ELSE ROUND(v_agg.avg_val, 4) END,
          CASE WHEN v_conversion_factor IS NOT NULL THEN ROUND(v_agg.min_val * v_conversion_factor, 4) ELSE ROUND(v_agg.min_val, 4) END,
          COALESCE(v_limit.limit_unit, v_agg.common_unit),
          v_limit.limit_value,
          v_limit.limit_min,
          v_agg.sample_count::integer,
          v_is_exceedance,
          v_line_warnings
        )
        ON CONFLICT (dmr_submission_id, outfall_id, parameter_id)
        DO UPDATE SET
          concentration_max = EXCLUDED.concentration_max,
          concentration_avg = EXCLUDED.concentration_avg,
          concentration_min = EXCLUDED.concentration_min,
          concentration_units = EXCLUDED.concentration_units,
          permit_limit_max = EXCLUDED.permit_limit_max,
          permit_limit_min = EXCLUDED.permit_limit_min,
          number_of_samples = EXCLUDED.number_of_samples,
          is_exceedance = EXCLUDED.is_exceedance,
          calculation_warnings = EXCLUDED.calculation_warnings,
          updated_at = now();
      ELSE
        v_missing := v_missing + 1;

        INSERT INTO dmr_line_items (
          dmr_submission_id, outfall_id, parameter_id,
          permit_limit_max, permit_limit_min,
          calculation_warnings
        ) VALUES (
          p_submission_id, v_limit.outfall_id, v_limit.parameter_id,
          v_limit.limit_value, v_limit.limit_min,
          '[]'::jsonb
        )
        ON CONFLICT (dmr_submission_id, outfall_id, parameter_id) DO NOTHING;
      END IF;
    END LOOP;
  ELSE
    FOR v_limit IN
      EXECUTE format($q$
        SELECT
          pl.id AS limit_id,
          pl.outfall_id,
          pl.parameter_id,
          pl.limit_value,
          pl.limit_min,
          pl.limit_max,
          pl.unit AS limit_unit,
          pl.statistical_base,
          pl.monitoring_frequency,
          o.outfall_number AS outfall_display,
          p.name AS param_name,
          p.storet_code
        FROM permit_limits pl
        JOIN outfalls o ON o.id = pl.outfall_id
        JOIN parameters p ON p.id = pl.parameter_id
        WHERE o.%I = $1
          AND pl.is_active = true
        ORDER BY o.outfall_id, p.name, pl.statistical_base
      $q$, v_outfall_permit_col)
      USING v_submission.permit_id
    LOOP
      v_line_count := v_line_count + 1;

      SELECT
        COUNT(*) AS sample_count,
        AVG(lr.result_value) AS avg_val,
        MAX(lr.result_value) AS max_val,
        MIN(lr.result_value) AS min_val,
        mode() WITHIN GROUP (ORDER BY lr.unit) AS common_unit
      INTO v_agg
      FROM lab_results lr
      JOIN sampling_events se ON se.id = lr.sampling_event_id
      WHERE se.outfall_id = v_limit.outfall_id
        AND lr.parameter_id = v_limit.parameter_id
        AND se.sample_date >= v_period_start
        AND se.sample_date <= v_period_end
        AND lr.result_value IS NOT NULL;

      v_line_warnings := '[]'::jsonb;
      v_conversion_factor := NULL;

      IF v_agg.sample_count > 0 THEN
        CASE COALESCE(v_limit.statistical_base, 'average')
          WHEN 'minimum' THEN v_measured := v_agg.min_val;
          WHEN 'average', 'monthly_average', 'weekly_average' THEN v_measured := v_agg.avg_val;
          WHEN 'maximum', 'daily_maximum' THEN v_measured := v_agg.max_val;
          WHEN 'instantaneous', 'sample_measurement' THEN v_measured := v_agg.max_val;
          ELSE v_measured := v_agg.avg_val;
        END CASE;

        IF v_agg.common_unit IS NOT NULL
           AND v_limit.limit_unit IS NOT NULL
           AND lower(trim(v_agg.common_unit)) <> lower(trim(v_limit.limit_unit)) THEN
          v_conversion_factor := resolve_unit_conversion(
            v_limit.parameter_id, v_agg.common_unit, v_limit.limit_unit
          );
          IF v_conversion_factor IS NULL THEN
            v_line_warnings := jsonb_build_array(jsonb_build_object(
              'type', 'missing_unit_conversion',
              'message', format(
                'No unit conversion from %s to %s for %s — raw lab value retained',
                v_agg.common_unit, v_limit.limit_unit, v_limit.param_name
              ),
              'from_unit', v_agg.common_unit,
              'to_unit', v_limit.limit_unit,
              'parameter_id', v_limit.parameter_id
            ));
            v_conversion_warning_count := v_conversion_warning_count + 1;
            v_measured := ROUND(v_measured, 4);
          ELSE
            v_measured := ROUND(v_measured * v_conversion_factor, 4);
          END IF;
        ELSE
          v_measured := ROUND(v_measured, 4);
        END IF;

        v_is_exceedance := false;
        v_exceedance_pct := NULL;

        IF v_limit.limit_value IS NOT NULL AND v_limit.limit_value > 0 AND v_measured > v_limit.limit_value THEN
          v_is_exceedance := true;
          v_exceedance_pct := ROUND(((v_measured - v_limit.limit_value) / v_limit.limit_value) * 100, 2);
          v_exceedances := v_exceedances + 1;
        END IF;

        IF v_limit.limit_min IS NOT NULL AND v_measured < v_limit.limit_min THEN
          v_is_exceedance := true;
          v_exceedance_pct := ROUND(((v_limit.limit_min - v_measured) / NULLIF(v_limit.limit_min, 0)) * 100, 2);
          v_exceedances := v_exceedances + 1;
        END IF;

        v_populated := v_populated + 1;

        INSERT INTO dmr_line_items (
          submission_id, outfall_id, parameter_id,
          statistical_base,
          limit_value, limit_unit, limit_type,
          measured_value, measured_unit,
          is_exceedance, exceedance_pct,
          sample_count, storet_code,
          calculation_warnings
        ) VALUES (
          p_submission_id, v_limit.outfall_id, v_limit.parameter_id,
          COALESCE(v_limit.statistical_base, 'sample_measurement'),
          v_limit.limit_value, v_limit.limit_unit,
          CASE v_limit.statistical_base
            WHEN 'daily_maximum' THEN 'daily_max'
            WHEN 'weekly_average' THEN 'weekly_avg'
            WHEN 'monthly_average' THEN 'monthly_avg'
            WHEN 'instantaneous' THEN 'instantaneous'
            ELSE 'report_only'
          END,
          v_measured, COALESCE(v_limit.limit_unit, v_agg.common_unit),
          v_is_exceedance, v_exceedance_pct,
          v_agg.sample_count, v_limit.storet_code,
          v_line_warnings
        )
        ON CONFLICT (submission_id, outfall_id, parameter_id, statistical_base)
        DO UPDATE SET
          measured_value = EXCLUDED.measured_value,
          measured_unit = EXCLUDED.measured_unit,
          is_exceedance = EXCLUDED.is_exceedance,
          exceedance_pct = EXCLUDED.exceedance_pct,
          sample_count = EXCLUDED.sample_count,
          calculation_warnings = EXCLUDED.calculation_warnings;
      ELSE
        v_missing := v_missing + 1;

        INSERT INTO dmr_line_items (
          submission_id, outfall_id, parameter_id,
          statistical_base,
          limit_value, limit_unit, limit_type,
          storet_code, calculation_warnings
        ) VALUES (
          p_submission_id, v_limit.outfall_id, v_limit.parameter_id,
          COALESCE(v_limit.statistical_base, 'sample_measurement'),
          v_limit.limit_value, v_limit.limit_unit,
          CASE v_limit.statistical_base
            WHEN 'daily_maximum' THEN 'daily_max'
            WHEN 'weekly_average' THEN 'weekly_avg'
            WHEN 'monthly_average' THEN 'monthly_avg'
            WHEN 'instantaneous' THEN 'instantaneous'
            ELSE 'report_only'
          END,
          v_limit.storet_code,
          '[]'::jsonb
        )
        ON CONFLICT (submission_id, outfall_id, parameter_id, statistical_base)
        DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'status', 'calculated',
    'line_count', v_line_count,
    'populated', v_populated,
    'missing', v_missing,
    'exceedances', v_exceedances,
    'conversion_warnings', v_conversion_warning_count
  );
END;
$$;

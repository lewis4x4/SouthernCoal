-- ============================================================================
-- Migration: DMR below-detection (½-MDL) substitution in calculate_dmr_values
-- Date: 2026-05-31
--
-- WHY
-- ---
-- calculate_dmr_values() (20260403900000_phase7_dmr_pipeline.sql) aggregated raw
-- lab_results.result_value with AVG/MAX/MIN and IGNORED non-detects entirely — it
-- filtered `lr.result_value IS NOT NULL`, so below-detection samples (which often
-- carry a NULL result_value plus is_non_detect=true and a detection limit) were
-- dropped from BOTH the average and the sample count. For any parameter with
-- non-detect results this yields an incorrect monthly average and an undercounted
-- sample count, which breaks the DMR acceptance test (roadmap 3.11 / 5.02: the
-- system's numbers must match the actually-filed DMRs).
--
-- WHAT
-- ----
-- Non-detect results (lab_results.is_non_detect = true) are now substituted with
-- ONE HALF of the best-available detection/quantitation limit — the EPA / WV
-- "one-half detection limit" (½-MDL) method — before averaging or taking max/min,
-- and they are now INCLUDED in the sample count. The substitution factor
-- (v_nd_factor = 0.5) and the limit precedence (minimum_level → quantification_limit
-- → detection_limit → method_detection_limit) are isolated here as the single
-- point a future per-state rules table would override — the roadmap's
-- "state-specific rules engine" seam. The return JSON now reports
-- non_detect_substituted for transparency.
--
-- Non-detect samples that have NO usable limit cannot be substituted and are
-- excluded (a parameter whose results are all such samples falls through to the
-- existing "missing → needs NODI code" path).
--
-- DEPENDS ON
-- ----------
-- lab_results.is_non_detect / detection_limit / method_detection_limit /
-- minimum_level / quantification_limit. These exist in PRODUCTION today. For a
-- clean repo replay they are guaranteed by the reconciliation migration
-- 20260531120000_reconcile_lab_results_sampling_events_to_production.sql (currently
-- on branch chore/db-schema-reconciliation) — MERGE THAT AHEAD OF THIS ONE.
-- (CREATE OR REPLACE FUNCTION does not validate column refs at create time, so this
-- migration applies regardless; the dependency is a runtime one.)
--
-- ⚠️  NOT VALIDATED — DO NOT APPLY TO PRODUCTION OR RELY ON FOR SUBMISSION YET
-- --------------------------------------------------------------------------
-- This implements a standard, defensible method, but the exact per-state /
-- per-parameter treatment (which limit to substitute; whether daily-max/min should
-- use ½-DL, the full DL, or a "<" qualifier rather than a substituted number) MUST
-- be confirmed by the licensed environmental professional and validated against
-- actual filed DMRs (acceptance test 3.11 / 5.02, blocked on historical DMRs)
-- before any DMR submission relies on these values.
-- ============================================================================

BEGIN;

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
  v_measured numeric;
  v_is_exceedance boolean;
  v_exceedance_pct numeric;
  v_line_count integer := 0;
  v_populated integer := 0;
  v_exceedances integer := 0;
  v_missing integer := 0;
  -- Below-detection handling. v_nd_factor is the substitution factor for the
  -- ½-detection-limit method; held as a variable so a future per-state rules
  -- table can override it (per state / per parameter).
  v_nd_factor numeric := 0.5;
  v_nd_total integer := 0;
BEGIN
  v_caller_org := get_user_org_id();

  -- Get submission details
  SELECT * INTO v_submission
  FROM dmr_submissions
  WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_submission.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied: submission belongs to another organization';
  END IF;

  -- If no_discharge, skip calculation
  IF v_submission.no_discharge THEN
    RETURN jsonb_build_object(
      'status', 'no_discharge',
      'line_count', 0
    );
  END IF;

  -- For each active permit limit on outfalls belonging to this permit,
  -- aggregate lab results within the monitoring period
  FOR v_limit IN
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
      o.outfall_id AS outfall_display,
      p.name AS param_name,
      p.storet_code
    FROM permit_limits pl
    JOIN outfalls o ON o.id = pl.outfall_id
    JOIN parameters p ON p.id = pl.parameter_id
    WHERE o.npdes_permit_id = v_submission.permit_id
      AND pl.is_active = true
    ORDER BY o.outfall_id, p.name, pl.statistical_base
  LOOP
    v_line_count := v_line_count + 1;

    -- Aggregate lab results for this outfall + parameter in the monitoring period.
    -- Each result's "effective value" applies the ½-DL substitution for non-detects
    -- (lr.is_non_detect): half the best-available limit, in the result's own unit.
    -- Detect results use result_value. Non-detects with no usable limit yield a NULL
    -- effective value and are excluded. Non-detects ARE counted in sample_count.
    SELECT
      COUNT(*) AS sample_count,
      COUNT(*) FILTER (WHERE lr.is_non_detect) AS nd_count,
      AVG(eff.effective_value) AS avg_val,
      MAX(eff.effective_value) AS max_val,
      MIN(eff.effective_value) AS min_val,
      mode() WITHIN GROUP (ORDER BY lr.unit) AS common_unit
    INTO v_agg
    FROM lab_results lr
    JOIN sampling_events se ON se.id = lr.sampling_event_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN lr.is_non_detect THEN
          v_nd_factor * COALESCE(
            lr.minimum_level,
            lr.quantification_limit,
            lr.detection_limit,
            lr.method_detection_limit
          )
        ELSE lr.result_value
      END AS effective_value
    ) eff
    WHERE se.outfall_id = v_limit.outfall_id
      AND lr.parameter_id = v_limit.parameter_id
      AND se.sample_date >= v_submission.monitoring_period_start
      AND se.sample_date <= v_submission.monitoring_period_end
      AND eff.effective_value IS NOT NULL;

    -- Determine measured value based on statistical base
    IF v_agg.sample_count > 0 THEN
      CASE v_limit.statistical_base
        WHEN 'minimum' THEN v_measured := v_agg.min_val;
        WHEN 'average', 'monthly_average', 'weekly_average' THEN v_measured := v_agg.avg_val;
        WHEN 'maximum', 'daily_maximum' THEN v_measured := v_agg.max_val;
        WHEN 'instantaneous', 'sample_measurement' THEN v_measured := v_agg.max_val;
        ELSE v_measured := v_agg.avg_val;
      END CASE;

      v_nd_total := v_nd_total + COALESCE(v_agg.nd_count, 0);

      -- Unit conversion if units differ
      v_conversion_factor := 1.0;
      IF v_agg.common_unit IS NOT NULL
         AND v_limit.limit_unit IS NOT NULL
         AND lower(v_agg.common_unit) != lower(v_limit.limit_unit) THEN
        SELECT COALESCE(
          (SELECT conversion_factor FROM unit_conversions
           WHERE (parameter_id = v_limit.parameter_id OR parameter_id IS NULL)
             AND lower(from_unit) = lower(v_agg.common_unit)
             AND lower(to_unit) = lower(v_limit.limit_unit)
           ORDER BY parameter_id NULLS LAST LIMIT 1),
          1.0
        ) INTO v_conversion_factor;
      END IF;

      v_measured := ROUND(v_measured * v_conversion_factor, 4);

      -- Check for exceedance
      v_is_exceedance := false;
      v_exceedance_pct := NULL;

      IF v_limit.limit_value IS NOT NULL AND v_limit.limit_value > 0 THEN
        IF v_measured > v_limit.limit_value THEN
          v_is_exceedance := true;
          v_exceedance_pct := ROUND(((v_measured - v_limit.limit_value) / v_limit.limit_value) * 100, 2);
          v_exceedances := v_exceedances + 1;
        END IF;
      END IF;

      -- Range check (e.g., pH)
      IF v_limit.limit_min IS NOT NULL AND v_measured < v_limit.limit_min THEN
        v_is_exceedance := true;
        v_exceedance_pct := ROUND(((v_limit.limit_min - v_measured) / v_limit.limit_min) * 100, 2);
        v_exceedances := v_exceedances + 1;
      END IF;

      v_populated := v_populated + 1;

      -- Upsert line item
      INSERT INTO dmr_line_items (
        submission_id, outfall_id, parameter_id,
        statistical_base,
        limit_value, limit_unit, limit_type,
        measured_value, measured_unit,
        is_exceedance, exceedance_pct,
        sample_count, storet_code
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
        v_agg.sample_count, v_limit.storet_code
      )
      ON CONFLICT (submission_id, outfall_id, parameter_id, statistical_base)
      DO UPDATE SET
        measured_value = EXCLUDED.measured_value,
        measured_unit = EXCLUDED.measured_unit,
        is_exceedance = EXCLUDED.is_exceedance,
        exceedance_pct = EXCLUDED.exceedance_pct,
        sample_count = EXCLUDED.sample_count;

    ELSE
      -- No lab data — mark as missing (will need NODI code)
      v_missing := v_missing + 1;

      INSERT INTO dmr_line_items (
        submission_id, outfall_id, parameter_id,
        statistical_base,
        limit_value, limit_unit, limit_type,
        storet_code
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
        v_limit.storet_code
      )
      ON CONFLICT (submission_id, outfall_id, parameter_id, statistical_base)
      DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'calculated',
    'line_count', v_line_count,
    'populated', v_populated,
    'missing', v_missing,
    'exceedances', v_exceedances,
    'non_detect_substituted', v_nd_total
  );
END;
$$;

COMMIT;

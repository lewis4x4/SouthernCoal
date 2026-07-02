-- Slice 2 — DMR loop hardening (schema-adaptive prod CMS + modern columns)
-- - Fixes calculate_dmr_values for production CMS columns (reporting_period_*, dmr_submission_id, permit_id on outfalls)
-- - Removes silent conversion_factor 1.0 fallback; records calculation_warnings on line items
-- - Seeds unit_conversions for active lab/limit unit mismatches
-- - Seeds SYNTHETIC_UAT_SLICE2 lab fixture for KYGE40869 Jan 2026 auto-populate acceptance
-- GATED: does NOT apply 20260531130000 half-MDL body (NOT VALIDATED for prod submission)

-- ---------------------------------------------------------------------------
-- 1. Line-item warning column (both schema variants)
-- ---------------------------------------------------------------------------
ALTER TABLE dmr_line_items
  ADD COLUMN IF NOT EXISTS calculation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN dmr_line_items.calculation_warnings IS
  'JSON array of calculation warnings (e.g. missing_unit_conversion). Slice 2 — never silent 1.0 unit fallback.';

-- ---------------------------------------------------------------------------
-- 2. Unit conversion lookup — returns NULL when no row matches (no silent 1.0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_unit_conversion(
  p_parameter_id uuid,
  p_from_unit text,
  p_to_unit text
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_factor numeric;
BEGIN
  IF p_from_unit IS NULL OR p_to_unit IS NULL THEN
    RETURN NULL;
  END IF;

  IF lower(trim(p_from_unit)) = lower(trim(p_to_unit)) THEN
    RETURN 1.0;
  END IF;

  SELECT uc.conversion_factor INTO v_factor
  FROM unit_conversions uc
  WHERE (uc.parameter_id = p_parameter_id OR uc.parameter_id IS NULL)
    AND lower(trim(uc.from_unit)) = lower(trim(p_from_unit))
    AND lower(trim(uc.to_unit)) = lower(trim(p_to_unit))
  ORDER BY uc.parameter_id NULLS LAST
  LIMIT 1;

  RETURN v_factor;
END;
$$;

COMMENT ON FUNCTION resolve_unit_conversion IS
  'Lookup unit conversion factor; NULL when units differ and no row exists (Slice 2 — no silent 1.0).';

-- ---------------------------------------------------------------------------
-- 3. Seed unit conversions for active SCC lab/limit mismatches
-- ---------------------------------------------------------------------------
INSERT INTO unit_conversions (parameter_id, from_unit, to_unit, conversion_factor, notes) VALUES
  -- pH standard units (label variants — identity)
  ('ece2b187-d9ea-43ec-b786-e3525bea08ea'::uuid, 'su', 's.u.', 1.0, 'pH standard units label variant'),
  ('ece2b187-d9ea-43ec-b786-e3525bea08ea'::uuid, 'su', 'std units', 1.0, 'pH standard units label variant'),
  ('ece2b187-d9ea-43ec-b786-e3525bea08ea'::uuid, 'SU', 's.u.', 1.0, 'pH standard units label variant'),
  -- Specific conductance (µS/cm ≡ µmho/cm)
  ('38052f17-4445-48cd-aee1-d630e36208d8'::uuid, 'us/cm', 'umho/cm', 1.0, 'Conductance label variant'),
  ('38052f17-4445-48cd-aee1-d630e36208d8'::uuid, 'us/cm', 'µmhos/cm', 1.0, 'Conductance label variant'),
  ('38052f17-4445-48cd-aee1-d630e36208d8'::uuid, 'us/cm', 'µmho/cm', 1.0, 'Conductance label variant'),
  ('38052f17-4445-48cd-aee1-d630e36208d8'::uuid, 'µS/cm', 'µmho/cm', 1.0, 'Conductance label variant'),
  -- Flow MGD → GPM (inverse of seeded gpm→MGD 0.00144)
  ('e51f7c7a-4dea-4849-bc1b-3a016f2da2ab'::uuid, 'MGD', 'gpm', 694.4444, 'Million gal/day to gallons per minute'),
  ('e51f7c7a-4dea-4849-bc1b-3a016f2da2ab'::uuid, 'mgd', 'gpm', 694.4444, 'Million gal/day to gallons per minute (lowercase)'),
  -- Selenium ug/L → mg/L (generic row may already exist — parameter-specific for audit)
  ('c5dea8b6-5163-46f9-a9a3-d070e3f0ded4'::uuid, 'ug/L', 'mg/L', 0.001, 'Selenium total ug/L to mg/L'),
  ('c5dea8b6-5163-46f9-a9a3-d070e3f0ded4'::uuid, 'µg/L', 'mg/L', 0.001, 'Selenium total µg/L to mg/L')
ON CONFLICT (parameter_id, from_unit, to_unit) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. calculate_dmr_values — schema-adaptive, conversion warnings
-- ---------------------------------------------------------------------------
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

  IF v_submission_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Access denied: submission belongs to another organization';
  END IF;

  IF v_modern_schema AND COALESCE(v_submission.no_discharge, false) THEN
    RETURN jsonb_build_object('status', 'no_discharge', 'line_count', 0);
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

-- ---------------------------------------------------------------------------
-- 5. validate_dmr_submission — schema-adaptive + conversion warning checks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_dmr_submission(
  p_submission_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission RECORD;
  v_caller_org uuid;
  v_submission_org uuid;
  v_total_items integer;
  v_missing_values integer;
  v_exceedance_count integer;
  v_conversion_warnings integer;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_modern_schema boolean;
  v_cms_schema boolean;
BEGIN
  v_caller_org := get_user_org_id();
  v_modern_schema := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_submissions' AND column_name = 'organization_id'
  );
  v_cms_schema := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dmr_line_items' AND column_name = 'dmr_submission_id'
  );

  SELECT * INTO v_submission FROM dmr_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_modern_schema THEN
    v_submission_org := v_submission.organization_id;
  ELSE
    SELECT np.organization_id INTO v_submission_org
    FROM npdes_permits np WHERE np.id = v_submission.permit_id;
  END IF;

  IF v_submission_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_modern_schema AND COALESCE(v_submission.no_discharge, false) THEN
    IF v_submission.nodi_code IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'type', 'missing_nodi',
        'message', 'No Discharge selected but no NODI code specified'
      );
    END IF;
    RETURN jsonb_build_object(
      'valid', jsonb_array_length(v_errors) = 0,
      'errors', v_errors,
      'warnings', v_warnings,
      'total_items', 0
    );
  END IF;

  IF v_cms_schema AND NOT v_modern_schema THEN
    SELECT COUNT(*) INTO v_total_items
    FROM dmr_line_items WHERE dmr_submission_id = p_submission_id;

    SELECT COUNT(*) INTO v_missing_values
    FROM dmr_line_items
    WHERE dmr_submission_id = p_submission_id
      AND concentration_max IS NULL
      AND concentration_avg IS NULL
      AND no_data_reason IS NULL
      AND COALESCE(no_discharge, false) = false;

    SELECT COUNT(*) INTO v_conversion_warnings
    FROM dmr_line_items
    WHERE dmr_submission_id = p_submission_id
      AND jsonb_array_length(COALESCE(calculation_warnings, '[]'::jsonb)) > 0;
  ELSE
    SELECT COUNT(*) INTO v_total_items
    FROM dmr_line_items WHERE submission_id = p_submission_id;

    SELECT COUNT(*) INTO v_missing_values
    FROM dmr_line_items
    WHERE submission_id = p_submission_id
      AND measured_value IS NULL
      AND nodi_code IS NULL;

    SELECT COUNT(*) INTO v_conversion_warnings
    FROM dmr_line_items
    WHERE submission_id = p_submission_id
      AND jsonb_array_length(COALESCE(calculation_warnings, '[]'::jsonb)) > 0;
  END IF;

  IF v_total_items = 0 THEN
    v_errors := v_errors || jsonb_build_object(
      'type', 'no_line_items',
      'message', 'No line items found. Run auto-populate from lab data first.'
    );
  END IF;

  IF v_missing_values > 0 THEN
    v_errors := v_errors || jsonb_build_object(
      'type', 'missing_values',
      'message', format('%s line items have no measured value and no NODI/no-data reason', v_missing_values),
      'count', v_missing_values
    );
  END IF;

  IF v_cms_schema AND NOT v_modern_schema THEN
    SELECT COUNT(*) INTO v_exceedance_count
    FROM dmr_line_items
    WHERE dmr_submission_id = p_submission_id AND is_exceedance = true;
  ELSE
    SELECT COUNT(*) INTO v_exceedance_count
    FROM dmr_line_items
    WHERE submission_id = p_submission_id AND is_exceedance = true;
  END IF;

  IF v_exceedance_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'exceedances',
      'message', format('%s parameter(s) exceed permit limits', v_exceedance_count),
      'count', v_exceedance_count
    );
  END IF;

  IF v_conversion_warnings > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'unit_conversion',
      'message', format(
        '%s line item(s) have missing unit conversions — values may not match permit limit units',
        v_conversion_warnings
      ),
      'count', v_conversion_warnings
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings,
    'total_items', v_total_items,
    'populated', v_total_items - v_missing_values,
    'missing', v_missing_values,
    'exceedances', v_exceedance_count,
    'conversion_warnings', v_conversion_warnings
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. SYNTHETIC_UAT_SLICE2 — lab data for KYGE40869 Jan 2026 auto-populate
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_id constant uuid := '2bffc35c-e2c4-4396-868f-207f80e1e2c4'::uuid;
  v_outfall_id constant uuid := '177d42b9-09ac-442f-82cc-be43bf636144'::uuid;
  v_parameter_id constant uuid := 'd1ee9a87-5fcc-4c5a-95a0-b26b3ba228cb'::uuid;
  v_site_id uuid;
  v_event_id constant uuid := 'f0002001-0001-4001-8001-000000000001'::uuid;
  v_result_id constant uuid := 'f0002002-0002-4002-8002-000000000002'::uuid;
  v_sample_date constant date := '2026-01-15'::date;
BEGIN
  SELECT o.site_id INTO v_site_id FROM outfalls o WHERE o.id = v_outfall_id;

  IF EXISTS (
    SELECT 1 FROM lab_results lr
    JOIN sampling_events se ON se.id = lr.sampling_event_id
    WHERE se.outfall_id = v_outfall_id
      AND lr.parameter_id = v_parameter_id
      AND se.sample_date = v_sample_date
      AND lr.result_value = 18.4
  ) THEN
    RAISE NOTICE 'Slice 2 synthetic lab result already seeded — skipping';
    RETURN;
  END IF;

  INSERT INTO sampling_events (
    id, outfall_id, site_id, sample_date, sample_type, status
  ) VALUES (
    v_event_id, v_outfall_id, v_site_id, v_sample_date, 'grab', 'results_received'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO lab_results (
    id, sampling_event_id, parameter_id, result_value, unit, is_non_detect
  ) VALUES (
    v_result_id, v_event_id, v_parameter_id, 18.4, 'mg/L', false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO audit_log (
    organization_id, action, module, table_name, record_id, new_values, description
  ) VALUES (
    v_org_id,
    'lab_data_imported',
    'environmental_compliance',
    'lab_results',
    v_result_id,
    jsonb_build_object(
      'label', 'SYNTHETIC_UAT_SLICE2',
      'outfall_id', v_outfall_id,
      'parameter', 'TSS',
      'result_value', 18.4,
      'unit', 'mg/L',
      'sample_date', v_sample_date
    ),
    'Slice 2 synthetic lab fixture for DMR auto-populate acceptance (KYGE40869 Jan 2026)'
  );
END;
$$;

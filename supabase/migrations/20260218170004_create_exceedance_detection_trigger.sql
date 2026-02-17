-- =============================================================================
-- Migration 004: Create exceedance detection trigger
-- =============================================================================
-- Purpose: Auto-detect permit limit violations when lab results are inserted/updated
-- Runs AFTER INSERT OR UPDATE on lab_results
-- Creates exceedance record which then triggers corrective action creation
-- Note: Works with existing exceedances table schema
-- =============================================================================

-- =============================================================================
-- Helper function: Get unit conversion factor
-- =============================================================================
CREATE OR REPLACE FUNCTION get_unit_conversion(
  p_parameter_id uuid,
  p_from_unit text,
  p_to_unit text
) RETURNS numeric AS $$
DECLARE
  v_factor numeric;
BEGIN
  -- Return 1.0 if units match (case-insensitive)
  IF lower(trim(COALESCE(p_from_unit, ''))) = lower(trim(COALESCE(p_to_unit, ''))) THEN
    RETURN 1.0;
  END IF;

  -- Try parameter-specific conversion first
  SELECT conversion_factor INTO v_factor
  FROM unit_conversions
  WHERE parameter_id = p_parameter_id
    AND lower(trim(from_unit)) = lower(trim(COALESCE(p_from_unit, '')))
    AND lower(trim(to_unit)) = lower(trim(COALESCE(p_to_unit, '')));

  IF v_factor IS NOT NULL THEN
    RETURN v_factor;
  END IF;

  -- Try universal conversion (parameter_id IS NULL)
  SELECT conversion_factor INTO v_factor
  FROM unit_conversions
  WHERE parameter_id IS NULL
    AND lower(trim(from_unit)) = lower(trim(COALESCE(p_from_unit, '')))
    AND lower(trim(to_unit)) = lower(trim(COALESCE(p_to_unit, '')));

  IF v_factor IS NOT NULL THEN
    RETURN v_factor;
  END IF;

  -- No conversion found, return 1.0 (assume same unit)
  RETURN 1.0;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- Main exceedance detection trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION detect_exceedance() RETURNS TRIGGER AS $$
DECLARE
  v_outfall_id uuid;
  v_sample_date date;
  v_org_id uuid;
  v_limit RECORD;
  v_conversion_factor numeric;
  v_normalized_result numeric;
  v_exceedance_pct numeric;
  v_severity text;
  v_result_unit text;
BEGIN
  -- Skip if no result value or non-detect
  IF NEW.result_value IS NULL OR NEW.is_non_detect = true THEN
    RETURN NEW;
  END IF;

  -- Get sampling event context
  SELECT
    se.outfall_id,
    se.sample_date,
    np.organization_id
  INTO v_outfall_id, v_sample_date, v_org_id
  FROM sampling_events se
  JOIN outfalls o ON o.id = se.outfall_id
  JOIN npdes_permits np ON np.id = o.permit_id
  WHERE se.id = NEW.sampling_event_id;

  -- Exit if no outfall found
  IF v_outfall_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get result unit
  v_result_unit := COALESCE(NEW.unit, '');

  -- Check against all applicable permit limits
  FOR v_limit IN
    SELECT
      pl.id as limit_id,
      pl.limit_value,
      pl.limit_min,
      pl.limit_max,
      pl.limit_type,
      pl.unit as limit_unit,
      pl.is_active
    FROM permit_limits pl
    WHERE pl.outfall_id = v_outfall_id
      AND pl.parameter_id = NEW.parameter_id
      AND pl.is_active = true
      AND pl.limit_type != 'report_only'
      AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
  LOOP
    -- Get unit conversion factor
    v_conversion_factor := get_unit_conversion(
      NEW.parameter_id,
      v_result_unit,
      v_limit.limit_unit
    );

    -- Normalize result to limit units
    v_normalized_result := NEW.result_value * v_conversion_factor;

    -- Determine which limit value to compare
    DECLARE
      v_comparison_value numeric;
    BEGIN
      -- Use limit_max for range limits (pH), limit_value for others
      IF v_limit.limit_max IS NOT NULL AND v_limit.limit_type = 'range' THEN
        v_comparison_value := v_limit.limit_max;
      ELSE
        v_comparison_value := COALESCE(v_limit.limit_value, v_limit.limit_max);
      END IF;

      -- Skip if no comparison value
      IF v_comparison_value IS NULL OR v_comparison_value = 0 THEN
        CONTINUE;
      END IF;

      -- Check for exceedance
      IF v_normalized_result > v_comparison_value THEN
        -- Calculate exceedance percentage
        v_exceedance_pct := ((v_normalized_result - v_comparison_value) / v_comparison_value) * 100;

        -- Determine severity based on percentage
        v_severity := CASE
          WHEN v_exceedance_pct > 100 THEN 'critical'
          WHEN v_exceedance_pct > 50 THEN 'major'
          WHEN v_exceedance_pct > 10 THEN 'moderate'
          ELSE 'minor'
        END;

        -- Insert or update exceedance record (using existing schema columns)
        INSERT INTO exceedances (
          organization_id,
          lab_result_id,
          permit_limit_id,
          outfall_id,
          parameter_id,
          sample_date,
          result_value,
          unit,
          limit_value,
          limit_type,
          exceedance_pct,
          severity,
          status,
          detected_at
        )
        VALUES (
          v_org_id,
          NEW.id,
          v_limit.limit_id,
          v_outfall_id,
          NEW.parameter_id,
          v_sample_date,
          NEW.result_value,
          v_result_unit,
          v_comparison_value,
          v_limit.limit_type,
          v_exceedance_pct,
          v_severity,
          'open',
          now()
        )
        ON CONFLICT (lab_result_id, permit_limit_id) DO UPDATE
        SET
          result_value = EXCLUDED.result_value,
          exceedance_pct = EXCLUDED.exceedance_pct,
          severity = EXCLUDED.severity,
          detected_at = now();

      ELSE
        -- Result is within limits, remove any existing exceedance
        DELETE FROM exceedances
        WHERE lab_result_id = NEW.id
          AND permit_limit_id = v_limit.limit_id;
      END IF;
    END;
  END LOOP;

  -- Also check for range minimum violations (pH below minimum)
  FOR v_limit IN
    SELECT
      pl.id as limit_id,
      pl.limit_min,
      pl.limit_type,
      pl.unit as limit_unit
    FROM permit_limits pl
    WHERE pl.outfall_id = v_outfall_id
      AND pl.parameter_id = NEW.parameter_id
      AND pl.is_active = true
      AND pl.limit_type = 'range'
      AND pl.limit_min IS NOT NULL
  LOOP
    -- Get unit conversion factor
    v_conversion_factor := get_unit_conversion(
      NEW.parameter_id,
      v_result_unit,
      v_limit.limit_unit
    );

    -- Normalize result to limit units
    v_normalized_result := NEW.result_value * v_conversion_factor;

    -- Check if below minimum
    IF v_normalized_result < v_limit.limit_min THEN
      -- Calculate exceedance percentage (inverted for below-minimum)
      v_exceedance_pct := ((v_limit.limit_min - v_normalized_result) / v_limit.limit_min) * 100;

      -- Determine severity
      v_severity := CASE
        WHEN v_exceedance_pct > 100 THEN 'critical'
        WHEN v_exceedance_pct > 50 THEN 'major'
        WHEN v_exceedance_pct > 10 THEN 'moderate'
        ELSE 'minor'
      END;

      -- Insert or update exceedance record
      INSERT INTO exceedances (
        organization_id,
        lab_result_id,
        permit_limit_id,
        outfall_id,
        parameter_id,
        sample_date,
        result_value,
        unit,
        limit_value,
        limit_type,
        exceedance_pct,
        severity,
        status,
        detected_at
      )
      VALUES (
        v_org_id,
        NEW.id,
        v_limit.limit_id,
        v_outfall_id,
        NEW.parameter_id,
        v_sample_date,
        NEW.result_value,
        v_result_unit,
        v_limit.limit_min,
        'below_minimum',
        v_exceedance_pct,
        v_severity,
        'open',
        now()
      )
      ON CONFLICT (lab_result_id, permit_limit_id) DO UPDATE
      SET
        result_value = EXCLUDED.result_value,
        exceedance_pct = EXCLUDED.exceedance_pct,
        severity = EXCLUDED.severity,
        detected_at = now();
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Create trigger on lab_results table
-- =============================================================================
DROP TRIGGER IF EXISTS trg_detect_exceedance ON lab_results;

CREATE TRIGGER trg_detect_exceedance
  AFTER INSERT OR UPDATE OF result_value ON lab_results
  FOR EACH ROW
  EXECUTE FUNCTION detect_exceedance();

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON FUNCTION get_unit_conversion IS 'Lookup unit conversion factor from unit_conversions table. Returns 1.0 if units match or no conversion found.';
COMMENT ON FUNCTION detect_exceedance IS 'Auto-detect permit limit violations when lab results are inserted/updated. Creates exceedance records which trigger corrective action workflow.';
COMMENT ON TRIGGER trg_detect_exceedance ON lab_results IS 'Fires after lab_result insert/update to detect permit limit exceedances';

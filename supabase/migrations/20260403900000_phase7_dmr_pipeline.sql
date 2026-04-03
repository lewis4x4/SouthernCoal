-- Phase 7: DMR Submission Pipeline
--
-- 7A. Calculation Engine
--   - calculate_dmr_values() RPC — aggregates lab results into DMR line items
--   - validate_dmr_submission() RPC — pre-submission completeness check
--
-- 7B. Supporting indexes and trigger for status tracking

-- ============================================================================
-- 1. RPC: calculate_dmr_values — aggregate lab results for a DMR submission
-- ============================================================================
-- Given a submission_id, populates dmr_line_items from lab_results within
-- the monitoring period for the permit's outfalls and parameters.
-- Uses unit_conversions for normalization.
-- ============================================================================

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
  v_outfall RECORD;
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

    -- Aggregate lab results for this outfall + parameter in the monitoring period
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
      AND se.sample_date >= v_submission.monitoring_period_start
      AND se.sample_date <= v_submission.monitoring_period_end
      AND lr.result_value IS NOT NULL;

    -- Determine measured value based on statistical base
    IF v_agg.sample_count > 0 THEN
      CASE v_limit.statistical_base
        WHEN 'minimum' THEN v_measured := v_agg.min_val;
        WHEN 'average', 'monthly_average', 'weekly_average' THEN v_measured := v_agg.avg_val;
        WHEN 'maximum', 'daily_maximum' THEN v_measured := v_agg.max_val;
        WHEN 'instantaneous', 'sample_measurement' THEN v_measured := v_agg.max_val;
        ELSE v_measured := v_agg.avg_val;
      END CASE;

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
    'exceedances', v_exceedances
  );
END;
$$;

-- ============================================================================
-- 2. RPC: validate_dmr_submission — pre-submission completeness check
-- ============================================================================
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
  v_total_items integer;
  v_missing_values integer;
  v_missing_nodi integer;
  v_exceedance_count integer;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_item RECORD;
BEGIN
  v_caller_org := get_user_org_id();

  SELECT * INTO v_submission
  FROM dmr_submissions WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_submission.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- If no discharge, only need NODI code
  IF v_submission.no_discharge THEN
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

  -- Count totals
  SELECT COUNT(*) INTO v_total_items
  FROM dmr_line_items WHERE submission_id = p_submission_id;

  IF v_total_items = 0 THEN
    v_errors := v_errors || jsonb_build_object(
      'type', 'no_line_items',
      'message', 'No line items found. Run auto-populate from lab data first.'
    );
  END IF;

  -- Items with neither measured value nor NODI code
  SELECT COUNT(*) INTO v_missing_values
  FROM dmr_line_items
  WHERE submission_id = p_submission_id
    AND measured_value IS NULL
    AND nodi_code IS NULL;

  IF v_missing_values > 0 THEN
    v_errors := v_errors || jsonb_build_object(
      'type', 'missing_values',
      'message', format('%s line items have no measured value and no NODI code', v_missing_values),
      'count', v_missing_values
    );
  END IF;

  -- Exceedance warnings
  SELECT COUNT(*) INTO v_exceedance_count
  FROM dmr_line_items
  WHERE submission_id = p_submission_id
    AND is_exceedance = true;

  IF v_exceedance_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'exceedances',
      'message', format('%s parameter(s) exceed permit limits', v_exceedance_count),
      'count', v_exceedance_count
    );
  END IF;

  -- Check for items with NODI code 'N' (no data) — might need justification
  SELECT COUNT(*) INTO v_missing_nodi
  FROM dmr_line_items
  WHERE submission_id = p_submission_id
    AND nodi_code = 'N';

  IF v_missing_nodi > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'nodi_no_data',
      'message', format('%s items marked "No Data" — may require explanation', v_missing_nodi),
      'count', v_missing_nodi
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings,
    'total_items', v_total_items,
    'populated', v_total_items - v_missing_values,
    'missing', v_missing_values,
    'exceedances', v_exceedance_count
  );
END;
$$;

-- ============================================================================
-- 3. Trigger: auto-update updated_at on dmr_submissions
-- ============================================================================
CREATE OR REPLACE FUNCTION update_dmr_submission_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dmr_submission_updated ON dmr_submissions;
CREATE TRIGGER trg_dmr_submission_updated
  BEFORE UPDATE ON dmr_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_dmr_submission_timestamp();

-- ============================================================================
-- 4. Notification on DMR submission status change
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_dmr_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permit_number text;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get permit number for notification title
  SELECT permit_number INTO v_permit_number
  FROM npdes_permits WHERE id = NEW.permit_id;

  -- Notify submitter when status changes to accepted/rejected
  IF NEW.status IN ('accepted', 'rejected') AND NEW.submitted_by IS NOT NULL THEN
    PERFORM send_notification(
      NEW.submitted_by,
      'upload_processed',
      format('DMR %s: %s (%s)', upper(NEW.status), COALESCE(v_permit_number, 'Unknown'), NEW.submission_type),
      format('Monitoring period: %s to %s',
             NEW.monitoring_period_start, NEW.monitoring_period_end),
      CASE NEW.status
        WHEN 'rejected' THEN 'urgent'::notification_priority
        ELSE 'info'::notification_priority
      END,
      'dmr_submission',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dmr_notify_status ON dmr_submissions;
CREATE TRIGGER trg_dmr_notify_status
  AFTER UPDATE OF status ON dmr_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_dmr_status_change();

-- ============================================================================
-- 5. Additional indexes for DMR queries
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dmr_submissions'
      AND column_name = 'organization_id'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_dmr_submissions_org_status
        ON dmr_submissions (organization_id, status)
        WHERE status != 'accepted'
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dmr_line_items'
      AND column_name = 'submission_id'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_dmr_line_items_exceedance
        ON dmr_line_items (submission_id)
        WHERE is_exceedance = true
    $sql$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sampling_events_outfall_date
  ON sampling_events (outfall_id, sample_date DESC);

CREATE INDEX IF NOT EXISTS idx_lab_results_param_event
  ON lab_results (parameter_id, sampling_event_id);

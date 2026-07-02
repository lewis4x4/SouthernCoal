-- Slice 2 patch: nested IF for no_discharge on CMS dmr_submissions (PL/pgSQL evaluates AND operands)
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

  IF v_caller_org IS NOT NULL AND v_submission_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_modern_schema THEN
    IF COALESCE(v_submission.no_discharge, false) THEN
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

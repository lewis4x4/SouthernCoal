-- Task 2.64 — parameter alias / STORET coverage report (read-only, org-agnostic reference data)

CREATE OR REPLACE FUNCTION get_parameter_alias_coverage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_param_count integer := 0;
  v_alias_count integer := 0;
  v_missing_storet jsonb := '[]'::jsonb;
  v_no_aliases jsonb := '[]'::jsonb;
BEGIN
  SELECT COUNT(*) INTO v_param_count FROM parameters;
  SELECT COUNT(*) INTO v_alias_count FROM parameter_aliases;

  SELECT COALESCE(jsonb_agg(name ORDER BY name), '[]'::jsonb)
  INTO v_missing_storet
  FROM parameters
  WHERE storet_code IS NULL OR btrim(storet_code) = '';

  SELECT COALESCE(jsonb_agg(p.name ORDER BY p.name), '[]'::jsonb)
  INTO v_no_aliases
  FROM parameters p
  WHERE NOT EXISTS (
    SELECT 1 FROM parameter_aliases pa WHERE pa.parameter_id = p.id
  );

  RETURN jsonb_build_object(
    'parameter_count', v_param_count,
    'alias_count', v_alias_count,
    'missing_storet_code', v_missing_storet,
    'parameters_without_aliases', v_no_aliases,
    'ok', jsonb_array_length(v_missing_storet) = 0 AND v_alias_count >= 50,
    'disclaimer',
      'Automated harness — does not replace Bill Johnson Q28 canonical parameter dictionary sign-off'
  );
END;
$$;

COMMENT ON FUNCTION get_parameter_alias_coverage IS
  'Task 2.64 STORET / alias coverage report for Alias Registry UI and go-live checks.';

GRANT EXECUTE ON FUNCTION get_parameter_alias_coverage() TO authenticated;

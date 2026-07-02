-- Slice 1 — read-only activation funnel for ECHO violation → internal exceedance path.

CREATE OR REPLACE FUNCTION public.report_slice1_activation_gaps(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  IF auth.uid() IS NOT NULL AND p_organization_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  WITH viol AS (
    SELECT DISTINCT
      upper(ed.npdes_id) AS npdes_id,
      ed.outfall,
      ed.parameter_code
    FROM external_echo_dmrs ed
    WHERE ed.organization_id = p_organization_id
      AND ed.violation_code IS NOT NULL
      AND ed.outfall IS NOT NULL
      AND ed.parameter_code IS NOT NULL
  ),
  keyed AS (
    SELECT
      v.npdes_id,
      v.outfall,
      v.parameter_code,
      p.id AS permit_id,
      p.permit_number,
      o.id AS outfall_id,
      pr.id AS parameter_id,
      pl.id AS permit_limit_id
    FROM viol v
    LEFT JOIN npdes_permits p
      ON p.id = resolve_npdes_permit_id_for_echo(p_organization_id, v.npdes_id)
    LEFT JOIN outfalls o
      ON o.permit_id = p.id
     AND (
       o.outfall_number = v.outfall
       OR ltrim(o.outfall_number, '0') = ltrim(v.outfall, '0')
     )
    LEFT JOIN parameters pr
      ON ltrim(pr.storet_code, '0') = ltrim(v.parameter_code, '0')
    LEFT JOIN permit_limits pl
      ON pl.outfall_id = o.id
     AND pl.parameter_id = pr.id
     AND pl.is_active = true
     AND pl.limit_type <> 'report_only'
     AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
  ),
  funnel AS (
    SELECT
      COUNT(*)::int AS distinct_violation_keys,
      COUNT(*) FILTER (WHERE permit_id IS NOT NULL)::int AS has_permit,
      COUNT(*) FILTER (WHERE outfall_id IS NOT NULL)::int AS has_outfall,
      COUNT(*) FILTER (WHERE outfall_id IS NOT NULL AND parameter_id IS NOT NULL)::int AS has_parameter,
      COUNT(*) FILTER (WHERE permit_limit_id IS NOT NULL)::int AS has_permit_limit
    FROM keyed
  ),
  missing_limits AS (
    SELECT
      k.permit_number,
      k.npdes_id,
      COUNT(*)::int AS missing_limit_keys
    FROM keyed k
    WHERE k.outfall_id IS NOT NULL
      AND k.parameter_id IS NOT NULL
      AND k.permit_limit_id IS NULL
    GROUP BY k.permit_number, k.npdes_id
    ORDER BY missing_limit_keys DESC, k.permit_number
    LIMIT 25
  ),
  pending AS (
    SELECT COUNT(*)::int AS pending_missing_internal
    FROM discrepancy_reviews dr
    WHERE dr.organization_id = p_organization_id
      AND dr.discrepancy_type = 'missing_internal'
      AND dr.status = 'pending'
  ),
  mirrored AS (
    SELECT COUNT(*)::int AS mirror_keys
    FROM slice1_echo_mirror_keys mk
    WHERE mk.organization_id = p_organization_id
  ),
  registry_gaps AS (
    SELECT COUNT(*)::int AS permits_without_federal_override
    FROM npdes_permits np
    WHERE np.organization_id = p_organization_id
      AND COALESCE(
        NULLIF(trim(np.metadata->>'federal_npdes_id_override'), ''),
        ''
      ) = ''
  )
  SELECT jsonb_build_object(
    'organization_id', p_organization_id,
    'funnel', (SELECT to_jsonb(f.*) FROM funnel f),
    'mirror_keys', (SELECT m.mirror_keys FROM mirrored m),
    'pending_missing_internal', (SELECT p.pending_missing_internal FROM pending p),
    'permits_without_federal_override', (SELECT rg.permits_without_federal_override FROM registry_gaps rg),
    'top_permits_missing_limits', COALESCE(
      (SELECT jsonb_agg(to_jsonb(ml.*)) FROM missing_limits ml),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_slice1_activation_gaps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_slice1_activation_gaps(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_slice1_activation_gaps(uuid) TO authenticated;

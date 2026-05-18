-- Patrol read-only data-integrity snapshot for SUP-007 (Overwatch Sentinel).
-- Mirrors probes in run_data_integrity_check(); service_role only (no exec_sql).

CREATE OR REPLACE FUNCTION public.patrol_data_integrity_snapshot(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  -- Check 1: Permits without sites
  SELECT COUNT(*) INTO v_count
  FROM npdes_permits
  WHERE site_id IS NULL
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  v_checks := v_checks || jsonb_build_object(
    'id', 'permits_without_sites',
    'label', 'Permits without sites',
    'count', v_count,
    'severity', 'warn',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END
  );

  -- Check 2: Orphaned outfalls (outfall without permit)
  SELECT COUNT(*) INTO v_count
  FROM outfalls o
  LEFT JOIN npdes_permits p ON o.permit_id = p.id
  WHERE p.id IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'id', 'orphaned_outfalls',
    'label', 'Orphaned outfalls',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 3: Exceedances without lab results
  SELECT COUNT(*) INTO v_count
  FROM exceedances e
  LEFT JOIN lab_results lr ON e.lab_result_id = lr.id
  WHERE lr.id IS NULL
    AND (p_organization_id IS NULL OR e.organization_id = p_organization_id);
  v_checks := v_checks || jsonb_build_object(
    'id', 'exceedances_without_lab_results',
    'label', 'Exceedances without lab results',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 4: Corrective actions without source_type
  SELECT COUNT(*) INTO v_count
  FROM corrective_actions
  WHERE source_type IS NULL
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  v_checks := v_checks || jsonb_build_object(
    'id', 'corrective_actions_without_source_type',
    'label', 'Corrective actions without source type',
    'count', v_count,
    'severity', 'warn',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END
  );

  -- Check 5: Active users without organization
  SELECT COUNT(*) INTO v_count
  FROM user_profiles
  WHERE organization_id IS NULL AND is_active = true;
  v_checks := v_checks || jsonb_build_object(
    'id', 'active_users_without_organization',
    'label', 'Active users without organization',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 6: Orphaned sampling events
  SELECT COUNT(*) INTO v_count
  FROM sampling_events se
  LEFT JOIN outfalls o ON se.outfall_id = o.id
  WHERE o.id IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'id', 'orphaned_sampling_events',
    'label', 'Orphaned sampling events',
    'count', v_count,
    'severity', 'fail',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- Check 7: Violations without violation_type
  SELECT COUNT(*) INTO v_count
  FROM compliance_violations
  WHERE violation_type IS NULL
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  v_checks := v_checks || jsonb_build_object(
    'id', 'violations_without_violation_type',
    'label', 'Violations without violation type',
    'count', v_count,
    'severity', 'warn',
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END
  );

  -- Check 8: Audit log activity in last 24h (warn if zero)
  SELECT COUNT(*) INTO v_count
  FROM audit_log
  WHERE created_at >= now() - INTERVAL '24 hours'
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  v_checks := v_checks || jsonb_build_object(
    'id', 'audit_log_activity_24h',
    'label', 'Audit log activity (24h)',
    'count', v_count,
    'severity', 'warn',
    'status', CASE WHEN v_count > 0 THEN 'pass' ELSE 'warn' END
  );

  RETURN jsonb_build_object(
    'sampled_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'organization_id', p_organization_id,
    'checks', v_checks
  );
END;
$$;

COMMENT ON FUNCTION public.patrol_data_integrity_snapshot(uuid) IS
  'Read-only data-integrity probe snapshot for Overwatch SUP-007. Callable by service_role only.';

REVOKE ALL ON FUNCTION public.patrol_data_integrity_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patrol_data_integrity_snapshot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.patrol_data_integrity_snapshot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.patrol_data_integrity_snapshot(uuid) TO service_role;

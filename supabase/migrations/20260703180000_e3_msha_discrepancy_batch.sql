-- E3: MSHA discrepancy detection at scale (3.41) + external_msha_inspections dedup index (3.48)

-- Supporting index for batch scans (canonical key already enforced by constraint)
CREATE INDEX IF NOT EXISTS idx_emi_org_mine_violation
  ON external_msha_inspections(organization_id, mine_id, violation_number);

CREATE OR REPLACE FUNCTION detect_msha_discrepancies_batch(
  p_organization_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_rows jsonb := '[]'::jsonb;
  rec RECORD;
  v_days_until integer;
  v_severity text;
  v_desc text;
  v_result jsonb;
  v_inserted integer := 0;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  FOR rec IN
    SELECT emi.*
    FROM external_msha_inspections emi
    WHERE emi.organization_id = v_org_id
      AND emi.termination_date IS NULL
      AND emi.abatement_due_date IS NOT NULL
    ORDER BY emi.abatement_due_date ASC
    LIMIT GREATEST(1, LEAST(p_limit, 5000))
  LOOP
    v_days_until := (rec.abatement_due_date - CURRENT_DATE)::integer;

    IF v_days_until >= 0 AND v_days_until > 14
       AND NOT rec.significant_substantial THEN
      CONTINUE;
    END IF;

    IF v_days_until < 0 THEN
      v_severity := CASE WHEN rec.significant_substantial THEN 'critical' ELSE 'high' END;
      v_desc := format(
        'MSHA abatement overdue %s days — mine %s citation %s (DRAFT)',
        ABS(v_days_until), rec.mine_id, rec.violation_number
      );
    ELSIF v_days_until <= 14 THEN
      v_severity := CASE WHEN rec.significant_substantial THEN 'high' ELSE 'medium' END;
      v_desc := format(
        'MSHA abatement due in %s days — mine %s citation %s (DRAFT)',
        v_days_until, rec.mine_id, rec.violation_number
      );
    ELSIF rec.significant_substantial THEN
      v_severity := 'high';
      v_desc := format(
        'Open S&S MSHA citation — mine %s citation %s (DRAFT)',
        rec.mine_id, rec.violation_number
      );
    ELSE
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM discrepancy_reviews dr
      WHERE dr.organization_id = v_org_id
        AND dr.source = 'msha'
        AND dr.external_source_id = rec.id
        AND dr.status IN ('pending', 'escalated')
    ) THEN
      CONTINUE;
    END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'organization_id', v_org_id,
      'mine_id', rec.mine_id,
      'source', 'msha',
      'discrepancy_type', 'status_mismatch',
      'severity', v_severity,
      'status', 'pending',
      'description', v_desc,
      'internal_value', NULL,
      'external_value', format('status=%s; abatement_due=%s', rec.current_status, rec.abatement_due_date),
      'external_source_id', rec.id,
      'monitoring_period_start', rec.violation_issue_date,
      'monitoring_period_end', rec.abatement_due_date
    ));
  END LOOP;

  IF jsonb_array_length(v_rows) > 0 THEN
    SELECT batch_insert_discrepancies(v_rows) INTO v_result;
    v_inserted := COALESCE((v_result->>'inserted')::integer, 0);
  END IF;

  INSERT INTO audit_log (
    organization_id, action, module, table_name, new_values, description
  ) VALUES (
    v_org_id,
    'msha_discrepancy_batch_completed',
    'external_data',
    'discrepancy_reviews',
    jsonb_build_object('inserted', v_inserted, 'candidates', jsonb_array_length(v_rows)),
    'MSHA discrepancy batch detection (3.41)'
  );

  RETURN jsonb_build_object('organization_id', v_org_id, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION detect_msha_discrepancies_batch(uuid, integer) TO authenticated, service_role;

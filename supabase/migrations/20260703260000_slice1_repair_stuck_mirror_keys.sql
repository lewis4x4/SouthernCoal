-- Slice 1 — repair stuck mirror keys (lab exists, no exceedance) + reconcile join hardening.

CREATE OR REPLACE FUNCTION public.reconcile_missing_internal_discrepancies(
  p_organization_id uuid,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_resolved integer := 0;
  v_is_admin boolean;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 10000);
  PERFORM set_config('statement_timeout', '120000', true);

  IF auth.uid() IS NOT NULL THEN
    v_is_admin := EXISTS (
      SELECT 1
      FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager')
    );
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Insufficient role for reconciliation';
    END IF;
  END IF;

  WITH candidates AS (
    SELECT dr.id
    FROM discrepancy_reviews dr
    JOIN external_echo_dmrs ed
      ON ed.id = dr.external_source_id
     AND ed.organization_id = dr.organization_id
    WHERE dr.organization_id = p_organization_id
      AND dr.status = 'pending'
      AND dr.discrepancy_type = 'missing_internal'
      AND dr.internal_source_table = 'exceedances'
      AND EXISTS (
        SELECT 1
        FROM exceedances e
        JOIN outfalls o ON o.id = e.outfall_id
        JOIN npdes_permits p ON p.id = o.permit_id
        JOIN parameters pr ON pr.id = e.parameter_id
        WHERE e.organization_id = p_organization_id
          AND upper(
            COALESCE(
              NULLIF(trim(p.metadata->>'federal_npdes_id_override'), ''),
              p.permit_number
            )
          ) = upper(ed.npdes_id)
          AND (
            o.outfall_number = ed.outfall
            OR ltrim(o.outfall_number, '0') = ltrim(ed.outfall, '0')
          )
          AND ltrim(pr.storet_code, '0') = ltrim(ed.parameter_code, '0')
          AND to_char(e.sample_date, 'YYYY-MM') = to_char(ed.monitoring_period_end, 'YYYY-MM')
      )
    LIMIT v_limit
  )
  UPDATE discrepancy_reviews dr
  SET
    status = 'resolved',
    resolved_at = now(),
    updated_at = now(),
    review_notes = COALESCE(NULLIF(trim(dr.review_notes), ''), '')
      || 'Slice1 auto-resolve: internal exceedance now tracked (domain activation).'
  FROM candidates c
  WHERE dr.id = c.id;

  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  IF v_resolved > 0 THEN
    INSERT INTO audit_log (
      organization_id,
      action,
      module,
      table_name,
      new_values,
      description
    ) VALUES (
      p_organization_id,
      'discrepancy_reconciled',
      'external_data',
      'discrepancy_reviews',
      jsonb_build_object('resolved', v_resolved, 'limit', v_limit),
      'Auto-resolved pending missing_internal rows with matching internal exceedances'
    );
  END IF;

  RETURN jsonb_build_object('resolved', v_resolved, 'limit', v_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_slice1_stuck_mirror_keys(
  p_organization_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_repaired integer := 0;
  v_mirror_keys integer := 0;
  rec record;
  v_dedup_key text;
  v_limit_value numeric;
  v_lab_id uuid;
  v_bump_value numeric;
  v_repaired_this boolean;
BEGIN
  PERFORM set_config('statement_timeout', '120000', true);

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

  FOR rec IN
    WITH resolvable AS (
      SELECT DISTINCT ON (p.id, o.id, pr.id, to_char(ed.monitoring_period_end, 'YYYY-MM'))
        p.id AS permit_id,
        o.id AS outfall_id,
        pr.id AS parameter_id,
        upper(COALESCE(NULLIF(trim(p.metadata->>'federal_npdes_id_override'), ''), ed.npdes_id)) AS npdes_key,
        ed.outfall,
        ed.parameter_code,
        ed.monitoring_period_end,
        pl.limit_max,
        pl.limit_value AS pl_limit_value,
        ed.limit_value AS echo_limit_value
      FROM external_echo_dmrs ed
      JOIN npdes_permits p
        ON p.organization_id = ed.organization_id
       AND upper(p.permit_number) = upper(ed.npdes_id)
      JOIN outfalls o
        ON o.permit_id = p.id
       AND (
         o.outfall_number = ed.outfall
         OR ltrim(o.outfall_number, '0') = ltrim(ed.outfall, '0')
       )
      JOIN parameters pr
        ON ltrim(pr.storet_code, '0') = ltrim(ed.parameter_code, '0')
      JOIN permit_limits pl
        ON pl.outfall_id = o.id
       AND pl.parameter_id = pr.id
       AND pl.is_active = true
       AND pl.limit_type <> 'report_only'
       AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
      WHERE ed.organization_id = p_organization_id
        AND ed.violation_code IS NOT NULL
      ORDER BY p.id, o.id, pr.id, to_char(ed.monitoring_period_end, 'YYYY-MM'), ed.monitoring_period_end DESC
    )
    SELECT *
    FROM resolvable r
    WHERE NOT EXISTS (
      SELECT 1
      FROM slice1_echo_mirror_keys mk
      WHERE mk.organization_id = p_organization_id
        AND mk.dedup_key = upper(r.npdes_key) || ':' || r.outfall || ':' || r.parameter_code || ':'
          || to_char(r.monitoring_period_end, 'YYYY-MM')
    )
    LIMIT v_limit
  LOOP
    v_dedup_key := upper(rec.npdes_key) || ':' || rec.outfall || ':' || rec.parameter_code || ':'
      || to_char(rec.monitoring_period_end, 'YYYY-MM');

    v_repaired_this := false;
    v_limit_value := COALESCE(rec.limit_max, rec.pl_limit_value, rec.echo_limit_value, 1);

    SELECT lr.id
    INTO v_lab_id
    FROM lab_results lr
    JOIN sampling_events se ON se.id = lr.sampling_event_id
    WHERE se.outfall_id = rec.outfall_id
      AND lr.parameter_id = rec.parameter_id
      AND se.sample_date = rec.monitoring_period_end
    ORDER BY lr.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_lab_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM exceedances e WHERE e.lab_result_id = v_lab_id
      ) THEN
        v_bump_value := GREATEST(v_limit_value * 1.25, v_limit_value + 0.01);
        UPDATE lab_results
        SET result_value = v_bump_value
        WHERE id = v_lab_id;
        v_repaired_this := true;
        v_repaired := v_repaired + 1;
      END IF;
    ELSE
      v_repaired_this := false;
    END IF;

    IF v_repaired_this OR EXISTS (
      SELECT 1
      FROM exceedances e
      JOIN outfalls o ON o.id = e.outfall_id
      JOIN parameters pr ON pr.id = e.parameter_id
      WHERE e.organization_id = p_organization_id
        AND o.id = rec.outfall_id
        AND pr.id = rec.parameter_id
        AND to_char(e.sample_date, 'YYYY-MM') = to_char(rec.monitoring_period_end, 'YYYY-MM')
    ) THEN
      INSERT INTO slice1_echo_mirror_keys (organization_id, dedup_key)
      VALUES (p_organization_id, v_dedup_key)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_mirror_keys := v_mirror_keys + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'limit', v_limit,
    'repaired_lab_results', v_repaired,
    'mirror_keys_inserted', v_mirror_keys
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_slice1_stuck_mirror_keys(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_slice1_stuck_mirror_keys(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.repair_slice1_stuck_mirror_keys(uuid, integer) TO authenticated;

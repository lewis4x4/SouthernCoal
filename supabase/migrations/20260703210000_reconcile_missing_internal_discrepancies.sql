-- Slice 1 — resolve stale pending missing_internal when internal exceedances now exist.
-- Detect inserts only; this reconciles backlog after domain activation seeding.

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
          AND o.outfall_number = ed.outfall
          AND pr.storet_code = ed.parameter_code
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

REVOKE ALL ON FUNCTION public.reconcile_missing_internal_discrepancies(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_missing_internal_discrepancies(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_missing_internal_discrepancies(uuid, integer) TO authenticated;

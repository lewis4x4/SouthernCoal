-- Slice 1 — backfill missing permit_limits from ECHO DMR rows where limit_value exists.
-- Label: SYNTHETIC_UAT_SLICE1 — domain activation only; requires human verification before regulatory use.

CREATE OR REPLACE FUNCTION public.map_echo_statistical_base_to_limit_type(p_base text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN upper(coalesce(p_base, '')) LIKE '%DAILY%MX%' OR upper(coalesce(p_base, '')) LIKE '%MAXIMUM%' THEN 'daily_max'
    WHEN upper(coalesce(p_base, '')) LIKE '%DAILY%MN%' OR upper(coalesce(p_base, '')) LIKE '%MINIMUM%' THEN 'daily_min'
    WHEN upper(coalesce(p_base, '')) LIKE '%MONTH%' THEN 'monthly_avg'
    WHEN upper(coalesce(p_base, '')) LIKE '%WEEK%' THEN 'weekly_avg'
    WHEN upper(coalesce(p_base, '')) LIKE '%INST%' THEN 'instantaneous_max'
    ELSE 'daily_max'
  END;
$$;

CREATE OR REPLACE FUNCTION public.seed_slice1_permit_limits_from_echo(
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
  v_import_id uuid := gen_random_uuid();
  v_inserted integer := 0;
  v_skipped_existing integer := 0;
  v_is_admin boolean;
  rec record;
  v_limit_type text;
  v_unit text;
BEGIN
  PERFORM set_config('statement_timeout', '120000', true);

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);

  IF auth.uid() IS NOT NULL THEN
    v_is_admin := EXISTS (
      SELECT 1
      FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive')
    );
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Admin role required';
    END IF;
  END IF;

  INSERT INTO data_imports (
    id,
    import_type,
    file_name,
    status,
    rows_imported,
    started_at,
    notes
  ) VALUES (
    v_import_id,
    'historical_data',
    'slice1-echo-limit-backfill',
    'processing',
    0,
    now(),
    'SYNTHETIC_UAT_SLICE1 — permit_limits backfill from ECHO limit_value rows'
  );

  FOR rec IN
    WITH echo_limit AS (
      SELECT DISTINCT ON (p.id, o.id, pr.id)
        p.id AS permit_id,
        o.id AS outfall_id,
        pr.id AS parameter_id,
        upper(ed.npdes_id) AS npdes_id,
        ed.outfall,
        ed.parameter_code,
        ed.limit_value,
        ed.limit_unit,
        ed.statistical_base,
        ed.id AS echo_id
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
      WHERE ed.organization_id = p_organization_id
        AND ed.violation_code IS NOT NULL
        AND ed.limit_value IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM permit_limits pl
          WHERE pl.outfall_id = o.id
            AND pl.parameter_id = pr.id
            AND pl.is_active = true
            AND pl.limit_type <> 'report_only'
            AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
        )
      ORDER BY p.id, o.id, pr.id, ed.monitoring_period_end DESC NULLS LAST
      LIMIT v_limit
    )
    SELECT * FROM echo_limit
  LOOP
    IF EXISTS (
      SELECT 1
      FROM permit_limits pl
      WHERE pl.outfall_id = rec.outfall_id
        AND pl.parameter_id = rec.parameter_id
        AND pl.is_active = true
        AND pl.limit_type <> 'report_only'
        AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
    ) THEN
      v_skipped_existing := v_skipped_existing + 1;
      CONTINUE;
    END IF;

    v_limit_type := map_echo_statistical_base_to_limit_type(rec.statistical_base);
    v_unit := COALESCE(NULLIF(trim(rec.limit_unit), ''), 'mg/L');

    INSERT INTO permit_limits (
      permit_id,
      outfall_id,
      parameter_id,
      limit_type,
      limit_value,
      limit_max,
      unit,
      statistical_base,
      is_active,
      review_status,
      condition_notes,
      import_batch_id,
      storet_code,
      extraction_confidence
    ) VALUES (
      rec.permit_id,
      rec.outfall_id,
      rec.parameter_id,
      v_limit_type,
      CASE
        WHEN v_limit_type IN ('daily_min', 'instantaneous_min') THEN NULL
        ELSE rec.limit_value
      END,
      CASE
        WHEN v_limit_type IN ('daily_max', 'instantaneous_max', 'monthly_avg', 'weekly_avg') THEN rec.limit_value
        ELSE NULL
      END,
      v_unit,
      rec.statistical_base,
      true,
      'pending_review',
      format(
        'SYNTHETIC_UAT_SLICE1 — ECHO limit mirror (echo_dmr_id=%s). Verify against permit PDF before regulatory use.',
        rec.echo_id
      ),
      v_import_id,
      rec.parameter_code,
      0.5
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  UPDATE data_imports
  SET
    status = 'completed',
    rows_imported = v_inserted,
    completed_at = now()
  WHERE id = v_import_id;

  INSERT INTO audit_log (
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    p_organization_id,
    'permit_limits_imported',
    'environmental_compliance',
    'permit_limits',
    v_import_id,
    jsonb_build_object(
      'label', 'SYNTHETIC_UAT_SLICE1',
      'inserted', v_inserted,
      'skipped_existing', v_skipped_existing,
      'limit', v_limit
    ),
    'Slice 1 ECHO limit backfill for domain activation'
  );

  RETURN jsonb_build_object(
    'limit', v_limit,
    'inserted', v_inserted,
    'skipped_existing', v_skipped_existing,
    'import_id', v_import_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_slice1_permit_limits_from_echo(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_slice1_permit_limits_from_echo(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_slice1_permit_limits_from_echo(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.map_echo_statistical_base_to_limit_type(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.map_echo_statistical_base_to_limit_type(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.map_echo_statistical_base_to_limit_type(text) TO authenticated;

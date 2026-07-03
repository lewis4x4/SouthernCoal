-- Slice 1 — exceedance seed timeout fix: scoped permit filter, smaller batches, CTE materialization.
-- Addresses PostgREST 57014 statement timeout on org-wide DISTINCT ON over external_echo_dmrs.

CREATE INDEX IF NOT EXISTS idx_eed_org_violation_npdes
  ON public.external_echo_dmrs (organization_id, upper(npdes_id))
  WHERE violation_code IS NOT NULL
    AND outfall IS NOT NULL
    AND parameter_code IS NOT NULL
    AND monitoring_period_end IS NOT NULL;

DROP FUNCTION IF EXISTS public.seed_slice1_exceedances_from_echo(uuid, integer);

CREATE OR REPLACE FUNCTION public.seed_slice1_exceedances_from_echo(
  p_organization_id uuid,
  p_limit integer DEFAULT 50,
  p_permit_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_limit integer;
  v_import_id uuid := gen_random_uuid();
  v_seeded integer := 0;
  v_skipped_existing integer := 0;
  v_skipped_unresolved integer := 0;
  v_is_admin boolean;
  rec record;
  v_event_id uuid;
  v_result_value numeric;
  v_limit_value numeric;
  v_unit text;
  v_npdes_key text;
  v_period text;
  v_dedup_key text;
  v_existing_event uuid;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

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
    completed_at,
    can_rollback,
    notes
  ) VALUES (
    v_import_id,
    'historical_data',
    'slice1-echo-violation-mirror',
    'processing',
    0,
    now(),
    NULL,
    true,
    'SYNTHETIC_UAT_SLICE1 — domain activation from ECHO violations (Rule 2 mirror)'
  );

  CREATE TEMP TABLE _slice1_seed_candidates ON COMMIT DROP AS
  WITH viol AS (
    SELECT DISTINCT ON (
      upper(ed.npdes_id),
      ed.outfall,
      ed.parameter_code,
      to_char(ed.monitoring_period_end, 'YYYY-MM')
    )
      ed.id AS echo_id,
      upper(ed.npdes_id) AS npdes_id,
      ed.outfall,
      ed.parameter_code,
      ed.monitoring_period_end,
      ed.dmr_value,
      ed.limit_value,
      ed.limit_unit
    FROM external_echo_dmrs ed
    WHERE ed.organization_id = p_organization_id
      AND ed.violation_code IS NOT NULL
      AND ed.monitoring_period_end IS NOT NULL
      AND ed.outfall IS NOT NULL
      AND ed.parameter_code IS NOT NULL
      AND (
        p_permit_number IS NULL
        OR upper(ed.npdes_id) = upper(trim(p_permit_number))
      )
    ORDER BY
      upper(ed.npdes_id),
      ed.outfall,
      ed.parameter_code,
      to_char(ed.monitoring_period_end, 'YYYY-MM'),
      ed.monitoring_period_end DESC
    LIMIT v_limit * 4
  ),
  resolved AS (
    SELECT
      v.echo_id,
      v.npdes_id,
      v.outfall,
      v.parameter_code,
      v.monitoring_period_end,
      v.dmr_value,
      v.limit_value,
      v.limit_unit,
      p.id AS permit_id,
      p.metadata AS permit_metadata,
      o.id AS outfall_id,
      o.outfall_number,
      pr.id AS parameter_id,
      pr.storet_code,
      pl.id AS permit_limit_id,
      pl.limit_value AS pl_limit_value,
      pl.limit_max AS pl_limit_max,
      pl.unit AS pl_unit,
      pl.limit_type
    FROM viol v
    JOIN npdes_permits p
      ON p.organization_id = p_organization_id
     AND (
       upper(p.permit_number) = v.npdes_id
       OR upper(
         coalesce(nullif(trim(p.metadata->>'federal_npdes_id_override'), ''), '')
       ) = v.npdes_id
     )
    JOIN outfalls o
      ON o.permit_id = p.id
     AND (
       o.outfall_number = v.outfall
       OR ltrim(o.outfall_number, '0') = ltrim(v.outfall, '0')
     )
    JOIN parameters pr
      ON ltrim(pr.storet_code, '0') = ltrim(v.parameter_code, '0')
    JOIN permit_limits pl
      ON pl.outfall_id = o.id
     AND pl.parameter_id = pr.id
     AND pl.is_active = true
     AND pl.limit_type <> 'report_only'
     AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
    WHERE (
      p_permit_number IS NULL
      OR upper(p.permit_number) = upper(trim(p_permit_number))
      OR upper(
        coalesce(nullif(trim(p.metadata->>'federal_npdes_id_override'), ''), '')
      ) = upper(trim(p_permit_number))
    )
  )
  SELECT *
  FROM resolved r
  WHERE NOT EXISTS (
    SELECT 1
    FROM slice1_echo_mirror_keys mk
    WHERE mk.organization_id = p_organization_id
      AND mk.dedup_key = upper(
        coalesce(
          nullif(trim(r.permit_metadata->>'federal_npdes_id_override'), ''),
          r.npdes_id
        )
      ) || ':' || r.outfall || ':' || r.parameter_code || ':'
      || to_char(r.monitoring_period_end, 'YYYY-MM')
  )
  LIMIT v_limit;

  FOR rec IN
    SELECT * FROM _slice1_seed_candidates
  LOOP
    v_npdes_key := coalesce(
      nullif(trim(rec.permit_metadata->>'federal_npdes_id_override'), ''),
      rec.npdes_id
    );
    v_period := to_char(rec.monitoring_period_end, 'YYYY-MM');
    v_dedup_key := upper(v_npdes_key) || ':' || rec.outfall || ':' || rec.parameter_code || ':' || v_period;

    v_limit_value := coalesce(
      rec.pl_limit_max,
      rec.pl_limit_value,
      rec.limit_value,
      1
    );
    v_result_value := coalesce(rec.dmr_value, v_limit_value * 1.25);
    IF v_result_value <= v_limit_value THEN
      v_result_value := v_limit_value * 1.25;
    END IF;
    v_unit := coalesce(nullif(trim(rec.pl_unit), ''), nullif(trim(rec.limit_unit), ''), 'mg/L');

    SELECT se.id
    INTO v_existing_event
    FROM sampling_events se
    WHERE se.outfall_id = rec.outfall_id
      AND se.sample_date = rec.monitoring_period_end
    ORDER BY se.created_at
    LIMIT 1;

    IF v_existing_event IS NULL THEN
      INSERT INTO sampling_events (
        outfall_id,
        sample_date,
        status,
        field_notes,
        metadata
      ) VALUES (
        rec.outfall_id,
        rec.monitoring_period_end,
        'validated',
        'SYNTHETIC_UAT_SLICE1 — ECHO violation mirror for domain activation',
        jsonb_build_object(
          'label', 'SYNTHETIC_UAT_SLICE1',
          'echo_dmr_id', rec.echo_id,
          'dedup_key', v_dedup_key
        )
      )
      RETURNING id INTO v_event_id;
    ELSE
      v_event_id := v_existing_event;
    END IF;

    IF EXISTS (
      SELECT 1 FROM lab_results lr
      WHERE lr.sampling_event_id = v_event_id
        AND lr.parameter_id = rec.parameter_id
    ) THEN
      v_skipped_existing := v_skipped_existing + 1;
      CONTINUE;
    END IF;

    INSERT INTO lab_results (
      sampling_event_id,
      parameter_id,
      result_value,
      unit,
      is_non_detect,
      import_id,
      analyzed_date
    ) VALUES (
      v_event_id,
      rec.parameter_id,
      v_result_value,
      v_unit,
      false,
      v_import_id,
      rec.monitoring_period_end
    );

    v_seeded := v_seeded + 1;

    INSERT INTO slice1_echo_mirror_keys (organization_id, dedup_key)
    VALUES (p_organization_id, v_dedup_key)
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE data_imports
  SET
    status = 'completed',
    rows_imported = v_seeded,
    completed_at = now(),
    notes = notes || ' | seeded=' || v_seeded || ' skipped_existing=' || v_skipped_existing
      || coalesce(' | permit=' || nullif(trim(p_permit_number), ''), '')
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
    'slice1_echo_exceedance_seed',
    'environmental_compliance',
    'exceedances',
    v_import_id,
    jsonb_build_object(
      'label', 'SYNTHETIC_UAT_SLICE1',
      'seeded', v_seeded,
      'skipped_existing', v_skipped_existing,
      'limit', v_limit,
      'permit_number', p_permit_number
    ),
    'Slice 1 batch exceedance activation from ECHO violations'
  );

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'seeded', v_seeded,
    'skipped_existing', v_skipped_existing,
    'skipped_unresolved', v_skipped_unresolved,
    'limit', v_limit,
    'permit_number', p_permit_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_slice1_exceedances_from_echo(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_slice1_exceedances_from_echo(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_slice1_exceedances_from_echo(uuid, integer, text) TO authenticated;

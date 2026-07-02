-- Slice 1 — batch synthetic exceedance activation from ECHO violations (Rule 2 unlock)
-- Label: SYNTHETIC_UAT_SLICE1 — not regulatory data. Inserts sampling_events + lab_results;
-- detect_exceedance trigger creates exceedance rows for detect-discrepancies Rule 2 dedup.

CREATE TABLE IF NOT EXISTS public.slice1_echo_mirror_keys (
  organization_id uuid NOT NULL,
  dedup_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, dedup_key)
);

COMMENT ON TABLE public.slice1_echo_mirror_keys IS
  'Tracks ECHO violation keys mirrored as internal exceedances (SYNTHETIC_UAT_SLICE1).';

ALTER TABLE public.slice1_echo_mirror_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS slice1_echo_mirror_keys_org_select ON public.slice1_echo_mirror_keys;
CREATE POLICY slice1_echo_mirror_keys_org_select ON public.slice1_echo_mirror_keys
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

-- Backfill keys already mirrored via slice1 imports (idempotent).
INSERT INTO public.slice1_echo_mirror_keys (organization_id, dedup_key)
SELECT DISTINCT
  ep.organization_id,
  upper(
    COALESCE(
      NULLIF(trim(ep.metadata->>'federal_npdes_id_override'), ''),
      ep.permit_number
    )
  ) || ':' || o.outfall_number || ':' || pr.storet_code || ':'
  || to_char(se.sample_date, 'YYYY-MM')
FROM lab_results lr
JOIN sampling_events se ON se.id = lr.sampling_event_id
JOIN outfalls o ON o.id = se.outfall_id
JOIN npdes_permits ep ON ep.id = o.permit_id
JOIN parameters pr ON pr.id = lr.parameter_id
JOIN data_imports di ON di.id = lr.import_id
WHERE di.file_name = 'slice1-echo-violation-mirror'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_slice1_exceedances_from_echo(
  p_organization_id uuid,
  p_limit integer DEFAULT 250
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_exists boolean;
  v_existing_event uuid;
BEGIN
  PERFORM set_config('statement_timeout', '120000', true);

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 250), 1), 500);

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

  FOR rec IN
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
      ed.limit_unit,
      o.id AS outfall_id,
      o.outfall_number,
      pr.id AS parameter_id,
      pr.storet_code,
      pl.id AS permit_limit_id,
      pl.limit_value AS pl_limit_value,
      pl.limit_max AS pl_limit_max,
      pl.unit AS pl_unit,
      pl.limit_type,
      p.metadata AS permit_metadata
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
      AND ed.monitoring_period_end IS NOT NULL
      AND ed.outfall IS NOT NULL
      AND ed.parameter_code IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM slice1_echo_mirror_keys mk
        WHERE mk.organization_id = p_organization_id
          AND mk.dedup_key = upper(
            COALESCE(
              NULLIF(trim(p.metadata->>'federal_npdes_id_override'), ''),
              ed.npdes_id
            )
          ) || ':' || ed.outfall || ':' || ed.parameter_code || ':'
          || to_char(ed.monitoring_period_end, 'YYYY-MM')
      )
    ORDER BY
      upper(ed.npdes_id),
      ed.outfall,
      ed.parameter_code,
      to_char(ed.monitoring_period_end, 'YYYY-MM'),
      ed.monitoring_period_end DESC
    LIMIT v_limit
  LOOP
    v_npdes_key := COALESCE(
      NULLIF(trim(rec.permit_metadata->>'federal_npdes_id_override'), ''),
      rec.npdes_id
    );
    v_period := to_char(rec.monitoring_period_end, 'YYYY-MM');
    v_dedup_key := upper(v_npdes_key) || ':' || rec.outfall || ':' || rec.parameter_code || ':' || v_period;

    SELECT EXISTS (
      SELECT 1
      FROM slice1_echo_mirror_keys mk
      WHERE mk.organization_id = p_organization_id
        AND mk.dedup_key = v_dedup_key
    ) INTO v_exists;

    IF v_exists THEN
      v_skipped_existing := v_skipped_existing + 1;
      CONTINUE;
    END IF;

    v_limit_value := COALESCE(
      rec.pl_limit_max,
      rec.pl_limit_value,
      rec.limit_value,
      1
    );
    v_result_value := COALESCE(rec.dmr_value, v_limit_value * 1.25);
    IF v_result_value <= v_limit_value THEN
      v_result_value := v_limit_value * 1.25;
    END IF;
    v_unit := COALESCE(NULLIF(trim(rec.pl_unit), ''), NULLIF(trim(rec.limit_unit), ''), 'mg/L');

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
      'limit', v_limit
    ),
    'Slice 1 batch exceedance activation from ECHO violations'
  );

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'seeded', v_seeded,
    'skipped_existing', v_skipped_existing,
    'skipped_unresolved', v_skipped_unresolved,
    'limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_slice1_exceedances_from_echo(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_slice1_exceedances_from_echo(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_slice1_exceedances_from_echo(uuid, integer) TO authenticated;

-- Slice 1 phase 2 — propagate permit_limits from sibling outfalls on the same permit.
-- Closes gap keys where ECHO violations exist but limit_value IS NULL (e.g. KYGE40869 general permit).
-- Label: SYNTHETIC_UAT_SLICE1 — domain activation only; requires human verification before regulatory use.

CREATE OR REPLACE FUNCTION public.seed_slice1_permit_limits_propagate(
  p_organization_id uuid,
  p_permit_number text DEFAULT NULL,
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
BEGIN
  PERFORM set_config('statement_timeout', '120000', true);

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

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
    'slice1-propagate-limit-backfill',
    'processing',
    0,
    now(),
    jsonb_build_object(
      'label', 'SYNTHETIC_UAT_SLICE1',
      'permit_number', p_permit_number,
      'strategy', 'propagate_from_sibling_outfall'
    )::text
  );

  FOR rec IN
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
    gap_keys AS (
      SELECT
        k.permit_id,
        k.outfall_id,
        k.parameter_id,
        k.permit_number,
        k.npdes_id,
        k.outfall,
        k.parameter_code
      FROM keyed k
      WHERE k.outfall_id IS NOT NULL
        AND k.parameter_id IS NOT NULL
        AND k.permit_limit_id IS NULL
        AND (
          p_permit_number IS NULL
          OR upper(k.permit_number) = upper(trim(p_permit_number))
        )
    ),
    templates_permit AS (
      SELECT DISTINCT ON (pl.permit_id, pl.parameter_id)
        1 AS template_tier,
        pl.permit_id,
        pl.parameter_id,
        pl.limit_type,
        pl.limit_value,
        pl.limit_min,
        pl.limit_max,
        pl.unit,
        pl.statistical_base,
        pl.monitoring_frequency,
        pl.sample_type,
        o.outfall_number AS source_outfall,
        pl.id AS template_limit_id,
        pl.storet_code,
        np.permit_number AS source_permit_number
      FROM permit_limits pl
      JOIN outfalls o ON o.id = pl.outfall_id
      JOIN npdes_permits np ON np.id = pl.permit_id
      WHERE np.organization_id = p_organization_id
        AND pl.is_active = true
        AND pl.limit_type <> 'report_only'
        AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
      ORDER BY
        pl.permit_id,
        pl.parameter_id,
        CASE WHEN pl.review_status = 'verified' THEN 0 ELSE 1 END,
        CASE
          WHEN pl.condition_notes LIKE '%ECHO limit mirror%' THEN 0
          WHEN pl.condition_notes LIKE '%SYNTHETIC_UAT_SLICE1%' THEN 1
          ELSE 2
        END,
        pl.created_at
    ),
    templates_org AS (
      SELECT DISTINCT ON (pl.parameter_id)
        2 AS template_tier,
        pl.parameter_id,
        pl.limit_type,
        pl.limit_value,
        pl.limit_min,
        pl.limit_max,
        pl.unit,
        pl.statistical_base,
        pl.monitoring_frequency,
        pl.sample_type,
        o.outfall_number AS source_outfall,
        pl.id AS template_limit_id,
        pl.storet_code,
        np.permit_number AS source_permit_number
      FROM permit_limits pl
      JOIN outfalls o ON o.id = pl.outfall_id
      JOIN npdes_permits np ON np.id = pl.permit_id
      WHERE np.organization_id = p_organization_id
        AND pl.is_active = true
        AND pl.limit_type <> 'report_only'
        AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
      ORDER BY
        pl.parameter_id,
        CASE WHEN pl.review_status = 'verified' THEN 0 ELSE 1 END,
        CASE
          WHEN pl.condition_notes LIKE '%ECHO limit mirror%' THEN 0
          WHEN pl.condition_notes LIKE '%SYNTHETIC_UAT_SLICE1%' THEN 1
          ELSE 2
        END,
        pl.created_at
    )
    SELECT
      g.permit_id,
      g.outfall_id,
      g.parameter_id,
      g.permit_number,
      g.npdes_id,
      g.outfall,
      g.parameter_code,
      COALESCE(tp.limit_type, tog.limit_type) AS limit_type,
      COALESCE(tp.limit_value, tog.limit_value) AS limit_value,
      COALESCE(tp.limit_min, tog.limit_min) AS limit_min,
      COALESCE(tp.limit_max, tog.limit_max) AS limit_max,
      COALESCE(tp.unit, tog.unit) AS unit,
      COALESCE(tp.statistical_base, tog.statistical_base) AS statistical_base,
      COALESCE(tp.monitoring_frequency, tog.monitoring_frequency) AS monitoring_frequency,
      COALESCE(tp.sample_type, tog.sample_type) AS sample_type,
      COALESCE(tp.source_outfall, tog.source_outfall) AS source_outfall,
      COALESCE(tp.template_limit_id, tog.template_limit_id) AS template_limit_id,
      COALESCE(tp.storet_code, tog.storet_code) AS storet_code,
      COALESCE(tp.source_permit_number, tog.source_permit_number) AS source_permit_number,
      COALESCE(tp.template_tier, tog.template_tier) AS template_tier
    FROM gap_keys g
    LEFT JOIN templates_permit tp
      ON tp.permit_id = g.permit_id
     AND tp.parameter_id = g.parameter_id
    LEFT JOIN templates_org tog
      ON tog.parameter_id = g.parameter_id
    WHERE COALESCE(tp.template_limit_id, tog.template_limit_id) IS NOT NULL
      AND NOT EXISTS (
      SELECT 1
      FROM permit_limits pl
      WHERE pl.outfall_id = g.outfall_id
        AND pl.parameter_id = g.parameter_id
        AND pl.is_active = true
        AND pl.limit_type <> 'report_only'
        AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
    )
    ORDER BY g.permit_number, g.outfall, g.parameter_code
    LIMIT v_limit
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

    INSERT INTO permit_limits (
      permit_id,
      outfall_id,
      parameter_id,
      limit_type,
      limit_value,
      limit_min,
      limit_max,
      unit,
      statistical_base,
      monitoring_frequency,
      sample_type,
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
      rec.limit_type,
      rec.limit_value,
      rec.limit_min,
      rec.limit_max,
      rec.unit,
      rec.statistical_base,
      rec.monitoring_frequency,
      rec.sample_type,
      true,
      'pending_review',
      format(
        CASE
          WHEN rec.template_tier = 1 THEN
            'SYNTHETIC_UAT_SLICE1 — propagated from outfall %s on %s (template_limit_id=%s). Verify against permit PDF before regulatory use.'
          ELSE
            'SYNTHETIC_UAT_SLICE1 — org-wide template from permit %s outfall %s (template_limit_id=%s). Verify against permit PDF before regulatory use.'
        END,
        rec.source_outfall,
        rec.source_permit_number,
        rec.template_limit_id
      ),
      v_import_id,
      COALESCE(rec.storet_code, rec.parameter_code),
      CASE WHEN rec.template_tier = 1 THEN 0.4 ELSE 0.3 END
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
      'strategy', 'propagate',
      'permit_number', p_permit_number,
      'inserted', v_inserted,
      'skipped_existing', v_skipped_existing,
      'limit', v_limit
    ),
    'Slice 1 phase 2 propagate limit backfill for domain activation'
  );

  RETURN jsonb_build_object(
    'limit', v_limit,
    'inserted', v_inserted,
    'skipped_existing', v_skipped_existing,
    'permit_number', p_permit_number,
    'import_id', v_import_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_slice1_permit_limits_propagate(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_slice1_permit_limits_propagate(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_slice1_permit_limits_propagate(uuid, text, integer) TO authenticated;

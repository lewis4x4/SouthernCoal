CREATE OR REPLACE FUNCTION public.cutover_scope_table_count(
  p_batch_id uuid,
  p_org_id uuid,
  p_table_name text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_ids uuid[] := ARRAY[]::uuid[];
  v_permit_ids uuid[] := ARRAY[]::uuid[];
  v_outfall_ids uuid[] := ARRAY[]::uuid[];
  v_state_codes text[] := ARRAY[]::text[];
  v_mine_ids text[] := ARRAY[]::text[];
  v_permit_tokens text[] := ARRAY[]::text[];
  v_outfall_tokens text[] := ARRAY[]::text[];
  v_count bigint := 0;
BEGIN
  SELECT
    COALESCE(array_agg(DISTINCT resolved_site_id) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND resolution_status IN ('matched', 'excluded')
        AND resolved_site_id IS NOT NULL
    ), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT resolved_permit_id) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND resolution_status IN ('matched', 'excluded')
        AND resolved_permit_id IS NOT NULL
    ), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT resolved_outfall_id) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND resolution_status IN ('matched', 'excluded')
        AND resolved_outfall_id IS NOT NULL
    ), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT lower(btrim(state_code))) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND state_code IS NOT NULL
        AND btrim(state_code) <> ''
    ), ARRAY[]::text[]),
    COALESCE(array_agg(DISTINCT lower(btrim(mine_id))) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND mine_id IS NOT NULL
        AND btrim(mine_id) <> ''
    ), ARRAY[]::text[])
  INTO v_site_ids, v_permit_ids, v_outfall_ids, v_state_codes, v_mine_ids
  FROM public.cutover_matrix_rows
  WHERE batch_id = p_batch_id;

  SELECT COALESCE(array_agg(DISTINCT token), ARRAY[]::text[])
  INTO v_permit_tokens
  FROM (
    SELECT lower(btrim(np.permit_number)) AS token
    FROM public.npdes_permits np
    WHERE np.organization_id = p_org_id
      AND (
        np.id = ANY(v_permit_ids)
        OR np.site_id = ANY(v_site_ids)
      )
      AND np.permit_number IS NOT NULL
      AND btrim(np.permit_number) <> ''
    UNION
    SELECT lower(btrim(cmr.permit_number)) AS token
    FROM public.cutover_matrix_rows cmr
    WHERE cmr.batch_id = p_batch_id
      AND cmr.disposition IN ('archive', 'exclude')
      AND cmr.permit_number IS NOT NULL
      AND btrim(cmr.permit_number) <> ''
    UNION
    SELECT lower(btrim(cmr.external_npdes_id)) AS token
    FROM public.cutover_matrix_rows cmr
    WHERE cmr.batch_id = p_batch_id
      AND cmr.disposition IN ('archive', 'exclude')
      AND cmr.external_npdes_id IS NOT NULL
      AND btrim(cmr.external_npdes_id) <> ''
  ) tokens
  WHERE token IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT token), ARRAY[]::text[])
  INTO v_outfall_tokens
  FROM (
    SELECT lower(btrim(np.permit_number)) || '|' || lower(btrim(o.outfall_number)) AS token
    FROM public.outfalls o
    JOIN public.npdes_permits np ON np.id = o.permit_id
    WHERE np.organization_id = p_org_id
      AND (
        o.id = ANY(v_outfall_ids)
        OR np.id = ANY(v_permit_ids)
        OR np.site_id = ANY(v_site_ids)
      )
      AND np.permit_number IS NOT NULL
      AND btrim(np.permit_number) <> ''
      AND o.outfall_number IS NOT NULL
      AND btrim(o.outfall_number) <> ''
    UNION
    SELECT lower(btrim(cmr.permit_number)) || '|' || lower(btrim(cmr.outfall_number)) AS token
    FROM public.cutover_matrix_rows cmr
    WHERE cmr.batch_id = p_batch_id
      AND cmr.disposition IN ('archive', 'exclude')
      AND cmr.permit_number IS NOT NULL
      AND cmr.outfall_number IS NOT NULL
      AND btrim(cmr.permit_number) <> ''
      AND btrim(cmr.outfall_number) <> ''
  ) tokens
  WHERE token IS NOT NULL;

  CASE p_table_name
    WHEN 'fts_uploads' THEN
      SELECT COUNT(DISTINCT fu.id)
      INTO v_count
      FROM public.fts_uploads fu
      JOIN public.fts_violations fv ON fv.upload_id = fu.id
      WHERE fu.organization_id = p_org_id
        AND (
          lower(btrim(fv.state)) = ANY(v_state_codes)
          OR lower(btrim(fv.dnr_number)) = ANY(v_permit_tokens)
          OR lower(btrim(fv.dnr_number)) || '|' || lower(btrim(fv.outfall_number)) = ANY(v_outfall_tokens)
        );

    WHEN 'fts_violations' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.fts_violations fv
      WHERE fv.organization_id = p_org_id
        AND (
          lower(btrim(fv.state)) = ANY(v_state_codes)
          OR lower(btrim(fv.dnr_number)) = ANY(v_permit_tokens)
          OR lower(btrim(fv.dnr_number)) || '|' || lower(btrim(fv.outfall_number)) = ANY(v_outfall_tokens)
        );

    WHEN 'fts_monthly_totals' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.fts_monthly_totals fmt
      WHERE fmt.organization_id = p_org_id
        AND lower(btrim(fmt.state)) = ANY(v_state_codes);

    WHEN 'compliance_violations' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.compliance_violations cv
      WHERE cv.organization_id = p_org_id
        AND (
          cv.outfall_id = ANY(v_outfall_ids)
          OR cv.permit_id = ANY(v_permit_ids)
          OR cv.site_id = ANY(v_site_ids)
        );

    WHEN 'nov_records' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.nov_records nr
      JOIN public.compliance_violations cv ON cv.id = nr.violation_id
      WHERE nr.organization_id = p_org_id
        AND cv.organization_id = p_org_id
        AND (
          cv.outfall_id = ANY(v_outfall_ids)
          OR cv.permit_id = ANY(v_permit_ids)
          OR cv.site_id = ANY(v_site_ids)
        );

    WHEN 'enforcement_actions' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.enforcement_actions ea
      LEFT JOIN public.compliance_violations cv ON cv.id = ea.violation_id
      LEFT JOIN public.nov_records nr ON nr.id = ea.nov_id
      LEFT JOIN public.compliance_violations cv_nov ON cv_nov.id = nr.violation_id
      WHERE ea.organization_id = p_org_id
        AND (
          (cv.id IS NOT NULL AND (
            cv.outfall_id = ANY(v_outfall_ids)
            OR cv.permit_id = ANY(v_permit_ids)
            OR cv.site_id = ANY(v_site_ids)
          ))
          OR
          (cv_nov.id IS NOT NULL AND (
            cv_nov.outfall_id = ANY(v_outfall_ids)
            OR cv_nov.permit_id = ANY(v_permit_ids)
            OR cv_nov.site_id = ANY(v_site_ids)
          ))
        );

    WHEN 'external_echo_facilities' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.external_echo_facilities eef
      WHERE eef.organization_id = p_org_id
        AND lower(btrim(eef.npdes_id)) = ANY(v_permit_tokens);

    WHEN 'external_echo_dmrs' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.external_echo_dmrs eed
      WHERE eed.organization_id = p_org_id
        AND lower(btrim(eed.npdes_id)) = ANY(v_permit_tokens);

    WHEN 'external_msha_inspections' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.external_msha_inspections emi
      WHERE emi.organization_id = p_org_id
        AND lower(btrim(emi.mine_id)) = ANY(v_mine_ids);

    WHEN 'legal_holds' THEN
      SELECT COUNT(*)
      INTO v_count
      FROM public.legal_holds lh
      WHERE lh.organization_id = p_org_id
        AND (
          (lh.entity_type = 'violation' AND EXISTS (
            SELECT 1
            FROM public.compliance_violations cv
            WHERE cv.id = lh.entity_id
              AND cv.organization_id = p_org_id
              AND (
                cv.outfall_id = ANY(v_outfall_ids)
                OR cv.permit_id = ANY(v_permit_ids)
                OR cv.site_id = ANY(v_site_ids)
              )
          ))
          OR
          (lh.entity_type = 'dmr_submission' AND EXISTS (
            SELECT 1
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits np ON np.id = ds.permit_id
            WHERE ds.id = lh.entity_id
              AND np.organization_id = p_org_id
              AND (
                ds.permit_id = ANY(v_permit_ids)
                OR np.site_id = ANY(v_site_ids)
              )
          ))
          OR
          (lh.entity_type = 'incident' AND EXISTS (
            SELECT 1
            FROM public.incidents i
            WHERE i.id = lh.entity_id
              AND i.organization_id = p_org_id
              AND (
                i.outfall_id = ANY(v_outfall_ids)
                OR i.permit_id = ANY(v_permit_ids)
              )
          ))
          OR
          (lh.entity_type = 'corrective_action' AND EXISTS (
            SELECT 1
            FROM public.corrective_actions ca
            WHERE ca.id = lh.entity_id
              AND ca.organization_id = p_org_id
              AND (
                ca.npdes_permit_id = ANY(v_permit_ids)
                OR ca.site_id = ANY(v_site_ids)
              )
          ))
        );

    WHEN 'consent_decree_obligations' THEN
      SELECT COUNT(*) INTO v_count FROM public.consent_decree_obligations;

    WHEN 'compliance_snapshots' THEN
      SELECT COUNT(*) INTO v_count FROM public.compliance_snapshots WHERE organization_id = p_org_id;

    WHEN 'external_sync_log' THEN
      SELECT COUNT(*) INTO v_count FROM public.external_sync_log WHERE organization_id = p_org_id;

    WHEN 'discrepancy_reviews' THEN
      SELECT COUNT(*) INTO v_count FROM public.discrepancy_reviews WHERE organization_id = p_org_id;

    ELSE
      EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE organization_id = $1', p_table_name)
        INTO v_count
        USING p_org_id;
  END CASE;

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_scoped_table(
  p_batch_id uuid,
  p_org_id uuid,
  p_table_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_ids uuid[] := ARRAY[]::uuid[];
  v_permit_ids uuid[] := ARRAY[]::uuid[];
  v_outfall_ids uuid[] := ARRAY[]::uuid[];
  v_state_codes text[] := ARRAY[]::text[];
  v_mine_ids text[] := ARRAY[]::text[];
  v_permit_tokens text[] := ARRAY[]::text[];
  v_outfall_tokens text[] := ARRAY[]::text[];
  v_count bigint := 0;
  v_checksum text := NULL;
BEGIN
  PERFORM set_config('app.cutover_override', 'on', true);

  SELECT
    COALESCE(array_agg(DISTINCT resolved_site_id) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND resolution_status IN ('matched', 'excluded')
        AND resolved_site_id IS NOT NULL
    ), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT resolved_permit_id) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND resolution_status IN ('matched', 'excluded')
        AND resolved_permit_id IS NOT NULL
    ), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT resolved_outfall_id) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND resolution_status IN ('matched', 'excluded')
        AND resolved_outfall_id IS NOT NULL
    ), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT lower(btrim(state_code))) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND state_code IS NOT NULL
        AND btrim(state_code) <> ''
    ), ARRAY[]::text[]),
    COALESCE(array_agg(DISTINCT lower(btrim(mine_id))) FILTER (
      WHERE disposition IN ('archive', 'exclude')
        AND mine_id IS NOT NULL
        AND btrim(mine_id) <> ''
    ), ARRAY[]::text[])
  INTO v_site_ids, v_permit_ids, v_outfall_ids, v_state_codes, v_mine_ids
  FROM public.cutover_matrix_rows
  WHERE batch_id = p_batch_id;

  SELECT COALESCE(array_agg(DISTINCT token), ARRAY[]::text[])
  INTO v_permit_tokens
  FROM (
    SELECT lower(btrim(np.permit_number)) AS token
    FROM public.npdes_permits np
    WHERE np.organization_id = p_org_id
      AND (
        np.id = ANY(v_permit_ids)
        OR np.site_id = ANY(v_site_ids)
      )
      AND np.permit_number IS NOT NULL
      AND btrim(np.permit_number) <> ''
    UNION
    SELECT lower(btrim(cmr.permit_number)) AS token
    FROM public.cutover_matrix_rows cmr
    WHERE cmr.batch_id = p_batch_id
      AND cmr.disposition IN ('archive', 'exclude')
      AND cmr.permit_number IS NOT NULL
      AND btrim(cmr.permit_number) <> ''
    UNION
    SELECT lower(btrim(cmr.external_npdes_id)) AS token
    FROM public.cutover_matrix_rows cmr
    WHERE cmr.batch_id = p_batch_id
      AND cmr.disposition IN ('archive', 'exclude')
      AND cmr.external_npdes_id IS NOT NULL
      AND btrim(cmr.external_npdes_id) <> ''
  ) tokens
  WHERE token IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT token), ARRAY[]::text[])
  INTO v_outfall_tokens
  FROM (
    SELECT lower(btrim(np.permit_number)) || '|' || lower(btrim(o.outfall_number)) AS token
    FROM public.outfalls o
    JOIN public.npdes_permits np ON np.id = o.permit_id
    WHERE np.organization_id = p_org_id
      AND (
        o.id = ANY(v_outfall_ids)
        OR np.id = ANY(v_permit_ids)
        OR np.site_id = ANY(v_site_ids)
      )
      AND np.permit_number IS NOT NULL
      AND btrim(np.permit_number) <> ''
      AND o.outfall_number IS NOT NULL
      AND btrim(o.outfall_number) <> ''
    UNION
    SELECT lower(btrim(cmr.permit_number)) || '|' || lower(btrim(cmr.outfall_number)) AS token
    FROM public.cutover_matrix_rows cmr
    WHERE cmr.batch_id = p_batch_id
      AND cmr.disposition IN ('archive', 'exclude')
      AND cmr.permit_number IS NOT NULL
      AND cmr.outfall_number IS NOT NULL
      AND btrim(cmr.permit_number) <> ''
      AND btrim(cmr.outfall_number) <> ''
  ) tokens
  WHERE token IS NOT NULL;

  CASE p_table_name
    WHEN 'fts_uploads' THEN
      INSERT INTO archive.fts_uploads
      SELECT fu.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.fts_uploads fu
      WHERE fu.organization_id = p_org_id
        AND EXISTS (
          SELECT 1
          FROM public.fts_violations fv
          WHERE fv.upload_id = fu.id
            AND fv.organization_id = p_org_id
            AND (
              lower(btrim(fv.state)) = ANY(v_state_codes)
              OR lower(btrim(fv.dnr_number)) = ANY(v_permit_tokens)
              OR lower(btrim(fv.dnr_number)) || '|' || lower(btrim(fv.outfall_number)) = ANY(v_outfall_tokens)
            )
        );

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.fts_uploads
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.fts_uploads fu
      WHERE fu.organization_id = p_org_id
        AND EXISTS (
          SELECT 1
          FROM public.fts_violations fv
          WHERE fv.upload_id = fu.id
            AND fv.organization_id = p_org_id
            AND (
              lower(btrim(fv.state)) = ANY(v_state_codes)
              OR lower(btrim(fv.dnr_number)) = ANY(v_permit_tokens)
              OR lower(btrim(fv.dnr_number)) || '|' || lower(btrim(fv.outfall_number)) = ANY(v_outfall_tokens)
            )
        );

    WHEN 'fts_violations' THEN
      INSERT INTO archive.fts_violations
      SELECT fv.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.fts_violations fv
      WHERE fv.organization_id = p_org_id
        AND (
          lower(btrim(fv.state)) = ANY(v_state_codes)
          OR lower(btrim(fv.dnr_number)) = ANY(v_permit_tokens)
          OR lower(btrim(fv.dnr_number)) || '|' || lower(btrim(fv.outfall_number)) = ANY(v_outfall_tokens)
        );

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.fts_violations
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.fts_violations fv
      WHERE fv.organization_id = p_org_id
        AND (
          lower(btrim(fv.state)) = ANY(v_state_codes)
          OR lower(btrim(fv.dnr_number)) = ANY(v_permit_tokens)
          OR lower(btrim(fv.dnr_number)) || '|' || lower(btrim(fv.outfall_number)) = ANY(v_outfall_tokens)
        );

    WHEN 'fts_monthly_totals' THEN
      INSERT INTO archive.fts_monthly_totals
      SELECT fmt.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.fts_monthly_totals fmt
      WHERE fmt.organization_id = p_org_id
        AND lower(btrim(fmt.state)) = ANY(v_state_codes);

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.fts_monthly_totals
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.fts_monthly_totals fmt
      WHERE fmt.organization_id = p_org_id
        AND lower(btrim(fmt.state)) = ANY(v_state_codes);

    WHEN 'compliance_violations' THEN
      INSERT INTO archive.compliance_violations
      SELECT cv.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.compliance_violations cv
      WHERE cv.organization_id = p_org_id
        AND (
          cv.outfall_id = ANY(v_outfall_ids)
          OR cv.permit_id = ANY(v_permit_ids)
          OR cv.site_id = ANY(v_site_ids)
        );

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.compliance_violations
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.compliance_violations cv
      WHERE cv.organization_id = p_org_id
        AND (
          cv.outfall_id = ANY(v_outfall_ids)
          OR cv.permit_id = ANY(v_permit_ids)
          OR cv.site_id = ANY(v_site_ids)
        );

    WHEN 'nov_records' THEN
      INSERT INTO archive.nov_records
      SELECT nr.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.nov_records nr
      JOIN public.compliance_violations cv ON cv.id = nr.violation_id
      WHERE nr.organization_id = p_org_id
        AND cv.organization_id = p_org_id
        AND (
          cv.outfall_id = ANY(v_outfall_ids)
          OR cv.permit_id = ANY(v_permit_ids)
          OR cv.site_id = ANY(v_site_ids)
        );

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.nov_records
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.nov_records nr
      USING public.compliance_violations cv
      WHERE cv.id = nr.violation_id
        AND nr.organization_id = p_org_id
        AND cv.organization_id = p_org_id
        AND (
          cv.outfall_id = ANY(v_outfall_ids)
          OR cv.permit_id = ANY(v_permit_ids)
          OR cv.site_id = ANY(v_site_ids)
        );

    WHEN 'enforcement_actions' THEN
      INSERT INTO archive.enforcement_actions
      SELECT ea.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.enforcement_actions ea
      LEFT JOIN public.compliance_violations cv ON cv.id = ea.violation_id
      LEFT JOIN public.nov_records nr ON nr.id = ea.nov_id
      LEFT JOIN public.compliance_violations cv_nov ON cv_nov.id = nr.violation_id
      WHERE ea.organization_id = p_org_id
        AND (
          (cv.id IS NOT NULL AND (
            cv.outfall_id = ANY(v_outfall_ids)
            OR cv.permit_id = ANY(v_permit_ids)
            OR cv.site_id = ANY(v_site_ids)
          ))
          OR
          (cv_nov.id IS NOT NULL AND (
            cv_nov.outfall_id = ANY(v_outfall_ids)
            OR cv_nov.permit_id = ANY(v_permit_ids)
            OR cv_nov.site_id = ANY(v_site_ids)
          ))
        );

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.enforcement_actions
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.enforcement_actions ea
      USING public.compliance_violations cv
      WHERE ea.violation_id = cv.id
        AND ea.organization_id = p_org_id
        AND cv.organization_id = p_org_id
        AND (
          cv.outfall_id = ANY(v_outfall_ids)
          OR cv.permit_id = ANY(v_permit_ids)
          OR cv.site_id = ANY(v_site_ids)
        );

    WHEN 'external_echo_facilities' THEN
      INSERT INTO archive.external_echo_facilities
      SELECT eef.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.external_echo_facilities eef
      WHERE eef.organization_id = p_org_id
        AND lower(btrim(eef.npdes_id)) = ANY(v_permit_tokens);

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.external_echo_facilities
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.external_echo_facilities eef
      WHERE eef.organization_id = p_org_id
        AND lower(btrim(eef.npdes_id)) = ANY(v_permit_tokens);

    WHEN 'external_echo_dmrs' THEN
      INSERT INTO archive.external_echo_dmrs
      SELECT eed.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.external_echo_dmrs eed
      WHERE eed.organization_id = p_org_id
        AND lower(btrim(eed.npdes_id)) = ANY(v_permit_tokens);

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.external_echo_dmrs
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.external_echo_dmrs eed
      WHERE eed.organization_id = p_org_id
        AND lower(btrim(eed.npdes_id)) = ANY(v_permit_tokens);

    WHEN 'external_msha_inspections' THEN
      INSERT INTO archive.external_msha_inspections
      SELECT emi.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.external_msha_inspections emi
      WHERE emi.organization_id = p_org_id
        AND lower(btrim(emi.mine_id)) = ANY(v_mine_ids);

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.external_msha_inspections
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.external_msha_inspections emi
      WHERE emi.organization_id = p_org_id
        AND lower(btrim(emi.mine_id)) = ANY(v_mine_ids);

    WHEN 'consent_decree_obligations' THEN
      INSERT INTO archive.consent_decree_obligations
      SELECT cdo.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.consent_decree_obligations cdo;

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.consent_decree_obligations
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.consent_decree_obligations;

    WHEN 'compliance_snapshots' THEN
      INSERT INTO archive.compliance_snapshots
      SELECT cs.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.compliance_snapshots cs
      WHERE cs.organization_id = p_org_id;

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.compliance_snapshots
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.compliance_snapshots cs
      WHERE cs.organization_id = p_org_id;

    WHEN 'external_sync_log' THEN
      INSERT INTO archive.external_sync_log
      SELECT esl.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.external_sync_log esl
      WHERE esl.organization_id = p_org_id;

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.external_sync_log
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.external_sync_log esl
      WHERE esl.organization_id = p_org_id;

    WHEN 'discrepancy_reviews' THEN
      INSERT INTO archive.discrepancy_reviews
      SELECT dr.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.discrepancy_reviews dr
      WHERE dr.organization_id = p_org_id;

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.discrepancy_reviews
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.discrepancy_reviews dr
      WHERE dr.organization_id = p_org_id;

    WHEN 'legal_holds' THEN
      INSERT INTO archive.legal_holds
      SELECT lh.*, p_batch_id AS cutover_batch_id, now() AS archived_at
      FROM public.legal_holds lh
      WHERE lh.organization_id = p_org_id
        AND (
          (lh.entity_type = 'violation' AND EXISTS (
            SELECT 1
            FROM public.compliance_violations cv
            WHERE cv.id = lh.entity_id
              AND cv.organization_id = p_org_id
              AND (
                cv.outfall_id = ANY(v_outfall_ids)
                OR cv.permit_id = ANY(v_permit_ids)
                OR cv.site_id = ANY(v_site_ids)
              )
          ))
          OR
          (lh.entity_type = 'dmr_submission' AND EXISTS (
            SELECT 1
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits np ON np.id = ds.permit_id
            WHERE ds.id = lh.entity_id
              AND np.organization_id = p_org_id
              AND (
                ds.permit_id = ANY(v_permit_ids)
                OR np.site_id = ANY(v_site_ids)
              )
          ))
          OR
          (lh.entity_type = 'incident' AND EXISTS (
            SELECT 1
            FROM public.incidents i
            WHERE i.id = lh.entity_id
              AND i.organization_id = p_org_id
              AND (
                i.outfall_id = ANY(v_outfall_ids)
                OR i.permit_id = ANY(v_permit_ids)
              )
          ))
          OR
          (lh.entity_type = 'corrective_action' AND EXISTS (
            SELECT 1
            FROM public.corrective_actions ca
            WHERE ca.id = lh.entity_id
              AND ca.organization_id = p_org_id
              AND (
                ca.npdes_permit_id = ANY(v_permit_ids)
                OR ca.site_id = ANY(v_site_ids)
              )
          ))
        );

      GET DIAGNOSTICS v_count = ROW_COUNT;

      SELECT md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, ''))
      INTO v_checksum
      FROM archive.legal_holds
      WHERE cutover_batch_id = p_batch_id;

      DELETE FROM public.legal_holds lh
      WHERE lh.organization_id = p_org_id
        AND (
          (lh.entity_type = 'violation' AND EXISTS (
            SELECT 1
            FROM public.compliance_violations cv
            WHERE cv.id = lh.entity_id
              AND cv.organization_id = p_org_id
              AND (
                cv.outfall_id = ANY(v_outfall_ids)
                OR cv.permit_id = ANY(v_permit_ids)
                OR cv.site_id = ANY(v_site_ids)
              )
          ))
          OR
          (lh.entity_type = 'dmr_submission' AND EXISTS (
            SELECT 1
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits np ON np.id = ds.permit_id
            WHERE ds.id = lh.entity_id
              AND np.organization_id = p_org_id
              AND (
                ds.permit_id = ANY(v_permit_ids)
                OR np.site_id = ANY(v_site_ids)
              )
          ))
          OR
          (lh.entity_type = 'incident' AND EXISTS (
            SELECT 1
            FROM public.incidents i
            WHERE i.id = lh.entity_id
              AND i.organization_id = p_org_id
              AND (
                i.outfall_id = ANY(v_outfall_ids)
                OR i.permit_id = ANY(v_permit_ids)
              )
          ))
          OR
          (lh.entity_type = 'corrective_action' AND EXISTS (
            SELECT 1
            FROM public.corrective_actions ca
            WHERE ca.id = lh.entity_id
              AND ca.organization_id = p_org_id
              AND (
                ca.npdes_permit_id = ANY(v_permit_ids)
                OR ca.site_id = ANY(v_site_ids)
              )
          ))
        );

    ELSE
      v_count := public.cutover_scope_table_count(p_batch_id, p_org_id, p_table_name);
      EXECUTE format(
        'INSERT INTO archive.%I SELECT *, $1::uuid AS cutover_batch_id, now() AS archived_at FROM public.%I WHERE organization_id = $2',
        p_table_name,
        p_table_name
      )
      USING p_batch_id, p_org_id;

      EXECUTE format(
        'SELECT md5(COUNT(*)::text || ''|'' || COALESCE(MIN(id)::text, '''') || ''|'' || COALESCE(MAX(id)::text, '''')) FROM archive.%I WHERE cutover_batch_id = $1',
        p_table_name
      )
      INTO v_checksum
      USING p_batch_id;

      EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', p_table_name)
      USING p_org_id;
  END CASE;

  INSERT INTO public.archive_manifest (
    batch_id,
    organization_id,
    table_name,
    archived_row_count,
    checksum_text,
    metadata
  )
  VALUES (
    p_batch_id,
    p_org_id,
    p_table_name,
    COALESCE(v_count, 0)::integer,
    v_checksum,
    jsonb_build_object('organization_id', p_org_id, 'table_name', p_table_name)
  )
  ON CONFLICT (batch_id, table_name)
  DO UPDATE SET
    archived_row_count = EXCLUDED.archived_row_count,
    checksum_text = EXCLUDED.checksum_text,
    metadata = EXCLUDED.metadata;

  RETURN jsonb_build_object(
    'table_name', p_table_name,
    'archived_row_count', COALESCE(v_count, 0),
    'checksum', v_checksum
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_cutover_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF current_setting('app.cutover_override', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_org_id := NULLIF(to_jsonb(OLD)->>'organization_id', '')::uuid;
  ELSE
    v_org_id := NULLIF(to_jsonb(NEW)->>'organization_id', '')::uuid;
    IF v_org_id IS NULL AND TG_OP = 'UPDATE' THEN
      v_org_id := NULLIF(to_jsonb(OLD)->>'organization_id', '')::uuid;
    END IF;
  END IF;

  IF v_org_id IS NULL THEN
    v_org_id := get_user_org_id();
  END IF;

  IF v_org_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cutover_batches cb
    WHERE cb.organization_id = v_org_id
      AND cb.writes_frozen = true
  ) THEN
    RAISE EXCEPTION 'Writes are temporarily frozen for organization % during cutover execution', v_org_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target_table text;
  target_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews',
    'compliance_snapshots'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_cutover_freeze ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_cutover_freeze
       BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.enforce_cutover_write_freeze()',
      target_table,
      target_table
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_cutover_batch_rows(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
  v_row RECORD;
  v_site_id uuid;
  v_permit_id uuid;
  v_outfall_id uuid;
  v_derived_site_id uuid;
  v_match_count integer;
  v_resolution_status text;
  v_resolution_notes text;
  target_table text;
  target_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'consent_decree_obligations',
    'compliance_snapshots',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews',
    'legal_holds'
  ];
  v_archive_preview jsonb := '{}'::jsonb;
  v_live_after_preview jsonb := '{}'::jsonb;
  v_archive_count bigint;
  v_total_count bigint;
  v_summary jsonb;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cutover_batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cutover batch % not found', p_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.cutover_matrix_rows
    WHERE batch_id = p_batch_id
    ORDER BY row_number
  LOOP
    v_site_id := NULL;
    v_permit_id := NULL;
    v_outfall_id := NULL;
    v_resolution_notes := NULL;
    v_resolution_status := NULL;

    IF v_row.site_name IS NOT NULL AND btrim(v_row.site_name) <> '' THEN
      SELECT COUNT(*), MIN(id)
      INTO v_match_count, v_site_id
      FROM public.sites
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(name)) = lower(btrim(v_row.site_name));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple site matches';
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.facility_name IS NOT NULL
       AND btrim(v_row.facility_name) <> ''
       AND v_site_id IS NULL THEN
      SELECT COUNT(*), MIN(id)
      INTO v_match_count, v_site_id
      FROM public.sites
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(name)) = lower(btrim(v_row.facility_name));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple facility/site matches';
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.permit_number IS NOT NULL
       AND btrim(v_row.permit_number) <> '' THEN
      SELECT COUNT(*), MIN(id), MIN(site_id)
      INTO v_match_count, v_permit_id, v_derived_site_id
      FROM public.npdes_permits
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(permit_number)) = lower(btrim(v_row.permit_number));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple permit matches';
      ELSIF v_match_count = 1 THEN
        IF v_site_id IS NULL THEN
          v_site_id := v_derived_site_id;
        ELSIF v_site_id <> v_derived_site_id THEN
          v_resolution_status := 'ambiguous';
          v_resolution_notes := 'Site and permit resolved to different facilities';
        END IF;
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.external_npdes_id IS NOT NULL
       AND btrim(v_row.external_npdes_id) <> ''
       AND v_permit_id IS NULL THEN
      SELECT COUNT(*), MIN(id), MIN(site_id)
      INTO v_match_count, v_permit_id, v_derived_site_id
      FROM public.npdes_permits
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(permit_number)) = lower(btrim(v_row.external_npdes_id));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple NPDES permit matches';
      ELSIF v_match_count = 1 AND v_site_id IS NULL THEN
        v_site_id := v_derived_site_id;
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.outfall_number IS NOT NULL
       AND btrim(v_row.outfall_number) <> '' THEN
      IF v_permit_id IS NOT NULL THEN
        SELECT COUNT(*), MIN(id)
        INTO v_match_count, v_outfall_id
        FROM public.outfalls
        WHERE permit_id = v_permit_id
          AND lower(btrim(outfall_number)) = lower(btrim(v_row.outfall_number));
      ELSE
        SELECT COUNT(*), MIN(o.id), MIN(p.id), MIN(p.site_id)
        INTO v_match_count, v_outfall_id, v_permit_id, v_derived_site_id
        FROM public.outfalls o
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = v_batch.organization_id
          AND lower(btrim(o.outfall_number)) = lower(btrim(v_row.outfall_number));
      END IF;

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple outfall matches';
      ELSIF v_match_count = 1 AND v_site_id IS NULL THEN
        IF v_derived_site_id IS NULL AND v_permit_id IS NOT NULL THEN
          SELECT site_id INTO v_derived_site_id FROM public.npdes_permits WHERE id = v_permit_id;
        END IF;
        v_site_id := v_derived_site_id;
      END IF;
    END IF;

    IF v_resolution_status IS NULL THEN
      IF v_site_id IS NOT NULL THEN
        v_resolution_status := CASE WHEN v_row.disposition = 'exclude' THEN 'excluded' ELSE 'matched' END;
        v_resolution_notes := CASE
          WHEN v_row.disposition = 'exclude' THEN 'Excluded from live roster and treated as non-live archive scope'
          ELSE 'Resolved successfully'
        END;
      ELSE
        v_resolution_status := 'unresolved';
        v_resolution_notes := 'No site/permit/outfall match found';
      END IF;
    END IF;

    UPDATE public.cutover_matrix_rows
    SET
      resolved_site_id = v_site_id,
      resolved_permit_id = v_permit_id,
      resolved_outfall_id = v_outfall_id,
      resolution_status = v_resolution_status,
      resolution_notes = v_resolution_notes
    WHERE id = v_row.id;
  END LOOP;

  FOREACH target_table IN ARRAY target_tables LOOP
    v_archive_count := public.cutover_scope_table_count(p_batch_id, v_batch.organization_id, target_table);

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE organization_id = $1', target_table)
        INTO v_total_count
        USING v_batch.organization_id;
    ELSE
      EXECUTE format('SELECT COUNT(*) FROM public.%I', target_table)
        INTO v_total_count;
    END IF;

    v_archive_preview := v_archive_preview || jsonb_build_object(target_table, v_archive_count);
    v_live_after_preview := v_live_after_preview || jsonb_build_object(target_table, GREATEST(COALESCE(v_total_count, 0) - COALESCE(v_archive_count, 0), 0));
  END LOOP;

  v_summary := jsonb_build_object(
    'batch_id', p_batch_id,
    'row_counts', jsonb_build_object(
      'total_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id),
      'matched_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND resolution_status = 'matched'),
      'unresolved_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition <> 'live' AND resolution_status = 'unresolved'),
      'ambiguous_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition <> 'live' AND resolution_status = 'ambiguous'),
      'excluded_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition = 'exclude'),
      'live_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition = 'live'),
      'archive_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition = 'archive')
    ),
    'live_roster_counts', jsonb_build_object(
      'site_count', (
        SELECT COUNT(DISTINCT resolved_site_id)
        FROM public.cutover_matrix_rows
        WHERE batch_id = p_batch_id
          AND disposition = 'live'
          AND resolution_status = 'matched'
      ),
      'permit_count', (
        SELECT COUNT(DISTINCT resolved_permit_id)
        FROM public.cutover_matrix_rows
        WHERE batch_id = p_batch_id
          AND disposition = 'live'
          AND resolution_status = 'matched'
          AND resolved_permit_id IS NOT NULL
      ),
      'outfall_count', (
        SELECT COUNT(DISTINCT resolved_outfall_id)
        FROM public.cutover_matrix_rows
        WHERE batch_id = p_batch_id
          AND disposition = 'live'
          AND resolution_status = 'matched'
          AND resolved_outfall_id IS NOT NULL
      )
    ),
    'archive_preview', v_archive_preview,
    'live_after_preview', v_live_after_preview
  );

  UPDATE public.cutover_batches
  SET
    summary_json = v_summary,
    status = CASE
      WHEN ((v_summary -> 'row_counts' ->> 'unresolved_rows')::integer > 0)
        OR ((v_summary -> 'row_counts' ->> 'ambiguous_rows')::integer > 0)
      THEN 'draft'
      ELSE 'ready'
    END
  WHERE id = p_batch_id;

  RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_cutover_batch(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
  v_preview jsonb;
  v_manifest jsonb := '[]'::jsonb;
  target_table text;
  target_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'consent_decree_obligations',
    'compliance_snapshots',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews',
    'legal_holds'
  ];
  v_snapshot_id uuid;
  v_summary jsonb;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cutover_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cutover batch % not found', p_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_preview := public.resolve_cutover_batch_rows(p_batch_id);

  IF ((v_preview -> 'row_counts' ->> 'unresolved_rows')::integer > 0)
     OR ((v_preview -> 'row_counts' ->> 'ambiguous_rows')::integer > 0) THEN
    RAISE EXCEPTION 'Cutover batch still has unresolved or ambiguous matrix rows';
  END IF;

  UPDATE public.cutover_batches
  SET
    status = 'executing',
    writes_frozen = true
  WHERE id = p_batch_id;

  DELETE FROM public.archive_manifest
  WHERE batch_id = p_batch_id;

  FOREACH target_table IN ARRAY target_tables LOOP
    v_manifest := v_manifest || jsonb_build_array(
      public.archive_scoped_table(
        p_batch_id,
        v_batch.organization_id,
        target_table
      )
    );
  END LOOP;

  DELETE FROM public.live_program_roster
  WHERE organization_id = v_batch.organization_id;

  INSERT INTO public.live_program_roster (
    organization_id,
    cutover_batch_id,
    state_code,
    site_id,
    permit_id,
    outfall_id,
    source_row_id
  )
  SELECT DISTINCT
    v_batch.organization_id,
    p_batch_id,
    cmr.state_code,
    cmr.resolved_site_id,
    cmr.resolved_permit_id,
    cmr.resolved_outfall_id,
    cmr.id
  FROM public.cutover_matrix_rows cmr
  WHERE cmr.batch_id = p_batch_id
    AND cmr.disposition = 'live'
    AND cmr.resolution_status = 'matched'
    AND cmr.resolved_site_id IS NOT NULL;

  SELECT public.rebuild_live_compliance_snapshots(v_batch.organization_id)
  INTO v_snapshot_id;

  v_summary := COALESCE(v_preview, '{}'::jsonb) || jsonb_build_object(
    'execution', jsonb_build_object(
      'executed_at', now(),
      'executed_by', auth.uid(),
      'manifest', v_manifest,
      'live_roster_site_count', (
        SELECT COUNT(DISTINCT site_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
      ),
      'snapshot_id', v_snapshot_id
    )
  );

  UPDATE public.cutover_batches
  SET
    status = 'executed',
    writes_frozen = false,
    executed_at = now(),
    executed_by = auth.uid(),
    summary_json = v_summary
  WHERE id = p_batch_id;

  RETURN v_summary;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.cutover_batches
    SET
      status = 'failed',
      writes_frozen = false,
      summary_json = COALESCE(summary_json, '{}'::jsonb) || jsonb_build_object(
        'last_error', jsonb_build_object(
          'message', SQLERRM,
          'at', now()
        )
      )
    WHERE id = p_batch_id;
    RAISE;
END;
$$;

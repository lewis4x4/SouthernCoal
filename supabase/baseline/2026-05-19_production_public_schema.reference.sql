


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."incident_recoverability" AS ENUM (
    'recoverable',
    'non_recoverable',
    'unknown'
);


ALTER TYPE "public"."incident_recoverability" OWNER TO "postgres";


CREATE TYPE "public"."incident_severity" AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);


ALTER TYPE "public"."incident_severity" OWNER TO "postgres";


CREATE TYPE "public"."incident_status" AS ENUM (
    'open',
    'investigating',
    'escalated',
    'pending_action',
    'action_taken',
    'monitoring',
    'closed',
    'closed_no_action'
);


ALTER TYPE "public"."incident_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_priority" AS ENUM (
    'info',
    'warning',
    'urgent',
    'critical',
    'emergency'
);


ALTER TYPE "public"."notification_priority" OWNER TO "postgres";


CREATE TYPE "public"."record_classification" AS ENUM (
    'operational_internal',
    'compliance_sensitive',
    'privileged',
    'public_eligible',
    'regulator_shareable',
    'restricted'
);


ALTER TYPE "public"."record_classification" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_sampling_calendar_adjustment"("p_calendar_id" "uuid", "p_adjustment_type" "text", "p_reason" "text", "p_new_scheduled_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_item sampling_calendar%ROWTYPE;
  v_new_calendar_id uuid;
BEGIN
  IF lower(COALESCE(NULLIF(trim(p_adjustment_type), ''), '')) NOT IN ('skip', 'reschedule', 'makeup') THEN
    RAISE EXCEPTION 'Unsupported adjustment type: %', p_adjustment_type;
  END IF;

  IF NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Adjustment reason is required';
  END IF;

  SELECT *
  INTO v_item
  FROM sampling_calendar
  WHERE id = p_calendar_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sampling calendar item % was not found', p_calendar_id;
  END IF;

  IF v_item.organization_id <> get_user_org_id() THEN
    RAISE EXCEPTION 'Sampling calendar item % is outside the active organization scope', p_calendar_id;
  END IF;

  IF v_item.current_field_visit_id IS NOT NULL AND v_item.dispatch_status IN ('dispatched', 'in_progress') THEN
    RAISE EXCEPTION 'Sampling calendar item % is already dispatched and cannot be adjusted until the visit is resolved', p_calendar_id;
  END IF;

  CASE lower(p_adjustment_type)
    WHEN 'skip' THEN
      UPDATE sampling_calendar
      SET status = 'skipped',
          dispatch_status = 'skipped',
          skip_reason = trim(p_reason),
          override_reason = trim(p_reason),
          current_field_visit_id = NULL,
          updated_at = now()
      WHERE id = p_calendar_id;

      v_new_calendar_id := p_calendar_id;

    WHEN 'reschedule' THEN
      IF p_new_scheduled_date IS NULL THEN
        RAISE EXCEPTION 'Reschedule requires a new scheduled date';
      END IF;

      UPDATE sampling_calendar
      SET scheduled_date = p_new_scheduled_date,
          window_start = p_new_scheduled_date,
          window_end = p_new_scheduled_date,
          status = 'pending',
          dispatch_status = 'ready',
          skip_reason = NULL,
          override_reason = trim(p_reason),
          current_field_visit_id = NULL,
          updated_at = now()
      WHERE id = p_calendar_id;

      v_new_calendar_id := p_calendar_id;

    WHEN 'makeup' THEN
      IF p_new_scheduled_date IS NULL THEN
        RAISE EXCEPTION 'Makeup requires a new scheduled date';
      END IF;

      INSERT INTO sampling_calendar (
        organization_id,
        schedule_id,
        outfall_id,
        parameter_id,
        scheduled_date,
        window_start,
        window_end,
        status,
        dispatch_status,
        route_zone,
        default_assigned_to,
        override_reason,
        source_calendar_id
      )
      VALUES (
        v_item.organization_id,
        v_item.schedule_id,
        v_item.outfall_id,
        v_item.parameter_id,
        p_new_scheduled_date,
        p_new_scheduled_date,
        p_new_scheduled_date,
        'pending',
        'ready',
        v_item.route_zone,
        v_item.default_assigned_to,
        trim(p_reason),
        p_calendar_id
      )
      RETURNING id INTO v_new_calendar_id;
  END CASE;

  INSERT INTO sampling_calendar_adjustments (
    organization_id,
    calendar_id,
    adjustment_type,
    prior_scheduled_date,
    new_scheduled_date,
    reason
  )
  VALUES (
    v_item.organization_id,
    v_new_calendar_id,
    lower(p_adjustment_type),
    v_item.scheduled_date,
    COALESCE(p_new_scheduled_date, v_item.scheduled_date),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'calendar_id', v_new_calendar_id,
    'adjustment_type', lower(p_adjustment_type)
  );
END;
$$;


ALTER FUNCTION "public"."apply_sampling_calendar_adjustment"("p_calendar_id" "uuid", "p_adjustment_type" "text", "p_reason" "text", "p_new_scheduled_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_org_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_count bigint := 0;
  v_checksum text := NULL;
  v_metadata jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = 'organization_id'
  ) THEN
    EXECUTE format(
      'INSERT INTO archive.%I SELECT *, $1::uuid AS cutover_batch_id, now() AS archived_at FROM public.%I WHERE organization_id = $2',
      p_table_name,
      p_table_name
    )
    USING p_batch_id, p_org_id;

    EXECUTE format(
      'SELECT COUNT(*), md5(COUNT(*)::text || ''|'' || COALESCE(MIN(id)::text, '''') || ''|'' || COALESCE(MAX(id)::text, '''')) FROM public.%I WHERE organization_id = $1',
      p_table_name
    )
    INTO v_count, v_checksum
    USING p_org_id;

    EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', p_table_name)
    USING p_org_id;
  ELSE
    EXECUTE format(
      'INSERT INTO archive.%I SELECT *, $1::uuid AS cutover_batch_id, now() AS archived_at FROM public.%I',
      p_table_name,
      p_table_name
    )
    USING p_batch_id;

    EXECUTE format(
      'SELECT COUNT(*), md5(COUNT(*)::text || ''|'' || COALESCE(MIN(id)::text, '''') || ''|'' || COALESCE(MAX(id)::text, '''')) FROM public.%I',
      p_table_name
    )
    INTO v_count, v_checksum;

    EXECUTE format('DELETE FROM public.%I', p_table_name);
  END IF;

  v_metadata := jsonb_build_object(
    'organization_id', p_org_id,
    'table_name', p_table_name
  );

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
    v_metadata
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
$_$;


ALTER FUNCTION "public"."archive_org_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_scoped_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."archive_scoped_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_field_visit_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO audit_log (
    action,
    module,
    table_name,
    record_id,
    organization_id,
    user_id,
    old_values,
    new_values,
    description,
    created_at
  )
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'field_visit_created' ELSE 'field_visit_updated' END,
    'field_ops',
    'field_visits',
    NEW.id,
    NEW.organization_id,
    auth.uid(),
    CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'visit_status', OLD.visit_status,
        'outcome', OLD.outcome,
        'assigned_to', OLD.assigned_to
      )
      ELSE NULL
    END,
    jsonb_build_object(
      'visit_status', NEW.visit_status,
      'outcome', NEW.outcome,
      'assigned_to', NEW.assigned_to,
      'scheduled_date', NEW.scheduled_date
    ),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Field visit created'
      ELSE 'Field visit updated'
    END,
    now()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_field_visit_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_governance_issue_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO audit_log (
    action,
    module,
    table_name,
    record_id,
    organization_id,
    user_id,
    old_values,
    new_values,
    description,
    created_at
  )
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'governance_issue_created' ELSE 'governance_issue_updated' END,
    'governance',
    'governance_issues',
    NEW.id,
    NEW.organization_id,
    auth.uid(),
    CASE
      WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'current_status', OLD.current_status,
        'current_owner_name', OLD.current_owner_name,
        'current_step', OLD.current_step
      )
      ELSE NULL
    END,
    jsonb_build_object(
      'issue_type', NEW.issue_type,
      'current_status', NEW.current_status,
      'current_owner_name', NEW.current_owner_name,
      'current_step', NEW.current_step
    ),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Governance issue created'
      ELSE 'Governance issue updated'
    END,
    now()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_governance_issue_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_governance_issue_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM governance_issues
  WHERE id = NEW.governance_issue_id;

  INSERT INTO audit_log (
    action,
    module,
    table_name,
    record_id,
    organization_id,
    user_id,
    new_values,
    description,
    created_at
  )
  VALUES (
    'governance_issue_event',
    'governance',
    'governance_issue_events',
    NEW.governance_issue_id,
    v_org_id,
    auth.uid(),
    jsonb_build_object(
      'event_type', NEW.event_type,
      'from_status', NEW.from_status,
      'to_status', NEW.to_status,
      'notes', NEW.notes
    ),
    'Governance issue event recorded',
    now()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_governance_issue_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_classify_governance_issue"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Default floor: if decree paragraphs present, at least compliance_sensitive
  IF NEW.decree_paragraphs IS NOT NULL AND array_length(NEW.decree_paragraphs, 1) > 0 THEN
    IF NEW.classification_level = 'operational_internal' THEN
      NEW.classification_level := 'compliance_sensitive';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_classify_governance_issue"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auto_classify_governance_issue"() IS 'Phase 2 auto-classification: decree_paragraphs present → compliance_sensitive floor.';



CREATE OR REPLACE FUNCTION "public"."auto_create_ca_from_enforcement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_site_name text;
  v_state text;
BEGIN
  -- Only for NOV/CO types
  IF NEW.action_type NOT IN ('notice_of_violation', 'cessation_order', 'consent_order') THEN
    RETURN NEW;
  END IF;

  -- Get site info
  SELECT s.name, st.code
  INTO v_site_name, v_state
  FROM public.sites s
  LEFT JOIN public.states st ON s.state_id = st.id
  WHERE s.id = NEW.site_id;

  INSERT INTO public.corrective_actions (
    organization_id, source_type, source_id, title, description,
    date_received, date_issued, issuing_agency,
    priority, due_date, state, workflow_step, status
  ) VALUES (
    NEW.organization_id, 'enforcement', NEW.id,
    format('%s: %s', UPPER(REPLACE(NEW.action_type, '_', ' ')), LEFT(NEW.description, 100)),
    NEW.description,
    CURRENT_DATE, NEW.issued_date, NEW.issuing_agency,
    'critical', COALESCE(NEW.response_due_date, (CURRENT_DATE + INTERVAL '10 days')::date),
    v_state, 'identification', 'open'
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_ca_from_enforcement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_create_ca_from_exceedance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_org_id uuid;
  v_site_name text;
  v_state text;
  v_param_name text;
BEGIN
  -- Resolve org through outfall chain
  SELECT s.organization_id, s.name, st.code
  INTO v_org_id, v_site_name, v_state
  FROM public.outfalls o
  JOIN public.npdes_permits np ON o.permit_id = np.id
  JOIN public.sites s ON np.site_id = s.id
  LEFT JOIN public.states st ON s.state_id = st.id
  WHERE o.id = NEW.outfall_id;

  -- Log and exit gracefully if chain broken
  IF v_org_id IS NULL THEN
    RAISE WARNING '[CA Trigger] Could not resolve org for exceedance % (outfall_id: %)', NEW.id, NEW.outfall_id;
    RETURN NEW;
  END IF;

  -- Get parameter name
  SELECT name INTO v_param_name FROM public.parameters WHERE id = NEW.parameter_id;

  -- Create CA
  INSERT INTO public.corrective_actions (
    organization_id, source_type, source_id, title, description,
    date_received, priority, due_date, state, workflow_step, status
  ) VALUES (
    v_org_id, 'exceedance', NEW.id,
    format('Exceedance: %s at %s', COALESCE(v_param_name, 'Parameter'), v_site_name),
    format('Permit limit exceeded for %s. Result: %s, Limit: %s',
           COALESCE(v_param_name, 'parameter'), NEW.result_value, NEW.limit_value),
    CURRENT_DATE, 'high', (CURRENT_DATE + INTERVAL '7 days')::date,
    v_state, 'identification', 'open'
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_ca_from_exceedance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_create_ca_from_incident"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_type RECORD;
  v_ca_id uuid;
  v_site_id uuid;
  v_permit_id uuid;
  v_state text;
BEGIN
  -- Only fire when auto_ca_triggered changes to true
  IF NOT NEW.auto_ca_triggered THEN
    RETURN NEW;
  END IF;

  -- Skip if CA already linked
  IF NEW.corrective_action_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get incident type info
  SELECT * INTO v_type
  FROM incident_types
  WHERE id = NEW.incident_type_id;

  -- Resolve site/permit from field_visit if available
  IF NEW.field_visit_id IS NOT NULL THEN
    SELECT fv.site_id, fv.permit_id
    INTO v_site_id, v_permit_id
    FROM field_visits fv
    WHERE fv.id = NEW.field_visit_id;
  END IF;

  -- Resolve state from site
  IF v_site_id IS NOT NULL THEN
    SELECT st.code INTO v_state
    FROM sites s
    JOIN states st ON s.state_id = st.id
    WHERE s.id = v_site_id;
  END IF;

  -- Map incident severity to CA priority
  INSERT INTO corrective_actions (
    organization_id,
    site_id,
    npdes_permit_id,
    state,
    source_type,
    source_id,
    title,
    description,
    priority,
    status,
    workflow_step,
    due_date,
    date_received,
    created_at,
    updated_at
  ) VALUES (
    NEW.organization_id,
    v_site_id,
    v_permit_id,
    v_state,
    'incident',
    NEW.id,
    format('Incident: %s — %s', COALESCE(v_type.name, 'Unknown'), NEW.title),
    COALESCE(NEW.description, '') ||
      CASE WHEN NEW.decree_paragraphs IS NOT NULL AND array_length(NEW.decree_paragraphs, 1) > 0
        THEN E'\n\nConsent Decree ¶: ' || array_to_string(NEW.decree_paragraphs, ', ')
        ELSE ''
      END,
    CASE NEW.severity
      WHEN 'critical' THEN 'critical'
      WHEN 'high' THEN 'high'
      WHEN 'medium' THEN 'medium'
      ELSE 'low'
    END,
    'open',
    'identification',
    (CURRENT_DATE + INTERVAL '7 days')::date,
    NEW.reported_at::date,
    now(),
    now()
  ) RETURNING id INTO v_ca_id;

  -- Link CA back to incident
  UPDATE incidents
  SET corrective_action_id = v_ca_id,
      auto_ca_created_at = now(),
      updated_at = now()
  WHERE id = NEW.id;

  -- Log event on incident timeline
  INSERT INTO incident_events (
    incident_id, event_type, actor_name, actor_user_id,
    new_value, notes
  ) VALUES (
    NEW.id, 'ca_created', 'System', NULL,
    v_ca_id::text,
    'Corrective Action auto-created from incident'
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_ca_from_incident"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_expire_training_completions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE training_completions
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < CURRENT_DATE;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."auto_expire_training_completions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."batch_insert_discrepancies"("rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  total_rows int;
  inserted_count int;
  updated_count int;
BEGIN
  total_rows := jsonb_array_length(rows);

  WITH upserted AS (
    INSERT INTO discrepancy_reviews (
      organization_id, npdes_id, mine_id, source, discrepancy_type,
      severity, description, internal_value, external_value,
      internal_source_table, internal_source_id, external_source_id,
      monitoring_period_start, monitoring_period_end, status
    )
    SELECT
      (r->>'organization_id')::uuid,
      r->>'npdes_id',
      r->>'mine_id',
      r->>'source',
      r->>'discrepancy_type',
      r->>'severity',
      r->>'description',
      r->>'internal_value',
      r->>'external_value',
      r->>'internal_source_table',
      CASE WHEN r->>'internal_source_id' IS NOT NULL
           THEN (r->>'internal_source_id')::uuid ELSE NULL END,
      CASE WHEN r->>'external_source_id' IS NOT NULL
           THEN (r->>'external_source_id')::uuid ELSE NULL END,
      CASE WHEN r->>'monitoring_period_start' IS NOT NULL
           THEN (r->>'monitoring_period_start')::date ELSE NULL END,
      CASE WHEN r->>'monitoring_period_end' IS NOT NULL
           THEN (r->>'monitoring_period_end')::date ELSE NULL END,
      'pending'
    FROM jsonb_array_elements(rows) AS r
    ON CONFLICT (organization_id, source, discrepancy_type, npdes_id, monitoring_period_end, external_source_id)
      WHERE status IN ('pending', 'reviewed')
    DO UPDATE SET
      recurrence_count = discrepancy_reviews.recurrence_count + 1,
      updated_at = now()
    RETURNING (xmax = 0) AS was_inserted
  )
  SELECT
    count(*) FILTER (WHERE was_inserted),
    count(*) FILTER (WHERE NOT was_inserted)
  INTO inserted_count, updated_count
  FROM upserted;

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'skipped', total_rows - inserted_count - updated_count,
    'updated', updated_count,
    'total', total_rows
  );
END;
$$;


ALTER FUNCTION "public"."batch_insert_discrepancies"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_days_at_risk"("p_next_due_date" "date", "p_completion_date" "date") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_next_due_date IS NULL THEN
    RETURN 0;
  END IF;
  IF p_completion_date IS NOT NULL THEN
    RETURN GREATEST(0, p_completion_date - p_next_due_date);
  ELSE
    RETURN GREATEST(0, CURRENT_DATE - p_next_due_date);
  END IF;
END;
$$;


ALTER FUNCTION "public"."calculate_days_at_risk"("p_next_due_date" "date", "p_completion_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_dmr_values"("p_submission_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_submission RECORD;
  v_caller_org uuid;
  v_outfall RECORD;
  v_limit RECORD;
  v_agg RECORD;
  v_conversion_factor numeric;
  v_measured numeric;
  v_is_exceedance boolean;
  v_exceedance_pct numeric;
  v_line_count integer := 0;
  v_populated integer := 0;
  v_exceedances integer := 0;
  v_missing integer := 0;
BEGIN
  v_caller_org := get_user_org_id();

  -- Get submission details
  SELECT * INTO v_submission
  FROM dmr_submissions
  WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_submission.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied: submission belongs to another organization';
  END IF;

  -- If no_discharge, skip calculation
  IF v_submission.no_discharge THEN
    RETURN jsonb_build_object(
      'status', 'no_discharge',
      'line_count', 0
    );
  END IF;

  -- For each active permit limit on outfalls belonging to this permit,
  -- aggregate lab results within the monitoring period
  FOR v_limit IN
    SELECT
      pl.id AS limit_id,
      pl.outfall_id,
      pl.parameter_id,
      pl.limit_value,
      pl.limit_min,
      pl.limit_max,
      pl.unit AS limit_unit,
      pl.statistical_base,
      pl.monitoring_frequency,
      o.outfall_id AS outfall_display,
      p.name AS param_name,
      p.storet_code
    FROM permit_limits pl
    JOIN outfalls o ON o.id = pl.outfall_id
    JOIN parameters p ON p.id = pl.parameter_id
    WHERE o.npdes_permit_id = v_submission.permit_id
      AND pl.is_active = true
    ORDER BY o.outfall_id, p.name, pl.statistical_base
  LOOP
    v_line_count := v_line_count + 1;

    -- Aggregate lab results for this outfall + parameter in the monitoring period
    SELECT
      COUNT(*) AS sample_count,
      AVG(lr.result_value) AS avg_val,
      MAX(lr.result_value) AS max_val,
      MIN(lr.result_value) AS min_val,
      mode() WITHIN GROUP (ORDER BY lr.unit) AS common_unit
    INTO v_agg
    FROM lab_results lr
    JOIN sampling_events se ON se.id = lr.sampling_event_id
    WHERE se.outfall_id = v_limit.outfall_id
      AND lr.parameter_id = v_limit.parameter_id
      AND se.sample_date >= v_submission.monitoring_period_start
      AND se.sample_date <= v_submission.monitoring_period_end
      AND lr.result_value IS NOT NULL;

    -- Determine measured value based on statistical base
    IF v_agg.sample_count > 0 THEN
      CASE v_limit.statistical_base
        WHEN 'minimum' THEN v_measured := v_agg.min_val;
        WHEN 'average', 'monthly_average', 'weekly_average' THEN v_measured := v_agg.avg_val;
        WHEN 'maximum', 'daily_maximum' THEN v_measured := v_agg.max_val;
        WHEN 'instantaneous', 'sample_measurement' THEN v_measured := v_agg.max_val;
        ELSE v_measured := v_agg.avg_val;
      END CASE;

      -- Unit conversion if units differ
      v_conversion_factor := 1.0;
      IF v_agg.common_unit IS NOT NULL
         AND v_limit.limit_unit IS NOT NULL
         AND lower(v_agg.common_unit) != lower(v_limit.limit_unit) THEN
        SELECT COALESCE(
          (SELECT conversion_factor FROM unit_conversions
           WHERE (parameter_id = v_limit.parameter_id OR parameter_id IS NULL)
             AND lower(from_unit) = lower(v_agg.common_unit)
             AND lower(to_unit) = lower(v_limit.limit_unit)
           ORDER BY parameter_id NULLS LAST LIMIT 1),
          1.0
        ) INTO v_conversion_factor;
      END IF;

      v_measured := ROUND(v_measured * v_conversion_factor, 4);

      -- Check for exceedance
      v_is_exceedance := false;
      v_exceedance_pct := NULL;

      IF v_limit.limit_value IS NOT NULL AND v_limit.limit_value > 0 THEN
        IF v_measured > v_limit.limit_value THEN
          v_is_exceedance := true;
          v_exceedance_pct := ROUND(((v_measured - v_limit.limit_value) / v_limit.limit_value) * 100, 2);
          v_exceedances := v_exceedances + 1;
        END IF;
      END IF;

      -- Range check (e.g., pH)
      IF v_limit.limit_min IS NOT NULL AND v_measured < v_limit.limit_min THEN
        v_is_exceedance := true;
        v_exceedance_pct := ROUND(((v_limit.limit_min - v_measured) / v_limit.limit_min) * 100, 2);
        v_exceedances := v_exceedances + 1;
      END IF;

      v_populated := v_populated + 1;

      -- Upsert line item
      INSERT INTO dmr_line_items (
        submission_id, outfall_id, parameter_id,
        statistical_base,
        limit_value, limit_unit, limit_type,
        measured_value, measured_unit,
        is_exceedance, exceedance_pct,
        sample_count, storet_code
      ) VALUES (
        p_submission_id, v_limit.outfall_id, v_limit.parameter_id,
        COALESCE(v_limit.statistical_base, 'sample_measurement'),
        v_limit.limit_value, v_limit.limit_unit,
        CASE v_limit.statistical_base
          WHEN 'daily_maximum' THEN 'daily_max'
          WHEN 'weekly_average' THEN 'weekly_avg'
          WHEN 'monthly_average' THEN 'monthly_avg'
          WHEN 'instantaneous' THEN 'instantaneous'
          ELSE 'report_only'
        END,
        v_measured, COALESCE(v_limit.limit_unit, v_agg.common_unit),
        v_is_exceedance, v_exceedance_pct,
        v_agg.sample_count, v_limit.storet_code
      )
      ON CONFLICT (submission_id, outfall_id, parameter_id, statistical_base)
      DO UPDATE SET
        measured_value = EXCLUDED.measured_value,
        measured_unit = EXCLUDED.measured_unit,
        is_exceedance = EXCLUDED.is_exceedance,
        exceedance_pct = EXCLUDED.exceedance_pct,
        sample_count = EXCLUDED.sample_count;

    ELSE
      -- No lab data — mark as missing (will need NODI code)
      v_missing := v_missing + 1;

      INSERT INTO dmr_line_items (
        submission_id, outfall_id, parameter_id,
        statistical_base,
        limit_value, limit_unit, limit_type,
        storet_code
      ) VALUES (
        p_submission_id, v_limit.outfall_id, v_limit.parameter_id,
        COALESCE(v_limit.statistical_base, 'sample_measurement'),
        v_limit.limit_value, v_limit.limit_unit,
        CASE v_limit.statistical_base
          WHEN 'daily_maximum' THEN 'daily_max'
          WHEN 'weekly_average' THEN 'weekly_avg'
          WHEN 'monthly_average' THEN 'monthly_avg'
          WHEN 'instantaneous' THEN 'instantaneous'
          ELSE 'report_only'
        END,
        v_limit.storet_code
      )
      ON CONFLICT (submission_id, outfall_id, parameter_id, statistical_base)
      DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'calculated',
    'line_count', v_line_count,
    'populated', v_populated,
    'missing', v_missing,
    'exceedances', v_exceedances
  );
END;
$$;


ALTER FUNCTION "public"."calculate_dmr_values"("p_submission_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_document_completeness"("p_org_id" "uuid") RETURNS TABLE("permit_id" "uuid", "permit_number" "text", "site_name" "text", "total_required" integer, "on_file" integer, "current_docs" integer, "expired_docs" integer, "completeness_pct" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS permit_id,
    p.permit_number,
    s.name AS site_name,
    COUNT(dc.id)::integer AS total_required,
    COUNT(dc.id) FILTER (WHERE dc.is_on_file)::integer AS on_file,
    COUNT(dc.id) FILTER (WHERE dc.is_current)::integer AS current_docs,
    COUNT(dc.id) FILTER (WHERE dc.expiry_date IS NOT NULL AND dc.expiry_date < CURRENT_DATE)::integer AS expired_docs,
    CASE WHEN COUNT(dc.id) > 0
      THEN ROUND((COUNT(dc.id) FILTER (WHERE dc.is_on_file AND dc.is_current)::numeric / COUNT(dc.id)) * 100, 1)
      ELSE 0
    END AS completeness_pct
  FROM npdes_permits p
  JOIN sites s ON p.site_id = s.id
  LEFT JOIN document_completeness dc ON dc.permit_id = p.id AND dc.organization_id = p_org_id
  WHERE p.organization_id = p_org_id
  GROUP BY p.id, p.permit_number, s.name
  ORDER BY completeness_pct ASC;
END;
$$;


ALTER FUNCTION "public"."calculate_document_completeness"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_go_live_readiness"("p_checklist_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total_items int;
  v_passed_items int;
  v_critical_items int;
  v_critical_passed int;
  v_total_tests int;
  v_passed_tests int;
  v_failed_tests int;
  v_sign_off_count int;
  v_required_sign_offs int := 4; -- technical, compliance, legal, executive
  v_actual_sign_off_types text[];
  v_checklist_score numeric;
  v_smoke_score numeric;
  v_sign_off_score numeric;
  v_readiness_score numeric;
  v_blockers int;
  v_stage_status text;
BEGIN
  -- Checklist items
  SELECT
    count(*) FILTER (WHERE status != 'na'),
    count(*) FILTER (WHERE status = 'passed'),
    count(*) FILTER (WHERE priority = 'critical' AND status != 'na'),
    count(*) FILTER (WHERE priority = 'critical' AND status = 'passed'),
    count(*) FILTER (WHERE status = 'blocked')
  INTO v_total_items, v_passed_items, v_critical_items, v_critical_passed, v_blockers
  FROM go_live_checklist_items
  WHERE checklist_id = p_checklist_id;

  -- Smoke tests
  SELECT
    count(*) FILTER (WHERE status != 'skipped'),
    count(*) FILTER (WHERE status = 'passed'),
    count(*) FILTER (WHERE status = 'failed')
  INTO v_total_tests, v_passed_tests, v_failed_tests
  FROM smoke_test_runs
  WHERE checklist_id = p_checklist_id;

  -- Sign-offs (unique types)
  SELECT array_agg(DISTINCT sign_off_type), count(DISTINCT sign_off_type)
  INTO v_actual_sign_off_types, v_sign_off_count
  FROM go_live_sign_offs
  WHERE checklist_id = p_checklist_id;

  -- Current deployment stage
  SELECT status INTO v_stage_status
  FROM deployment_stages
  WHERE checklist_id = p_checklist_id
  ORDER BY stage_order DESC
  LIMIT 1;

  -- Calculate component scores
  v_checklist_score := CASE WHEN v_total_items > 0
    THEN (v_passed_items::numeric / v_total_items) * 100
    ELSE 0 END;

  v_smoke_score := CASE WHEN v_total_tests > 0
    THEN (v_passed_tests::numeric / v_total_tests) * 100
    ELSE 0 END;

  v_sign_off_score := CASE WHEN v_required_sign_offs > 0
    THEN LEAST((v_sign_off_count::numeric / v_required_sign_offs) * 100, 100)
    ELSE 0 END;

  -- Weighted readiness: 40% checklist, 30% smoke tests, 30% sign-offs
  v_readiness_score := (v_checklist_score * 0.40) +
                       (v_smoke_score * 0.30) +
                       (v_sign_off_score * 0.30);

  -- Update the checklist record
  UPDATE go_live_checklists
  SET readiness_score = v_readiness_score
  WHERE id = p_checklist_id;

  RETURN jsonb_build_object(
    'readiness_score', round(v_readiness_score, 1),
    'checklist_score', round(v_checklist_score, 1),
    'smoke_test_score', round(v_smoke_score, 1),
    'sign_off_score', round(v_sign_off_score, 1),
    'total_items', v_total_items,
    'passed_items', v_passed_items,
    'critical_items', v_critical_items,
    'critical_passed', v_critical_passed,
    'blockers', v_blockers,
    'total_tests', v_total_tests,
    'passed_tests', v_passed_tests,
    'failed_tests', v_failed_tests,
    'sign_offs_obtained', COALESCE(v_actual_sign_off_types, ARRAY[]::text[]),
    'sign_offs_required', v_required_sign_offs,
    'sign_off_count', COALESCE(v_sign_off_count, 0),
    'current_stage', COALESCE(v_stage_status, 'none'),
    'is_go', v_readiness_score >= 95
               AND v_critical_items = v_critical_passed
               AND v_failed_tests = 0
               AND v_blockers = 0
  );
END;
$$;


ALTER FUNCTION "public"."calculate_go_live_readiness"("p_checklist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_stipulated_penalty"("p_obligation_type" "text", "p_days_late" integer) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_days_late IS NULL OR p_days_late <= 0 THEN
    RETURN 0.00;
  END IF;

  -- Base CD violations
  IF p_obligation_type IN ('ems_audit', 'treatment_inspection', 'database_maintenance') THEN
    CASE
      WHEN p_days_late BETWEEN 1 AND 14 THEN RETURN 1000.00 * p_days_late;
      WHEN p_days_late BETWEEN 15 AND 30 THEN RETURN 2500.00 * p_days_late;
      WHEN p_days_late > 30 THEN RETURN 4500.00 * p_days_late;
      ELSE RETURN 0.00;
    END CASE;

  -- Reporting violations
  ELSIF p_obligation_type IN ('dmr_submission', 'quarterly_report', 'wet_report', 'biological_survey') THEN
    CASE
      WHEN p_days_late BETWEEN 1 AND 14 THEN RETURN 250.00 * p_days_late;
      WHEN p_days_late BETWEEN 15 AND 30 THEN RETURN 500.00 * p_days_late;
      WHEN p_days_late > 30 THEN RETURN 1250.00 * p_days_late;
      ELSE RETURN 0.00;
    END CASE;

  -- Unknown obligation types — no penalty
  ELSE
    RETURN 0.00;
  END IF;
END;
$$;


ALTER FUNCTION "public"."calculate_stipulated_penalty"("p_obligation_type" "text", "p_days_late" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_field_visit"("p_visit_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM field_visits fv
    WHERE fv.id = p_visit_id
      AND fv.organization_id = get_user_org_id()
      AND (
        fv.assigned_to = auth.uid()
        OR current_user_has_any_role(ARRAY['site_manager', 'environmental_manager', 'executive', 'admin'])
      )
  );
$$;


ALTER FUNCTION "public"."can_access_field_visit"("p_visit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_governance_issue"("p_issue_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM governance_issues gi
    LEFT JOIN field_visits fv ON fv.id = gi.field_visit_id
    WHERE gi.id = p_issue_id
      AND gi.organization_id = get_user_org_id()
      AND (
        gi.created_by = auth.uid()
        OR fv.assigned_to = auth.uid()
        OR current_user_has_any_role(ARRAY['environmental_manager', 'executive', 'admin'])
      )
  );
$$;


ALTER FUNCTION "public"."can_access_governance_issue"("p_issue_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_sampling_calendar_item"("p_calendar_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sampling_calendar sc
    LEFT JOIN field_visits fv ON fv.id = sc.current_field_visit_id
    WHERE sc.id = p_calendar_id
      AND sc.organization_id = get_user_org_id()
      AND (
        can_manage_sampling_records()
        OR sc.default_assigned_to = auth.uid()
        OR fv.assigned_to = auth.uid()
      )
  );
$$;


ALTER FUNCTION "public"."can_access_sampling_calendar_item"("p_calendar_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_sampling_schedule"("p_schedule_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sampling_schedules ss
    WHERE ss.id = p_schedule_id
      AND ss.organization_id = get_user_org_id()
      AND (
        can_manage_sampling_records()
        OR ss.default_assigned_to = auth.uid()
      )
  );
$$;


ALTER FUNCTION "public"."can_access_sampling_schedule"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_sampling_records"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT current_user_has_any_role(ARRAY['site_manager', 'environmental_manager', 'executive', 'admin']);
$$;


ALTER FUNCTION "public"."can_manage_sampling_records"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id
  FROM user_profiles
  WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."get_user_org_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_org_id"() IS 'Returns the organization_id for the current authenticated user. Used by RLS policies for org-scoped access control.';



CREATE OR REPLACE FUNCTION "public"."capture_system_health_snapshot"("p_org_id" "uuid" DEFAULT "public"."get_user_org_id"()) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_org uuid := get_user_org_id();
  v_snapshot_id uuid;
  v_db_size_bytes bigint := 0;
  v_storage_bytes bigint := 0;
  v_active_users integer := 0;
  v_error_count integer := 0;
  v_avg_response_ms numeric;
  v_table_counts jsonb;
BEGIN
  IF v_caller_org IS NULL OR p_org_id IS NULL OR v_caller_org <> p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT pg_database_size(current_database())
  INTO v_db_size_bytes;

  SELECT COALESCE(SUM(COALESCE(fpq.file_size_bytes, 0)), 0)
  INTO v_storage_bytes
  FROM public.file_processing_queue fpq
  WHERE fpq.organization_id = p_org_id;

  SELECT v_storage_bytes + COALESCE(SUM(COALESCE(rr.file_size_bytes, 0)), 0)
  INTO v_storage_bytes
  FROM public.report_runs rr
  JOIN public.scheduled_reports sr
    ON sr.id = rr.scheduled_report_id
  WHERE sr.organization_id = p_org_id;

  SELECT COUNT(DISTINCT al.user_id)
  INTO v_active_users
  FROM public.audit_log al
  WHERE al.organization_id = p_org_id
    AND al.user_id IS NOT NULL
    AND al.created_at >= now() - INTERVAL '24 hours';

  SELECT
    COALESCE((
      SELECT COUNT(*)
      FROM public.report_runs rr
      JOIN public.scheduled_reports sr
        ON sr.id = rr.scheduled_report_id
      WHERE sr.organization_id = p_org_id
        AND rr.status = 'failed'
        AND rr.created_at >= now() - INTERVAL '24 hours'
    ), 0)
    +
    COALESCE((
      SELECT COUNT(*)
      FROM public.audit_log al
      WHERE al.organization_id = p_org_id
        AND al.created_at >= now() - INTERVAL '24 hours'
        AND al.action IN (
          'external_sync_failed',
          'upload_failed',
          'readiness_check_failed',
          'field_outbound_conflict_hold'
        )
    ), 0)
  INTO v_error_count;

  SELECT ROUND(AVG(duration_metric)::numeric, 1)
  INTO v_avg_response_ms
  FROM (
    SELECT dic.duration_ms::numeric AS duration_metric
    FROM public.data_integrity_checks dic
    WHERE dic.organization_id = p_org_id
      AND dic.duration_ms IS NOT NULL
      AND dic.created_at >= now() - INTERVAL '7 days'

    UNION ALL

    SELECT str.duration_ms::numeric AS duration_metric
    FROM public.smoke_test_runs str
    WHERE str.organization_id = p_org_id
      AND str.duration_ms IS NOT NULL
      AND str.created_at >= now() - INTERVAL '7 days'
  ) metrics;

  SELECT jsonb_build_object(
    'permits', (
      SELECT COUNT(*)
      FROM public.npdes_permits p
      WHERE p.organization_id = p_org_id
    ),
    'outfalls', (
      SELECT COUNT(*)
      FROM public.outfalls o
      JOIN public.npdes_permits p ON p.id = o.permit_id
      WHERE p.organization_id = p_org_id
    ),
    'sampling_events', (
      SELECT COUNT(*)
      FROM public.sampling_events se
      JOIN public.outfalls o ON o.id = se.outfall_id
      JOIN public.npdes_permits p ON p.id = o.permit_id
      WHERE p.organization_id = p_org_id
    ),
    'lab_results', (
      SELECT COUNT(*)
      FROM public.lab_results lr
      JOIN public.sampling_events se ON se.id = lr.sampling_event_id
      JOIN public.outfalls o ON o.id = se.outfall_id
      JOIN public.npdes_permits p ON p.id = o.permit_id
      WHERE p.organization_id = p_org_id
    ),
    'field_visits', (
      SELECT COUNT(*)
      FROM public.field_visits fv
      WHERE fv.organization_id = p_org_id
    ),
    'governance_issues', (
      SELECT COUNT(*)
      FROM public.governance_issues gi
      WHERE gi.organization_id = p_org_id
    ),
    'corrective_actions', (
      SELECT COUNT(*)
      FROM public.corrective_actions ca
      WHERE ca.organization_id = p_org_id
    ),
    'work_orders', (
      SELECT COUNT(*)
      FROM public.work_orders wo
      WHERE wo.organization_id = p_org_id
    ),
    'violations', (
      SELECT COUNT(*)
      FROM public.compliance_violations cv
      WHERE cv.organization_id = p_org_id
    ),
    'notifications', (
      SELECT COUNT(*)
      FROM public.notifications n
      WHERE n.organization_id = p_org_id
        AND n.dismissed_at IS NULL
    ),
    'retention_policies', (
      SELECT COUNT(*)
      FROM public.retention_policies rp
      WHERE rp.organization_id = p_org_id
    )
  )
  INTO v_table_counts;

  INSERT INTO public.system_health_logs (
    organization_id,
    db_size_mb,
    table_counts,
    storage_usage_mb,
    active_users_24h,
    error_count_24h,
    avg_response_ms,
    snapshot_at
  )
  VALUES (
    p_org_id,
    ROUND(v_db_size_bytes::numeric / 1048576, 2),
    v_table_counts,
    ROUND(v_storage_bytes::numeric / 1048576, 2),
    v_active_users,
    v_error_count,
    v_avg_response_ms,
    now()
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;


ALTER FUNCTION "public"."capture_system_health_snapshot"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_noise_rules"("p_email_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_sender TEXT;
    v_subject TEXT;
    v_body TEXT;
    v_account_id UUID;
    v_rule RECORD;
BEGIN
    SELECT sender_email, subject, body_preview, account_id
    INTO v_sender, v_subject, v_body, v_account_id
    FROM emails
    WHERE id = p_email_id;

    IF v_sender IS NULL THEN
        RETURN json_build_object('matched', false);
    END IF;

    SELECT id, rule_name, rule_type, action
    INTO v_rule
    FROM email_noise_rules
    WHERE enabled = true
      AND (account_id = v_account_id OR account_id IS NULL)
      AND (
        (rule_type = 'sender_email' AND lower(v_sender) LIKE lower(match_value))
        OR (rule_type = 'sender_domain' AND lower(v_sender) LIKE '%@' || lower(match_value))
        OR (rule_type = 'subject_pattern' AND lower(COALESCE(v_subject, '')) LIKE lower(match_value))
        OR (rule_type = 'body_pattern' AND lower(COALESCE(v_body, '')) LIKE lower(match_value))
      )
    ORDER BY
        CASE rule_type
            WHEN 'sender_email' THEN 1
            WHEN 'sender_domain' THEN 2
            WHEN 'subject_pattern' THEN 3
            WHEN 'body_pattern' THEN 4
        END
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN json_build_object('matched', false);
    END IF;

    UPDATE email_noise_rules
    SET hits = COALESCE(hits, 0) + 1,
        last_hit_at = now()
    WHERE id = v_rule.id;

    RETURN json_build_object(
        'matched', true,
        'rule_name', v_rule.rule_name,
        'rule_id', v_rule.id,
        'action', v_rule.action
    );
END;
$$;


ALTER FUNCTION "public"."check_noise_rules"("p_email_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rain_event_thresholds"("p_station_id" "uuid", "p_reading_date" "date", "p_rainfall_inches" numeric) RETURNS TABLE("schedule_id" "uuid", "outfall_id" "uuid", "permit_id" "uuid", "organization_id" "uuid", "threshold_inches" numeric, "exceeded" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    ss.id AS schedule_id,
    ss.outfall_id,
    ss.permit_id,
    ss.organization_id,
    COALESCE(
      (ss.rain_event_trigger->>'rainfall_threshold_inches')::decimal,
      0.50
    ) AS threshold_inches,
    p_rainfall_inches >= COALESCE(
      (ss.rain_event_trigger->>'rainfall_threshold_inches')::decimal,
      0.50
    ) AS exceeded
  FROM sampling_schedules ss
  JOIN outfalls o ON o.id = ss.outfall_id
  JOIN npdes_permits np ON np.id = ss.permit_id
  JOIN sites s ON s.id = o.site_id
  JOIN site_weather_station_assignments swsa ON swsa.site_id = s.id
  WHERE swsa.weather_station_id = p_station_id
    AND ss.frequency_code = 'rain_event'
    AND ss.is_active = true;
$$;


ALTER FUNCTION "public"."check_rain_event_thresholds"("p_station_id" "uuid", "p_reading_date" "date", "p_rainfall_inches" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_readiness_gate"("p_batch_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_all_passed boolean;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM sampling_route_batches WHERE id = p_batch_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- Check if all blocking requirements have passing checks
  SELECT NOT EXISTS (
    SELECT 1
    FROM readiness_requirements rr
    WHERE rr.organization_id = v_org_id
      AND rr.is_active = true
      AND rr.is_blocking = true
      AND NOT EXISTS (
        SELECT 1 FROM readiness_checks rc
        WHERE rc.route_batch_id = p_batch_id
          AND rc.requirement_id = rr.id
          AND rc.passed = true
      )
  ) INTO v_all_passed;

  -- Update the batch
  UPDATE sampling_route_batches
  SET readiness_gate_passed = v_all_passed,
      readiness_checked_at = now()
  WHERE id = p_batch_id;

  RETURN v_all_passed;
END;
$$;


ALTER FUNCTION "public"."check_readiness_gate"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_training_readiness"("p_user_id" "uuid") RETURNS TABLE("requirement_id" "uuid", "training_name" "text", "is_blocking" boolean, "is_met" boolean, "expires_at" "date", "days_until_expiry" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_caller_org uuid;
BEGIN
  v_caller_org := get_user_org_id();

  SELECT organization_id INTO v_org_id
  FROM user_profiles WHERE id = p_user_id;

  -- Verify caller and target user belong to same org
  IF v_org_id IS NULL OR v_org_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    tr.id AS requirement_id,
    tc.name AS training_name,
    tr.is_blocking,
    COALESCE(
      EXISTS (
        SELECT 1 FROM training_completions tcomp
        WHERE tcomp.user_id = p_user_id
          AND tcomp.training_id = tr.training_id
          AND tcomp.status = 'active'
          AND (tcomp.expires_at IS NULL OR tcomp.expires_at > CURRENT_DATE)
      ),
      false
    ) AS is_met,
    (
      SELECT tcomp.expires_at FROM training_completions tcomp
      WHERE tcomp.user_id = p_user_id
        AND tcomp.training_id = tr.training_id
        AND tcomp.status = 'active'
      ORDER BY tcomp.expires_at DESC NULLS LAST
      LIMIT 1
    ) AS expires_at,
    (
      SELECT (tcomp.expires_at - CURRENT_DATE)::integer FROM training_completions tcomp
      WHERE tcomp.user_id = p_user_id
        AND tcomp.training_id = tr.training_id
        AND tcomp.status = 'active'
        AND tcomp.expires_at IS NOT NULL
      ORDER BY tcomp.expires_at DESC NULLS LAST
      LIMIT 1
    ) AS days_until_expiry
  FROM training_requirements tr
  JOIN training_catalog tc ON tc.id = tr.training_id
  WHERE tr.organization_id = v_org_id
    AND tr.is_active = true
    AND tc.is_active = true;
END;
$$;


ALTER FUNCTION "public"."check_training_readiness"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_field_visit"("p_field_visit_id" "uuid", "p_outcome" "text", "p_completed_latitude" numeric, "p_completed_longitude" numeric, "p_weather_conditions" "text" DEFAULT NULL::"text", "p_field_notes" "text" DEFAULT NULL::"text", "p_potential_force_majeure" boolean DEFAULT false, "p_potential_force_majeure_notes" "text" DEFAULT NULL::"text", "p_no_discharge_narrative" "text" DEFAULT NULL::"text", "p_no_discharge_observed_condition" "text" DEFAULT NULL::"text", "p_no_discharge_obstruction_observed" boolean DEFAULT false, "p_no_discharge_obstruction_details" "text" DEFAULT NULL::"text", "p_access_issue_type" "text" DEFAULT 'access_issue'::"text", "p_access_issue_obstruction_narrative" "text" DEFAULT NULL::"text", "p_access_issue_contact_attempted" boolean DEFAULT false, "p_access_issue_contact_name" "text" DEFAULT NULL::"text", "p_access_issue_contact_outcome" "text" DEFAULT NULL::"text", "p_actor_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_visit field_visits%ROWTYPE;
  v_sampling_event_id uuid;
  v_access_issue_id uuid;
  v_governance_issue_id uuid;
  v_existing_governance_issue_id uuid;
  v_photo_count integer;
  v_now timestamptz := now();
  v_actor_name text := COALESCE(NULLIF(trim(p_actor_name), ''), 'System');
  v_notice_deadline timestamptz;
  v_written_deadline timestamptz;
  v_outfall_site_id uuid;
  -- Escalation config lookup
  v_step1_owner_name text;
  v_step1_owner_role text;
  v_step1_sla_hours integer;
BEGIN
  SELECT *
  INTO v_visit
  FROM field_visits
  WHERE id = p_field_visit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Field visit % was not found', p_field_visit_id;
  END IF;

  IF v_visit.organization_id <> get_user_org_id() THEN
    RAISE EXCEPTION 'Field visit % is outside the active organization scope', p_field_visit_id;
  END IF;

  -- ── IDEMPOTENCY GUARD ──
  -- If the visit is already completed with the SAME outcome, return the existing result
  -- instead of raising an error. This handles offline queue replays gracefully.
  IF v_visit.visit_status = 'completed' THEN
    IF v_visit.outcome = p_outcome THEN
      -- Same outcome replay — return existing IDs (idempotent success)
      SELECT id INTO v_existing_governance_issue_id
      FROM governance_issues
      WHERE field_visit_id = p_field_visit_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'linked_sampling_event_id', v_visit.linked_sampling_event_id,
        'governance_issue_id', v_existing_governance_issue_id,
        'idempotent_replay', true
      );
    ELSE
      -- Different outcome — still an error (conflict)
      RAISE EXCEPTION 'Field visit % is already completed with outcome %; cannot change to %',
        p_field_visit_id, v_visit.outcome, p_outcome;
    END IF;
  END IF;

  IF v_visit.started_at IS NULL THEN
    RAISE EXCEPTION 'Field visit % must be started before completion', p_field_visit_id;
  END IF;

  IF p_outcome NOT IN ('sample_collected', 'no_discharge', 'access_issue') THEN
    RAISE EXCEPTION 'Invalid field visit outcome: %', p_outcome;
  END IF;

  IF p_completed_latitude IS NULL OR p_completed_longitude IS NULL THEN
    RAISE EXCEPTION 'Completion GPS coordinates are required';
  END IF;

  IF p_outcome IN ('no_discharge', 'access_issue') THEN
    SELECT COUNT(*)
    INTO v_photo_count
    FROM field_evidence_assets
    WHERE field_visit_id = p_field_visit_id
      AND evidence_type = 'photo';

    IF COALESCE(v_photo_count, 0) < 1 THEN
      RAISE EXCEPTION 'At least one photo is required before completing a % visit', p_outcome;
    END IF;
  END IF;

  -- ── Look up step-1 escalation owner from config (fallback to defaults) ──
  SELECT owner_name, owner_role, sla_hours
  INTO v_step1_owner_name, v_step1_owner_role, v_step1_sla_hours
  FROM governance_escalation_config
  WHERE organization_id = v_visit.organization_id
    AND issue_type = CASE
      WHEN p_outcome = 'access_issue' THEN 'access_issue'
      ELSE 'potential_force_majeure'
    END
    AND step_number = 1
    AND is_active = true
  LIMIT 1;

  -- Fallback to existing defaults if no config row exists
  v_step1_owner_name := COALESCE(v_step1_owner_name, 'Bill Johnson');
  v_step1_owner_role := COALESCE(v_step1_owner_role, 'Chief Compliance Officer');
  v_step1_sla_hours := COALESCE(v_step1_sla_hours, 24);

  v_sampling_event_id := v_visit.linked_sampling_event_id;

  IF p_outcome = 'sample_collected' AND v_sampling_event_id IS NULL THEN
    SELECT site_id INTO v_outfall_site_id
    FROM outfalls WHERE id = v_visit.outfall_id;

    INSERT INTO sampling_events (
      outfall_id,
      site_id,
      sampled_by,
      sample_date,
      sample_time,
      status,
      weather_conditions,
      metadata
    )
    VALUES (
      v_visit.outfall_id,
      v_outfall_site_id,
      auth.uid(),
      v_visit.scheduled_date,
      COALESCE(v_visit.started_at::time(0), current_time(0)),
      'pending',
      p_weather_conditions,
      jsonb_build_object(
        'source', 'field_visit',
        'field_visit_id', p_field_visit_id,
        'sampler_name', v_actor_name,
        'latitude', p_completed_latitude,
        'longitude', p_completed_longitude
      )
    )
    ON CONFLICT (outfall_id, sample_date, sample_time)
    DO UPDATE SET
      sampled_by = COALESCE(EXCLUDED.sampled_by, sampling_events.sampled_by),
      weather_conditions = COALESCE(EXCLUDED.weather_conditions, sampling_events.weather_conditions),
      metadata = sampling_events.metadata || EXCLUDED.metadata
    RETURNING id INTO v_sampling_event_id;
  END IF;

  IF p_outcome = 'no_discharge' THEN
    IF NULLIF(trim(p_no_discharge_narrative), '') IS NULL THEN
      RAISE EXCEPTION 'No-discharge narrative is required';
    END IF;

    INSERT INTO no_discharge_events (
      field_visit_id,
      narrative,
      observed_condition,
      obstruction_observed,
      obstruction_details,
      created_by
    )
    VALUES (
      p_field_visit_id,
      trim(p_no_discharge_narrative),
      p_no_discharge_observed_condition,
      COALESCE(p_no_discharge_obstruction_observed, false),
      p_no_discharge_obstruction_details,
      auth.uid()
    )
    ON CONFLICT (field_visit_id)
    DO UPDATE SET
      narrative = EXCLUDED.narrative,
      observed_condition = EXCLUDED.observed_condition,
      obstruction_observed = EXCLUDED.obstruction_observed,
      obstruction_details = EXCLUDED.obstruction_details,
      updated_at = now();
  END IF;

  IF p_outcome = 'access_issue' THEN
    IF NULLIF(trim(p_access_issue_obstruction_narrative), '') IS NULL THEN
      RAISE EXCEPTION 'Access issue obstruction narrative is required';
    END IF;

    INSERT INTO access_issues (
      field_visit_id,
      issue_type,
      obstruction_narrative,
      contact_attempted,
      contact_name,
      contact_outcome,
      created_by
    )
    VALUES (
      p_field_visit_id,
      COALESCE(NULLIF(trim(p_access_issue_type), ''), 'access_issue'),
      trim(p_access_issue_obstruction_narrative),
      COALESCE(p_access_issue_contact_attempted, false),
      p_access_issue_contact_name,
      p_access_issue_contact_outcome,
      auth.uid()
    )
    ON CONFLICT (field_visit_id)
    DO UPDATE SET
      issue_type = EXCLUDED.issue_type,
      obstruction_narrative = EXCLUDED.obstruction_narrative,
      contact_attempted = EXCLUDED.contact_attempted,
      contact_name = EXCLUDED.contact_name,
      contact_outcome = EXCLUDED.contact_outcome,
      updated_at = now()
    RETURNING id INTO v_access_issue_id;
  END IF;

  IF p_outcome = 'access_issue' THEN
    SELECT id
    INTO v_existing_governance_issue_id
    FROM governance_issues
    WHERE field_visit_id = p_field_visit_id
      AND issue_type = 'access_issue'
    LIMIT 1;

    IF v_existing_governance_issue_id IS NULL THEN
      INSERT INTO governance_issues (
        organization_id,
        field_visit_id,
        access_issue_id,
        issue_type,
        related_entity_type,
        related_entity_id,
        related_outfall_id,
        related_permit_id,
        decree_paragraphs,
        title,
        issue_summary,
        current_status,
        current_step,
        current_owner_name,
        current_owner_role,
        response_deadline,
        created_by
      )
      VALUES (
        v_visit.organization_id,
        p_field_visit_id,
        v_access_issue_id,
        'access_issue',
        'access_issue',
        v_access_issue_id,
        v_visit.outfall_id,
        v_visit.permit_id,
        ARRAY['sampling_access'],
        format('Access issue at %s', COALESCE(v_visit.outfall_id::text, 'outfall')),
        trim(p_access_issue_obstruction_narrative),
        'open',
        1,
        v_step1_owner_name,
        v_step1_owner_role,
        v_now + (v_step1_sla_hours || ' hours')::interval,
        auth.uid()
      )
      RETURNING id INTO v_existing_governance_issue_id;

      INSERT INTO governance_issue_events (
        governance_issue_id,
        event_type,
        to_status,
        actor_user_id,
        actor_name,
        notes,
        metadata
      )
      VALUES (
        v_existing_governance_issue_id,
        'created',
        'open',
        auth.uid(),
        v_actor_name,
        format('Access issue routed to %s', v_step1_owner_name),
        jsonb_build_object(
          'issue_type', 'access_issue',
          'field_visit_id', p_field_visit_id
        )
      );
    END IF;

    v_governance_issue_id := v_existing_governance_issue_id;
  END IF;

  IF COALESCE(p_potential_force_majeure, false) THEN
    -- Look up FM-specific escalation config
    SELECT owner_name, owner_role, sla_hours
    INTO v_step1_owner_name, v_step1_owner_role, v_step1_sla_hours
    FROM governance_escalation_config
    WHERE organization_id = v_visit.organization_id
      AND issue_type = 'potential_force_majeure'
      AND step_number = 1
      AND is_active = true
    LIMIT 1;

    v_step1_owner_name := COALESCE(v_step1_owner_name, 'Bill Johnson');
    v_step1_owner_role := COALESCE(v_step1_owner_role, 'Chief Compliance Officer');
    v_step1_sla_hours := COALESCE(v_step1_sla_hours, 24);

    v_notice_deadline := v_now + interval '3 days';
    v_written_deadline := v_now + interval '7 days';

    SELECT id
    INTO v_existing_governance_issue_id
    FROM governance_issues
    WHERE field_visit_id = p_field_visit_id
      AND issue_type = 'potential_force_majeure'
    LIMIT 1;

    IF v_existing_governance_issue_id IS NULL THEN
      INSERT INTO governance_issues (
        organization_id,
        field_visit_id,
        access_issue_id,
        issue_type,
        related_entity_type,
        related_entity_id,
        related_outfall_id,
        related_permit_id,
        decree_paragraphs,
        title,
        issue_summary,
        current_status,
        current_step,
        current_owner_name,
        current_owner_role,
        response_deadline,
        notice_deadline,
        written_deadline,
        created_by
      )
      VALUES (
        v_visit.organization_id,
        p_field_visit_id,
        v_access_issue_id,
        'potential_force_majeure',
        'field_visit',
        p_field_visit_id,
        v_visit.outfall_id,
        v_visit.permit_id,
        ARRAY['force_majeure'],
        format('Potential force majeure at %s', COALESCE(v_visit.outfall_id::text, 'outfall')),
        COALESCE(NULLIF(trim(p_potential_force_majeure_notes), ''), 'Potential force majeure flagged from field visit'),
        'open',
        1,
        v_step1_owner_name,
        v_step1_owner_role,
        v_now + (v_step1_sla_hours || ' hours')::interval,
        v_notice_deadline,
        v_written_deadline,
        auth.uid()
      )
      RETURNING id INTO v_existing_governance_issue_id;

      INSERT INTO governance_issue_events (
        governance_issue_id,
        event_type,
        to_status,
        actor_user_id,
        actor_name,
        notes,
        metadata
      )
      VALUES (
        v_existing_governance_issue_id,
        'created',
        'open',
        auth.uid(),
        v_actor_name,
        format('Potential force majeure routed to %s', v_step1_owner_name),
        jsonb_build_object(
          'issue_type', 'potential_force_majeure',
          'field_visit_id', p_field_visit_id
        )
      );
    END IF;

    IF v_governance_issue_id IS NULL THEN
      v_governance_issue_id := v_existing_governance_issue_id;
    END IF;
  END IF;

  IF v_governance_issue_id IS NOT NULL THEN
    UPDATE field_evidence_assets
    SET governance_issue_id = v_governance_issue_id
    WHERE field_visit_id = p_field_visit_id
      AND governance_issue_id IS NULL;
  END IF;

  UPDATE field_visits
  SET visit_status = 'completed',
      outcome = p_outcome,
      completed_at = v_now,
      completed_latitude = p_completed_latitude,
      completed_longitude = p_completed_longitude,
      weather_conditions = p_weather_conditions,
      field_notes = p_field_notes,
      potential_force_majeure = COALESCE(p_potential_force_majeure, false),
      potential_force_majeure_notes = p_potential_force_majeure_notes,
      linked_sampling_event_id = v_sampling_event_id
  WHERE id = p_field_visit_id;

  RETURN jsonb_build_object(
    'linked_sampling_event_id', v_sampling_event_id,
    'governance_issue_id', v_governance_issue_id
  );
END;
$$;


ALTER FUNCTION "public"."complete_field_visit"("p_field_visit_id" "uuid", "p_outcome" "text", "p_completed_latitude" numeric, "p_completed_longitude" numeric, "p_weather_conditions" "text", "p_field_notes" "text", "p_potential_force_majeure" boolean, "p_potential_force_majeure_notes" "text", "p_no_discharge_narrative" "text", "p_no_discharge_observed_condition" "text", "p_no_discharge_obstruction_observed" boolean, "p_no_discharge_obstruction_details" "text", "p_access_issue_type" "text", "p_access_issue_obstruction_narrative" "text", "p_access_issue_contact_attempted" boolean, "p_access_issue_contact_name" "text", "p_access_issue_contact_outcome" "text", "p_actor_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ca_from_incident"("p_incident_id" "uuid", "p_title" "text" DEFAULT NULL::"text", "p_priority" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_incident RECORD;
  v_type RECORD;
  v_caller_org uuid;
  v_ca_id uuid;
  v_site_id uuid;
  v_permit_id uuid;
  v_state text;
BEGIN
  v_caller_org := get_user_org_id();

  SELECT * INTO v_incident FROM incidents WHERE id = p_incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
  IF v_incident.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied: incident belongs to another organization';
  END IF;

  -- Already has CA?
  IF v_incident.corrective_action_id IS NOT NULL THEN
    RAISE EXCEPTION 'Incident already has a linked corrective action';
  END IF;

  SELECT * INTO v_type FROM incident_types WHERE id = v_incident.incident_type_id;

  -- Resolve site/permit
  IF v_incident.field_visit_id IS NOT NULL THEN
    SELECT fv.site_id, fv.permit_id INTO v_site_id, v_permit_id
    FROM field_visits fv WHERE fv.id = v_incident.field_visit_id;
  END IF;

  IF v_site_id IS NOT NULL THEN
    SELECT st.code INTO v_state
    FROM sites s JOIN states st ON s.state_id = st.id
    WHERE s.id = v_site_id;
  END IF;

  INSERT INTO corrective_actions (
    organization_id, site_id, npdes_permit_id, state,
    source_type, source_id,
    title, description,
    priority, status, workflow_step,
    due_date, date_received,
    created_by, created_at, updated_at
  ) VALUES (
    v_caller_org, v_site_id, v_permit_id, v_state,
    'incident', p_incident_id,
    COALESCE(p_title, format('Incident: %s — %s', COALESCE(v_type.name, 'Unknown'), v_incident.title)),
    v_incident.description,
    COALESCE(p_priority,
      CASE v_incident.severity
        WHEN 'critical' THEN 'critical'
        WHEN 'high' THEN 'high'
        WHEN 'medium' THEN 'medium'
        ELSE 'low'
      END),
    'open', 'identification',
    (CURRENT_DATE + INTERVAL '7 days')::date,
    v_incident.reported_at::date,
    auth.uid(), now(), now()
  ) RETURNING id INTO v_ca_id;

  -- Link CA to incident
  UPDATE incidents SET
    corrective_action_id = v_ca_id,
    auto_ca_triggered = true,
    auto_ca_created_at = now(),
    updated_at = now()
  WHERE id = p_incident_id;

  -- Event on incident timeline
  INSERT INTO incident_events (
    incident_id, event_type, actor_name, actor_user_id,
    new_value, notes
  ) VALUES (
    p_incident_id, 'ca_created',
    (SELECT COALESCE(first_name || ' ' || last_name, email) FROM user_profiles WHERE id = auth.uid()),
    auth.uid(),
    v_ca_id::text,
    'Corrective Action created manually from incident'
  );

  RETURN v_ca_id;
END;
$$;


ALTER FUNCTION "public"."create_ca_from_incident"("p_incident_id" "uuid", "p_title" "text", "p_priority" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_incident"("p_incident_type_code" "text", "p_title" "text", "p_description" "text" DEFAULT NULL::"text", "p_severity" "public"."incident_severity" DEFAULT NULL::"public"."incident_severity", "p_field_visit_id" "uuid" DEFAULT NULL::"uuid", "p_decree_paragraphs" "text"[] DEFAULT '{}'::"text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_type RECORD;
  v_incident_id uuid;
  v_countdown_expires timestamptz;
  v_step1 RECORD;
  v_actor_name text;
BEGIN
  v_org_id := get_user_org_id();

  SELECT * INTO v_type
  FROM incident_types
  WHERE organization_id = v_org_id AND code = p_incident_type_code AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown incident type: %', p_incident_type_code;
  END IF;

  -- Compute countdown expiry
  IF v_type.countdown_hours IS NOT NULL THEN
    v_countdown_expires := now() + (v_type.countdown_hours || ' hours')::interval;
  END IF;

  -- Get step 1 owner from operational chain
  SELECT * INTO v_step1
  FROM escalation_chain_steps
  WHERE chain_id = v_type.operational_chain_id AND step_number = 1;

  -- Actor name
  SELECT COALESCE(first_name || ' ' || last_name, email)
  INTO v_actor_name
  FROM user_profiles WHERE id = auth.uid();

  INSERT INTO incidents (
    organization_id, incident_type_id,
    severity, recoverability, status,
    title, description,
    countdown_started_at, countdown_expires_at, countdown_reason,
    active_chain_type, current_escalation_step,
    current_owner_name, current_owner_role, current_owner_user_id,
    field_visit_id, decree_paragraphs,
    reported_by,
    classification_level
  ) VALUES (
    v_org_id, v_type.id,
    COALESCE(p_severity, v_type.default_severity),
    v_type.default_recoverability,
    'open',
    p_title, p_description,
    CASE WHEN v_countdown_expires IS NOT NULL THEN now() END,
    v_countdown_expires,
    CASE WHEN v_countdown_expires IS NOT NULL THEN
      'Auto-countdown: ' || v_type.countdown_hours || 'h response window'
    END,
    'operational', 1,
    v_step1.owner_name, v_step1.owner_role, v_step1.owner_user_id,
    p_field_visit_id, p_decree_paragraphs,
    auth.uid(),
    CASE
      WHEN array_length(p_decree_paragraphs, 1) > 0 THEN 'compliance_sensitive'
      ELSE 'operational_internal'
    END
  ) RETURNING id INTO v_incident_id;

  -- Create initial event
  INSERT INTO incident_events (
    incident_id, event_type, actor_name, actor_user_id,
    new_value, notes
  ) VALUES (
    v_incident_id, 'created', v_actor_name, auth.uid(),
    v_type.code, p_description
  );

  -- Countdown event
  IF v_countdown_expires IS NOT NULL THEN
    INSERT INTO incident_events (
      incident_id, event_type, actor_name, actor_user_id,
      new_value, notes
    ) VALUES (
      v_incident_id, 'countdown_started', 'System', NULL,
      v_countdown_expires::text,
      v_type.countdown_hours || 'h response window started'
    );
  END IF;

  RETURN v_incident_id;
END;
$$;


ALTER FUNCTION "public"."create_incident"("p_incident_type_code" "text", "p_title" "text", "p_description" "text", "p_severity" "public"."incident_severity", "p_field_visit_id" "uuid", "p_decree_paragraphs" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_manual_sampling_calendar_entry"("p_permit_id" "uuid", "p_outfall_id" "uuid", "p_parameter_id" "uuid", "p_scheduled_date" "date", "p_entry_type" "text", "p_route_zone" "text" DEFAULT NULL::"text", "p_default_assigned_to" "uuid" DEFAULT NULL::"uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_id uuid;
  v_schedule_id uuid;
  v_calendar_id uuid;
  v_entry_type text := lower(COALESCE(NULLIF(trim(p_entry_type), ''), 'manual'));
BEGIN
  IF v_entry_type NOT IN ('manual', 'rain_event') THEN
    RAISE EXCEPTION 'Unsupported manual entry type: %', p_entry_type;
  END IF;

  SELECT organization_id
  INTO v_org_id
  FROM npdes_permits
  WHERE id = p_permit_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Permit % was not found', p_permit_id;
  END IF;

  IF v_org_id <> get_user_org_id() THEN
    RAISE EXCEPTION 'Permit % is outside the active organization scope', p_permit_id;
  END IF;

  INSERT INTO sampling_schedules (
    organization_id,
    permit_id,
    outfall_id,
    parameter_id,
    frequency_code,
    frequency_description,
    sample_type,
    route_zone,
    default_assigned_to,
    instructions,
    source
  )
  VALUES (
    v_org_id,
    p_permit_id,
    p_outfall_id,
    p_parameter_id,
    v_entry_type,
    CASE
      WHEN v_entry_type = 'rain_event' THEN 'Rain event / weather-triggered'
      ELSE 'Manual supervisor-created entry'
    END,
    'grab',
    p_route_zone,
    p_default_assigned_to,
    p_reason,
    v_entry_type
  )
  ON CONFLICT (organization_id, permit_id, outfall_id, parameter_id, frequency_code, sample_type, source)
  DO UPDATE SET
    route_zone = COALESCE(EXCLUDED.route_zone, sampling_schedules.route_zone),
    default_assigned_to = COALESCE(EXCLUDED.default_assigned_to, sampling_schedules.default_assigned_to),
    instructions = COALESCE(EXCLUDED.instructions, sampling_schedules.instructions),
    updated_at = now()
  RETURNING id INTO v_schedule_id;

  INSERT INTO sampling_calendar (
    organization_id,
    schedule_id,
    outfall_id,
    parameter_id,
    scheduled_date,
    window_start,
    window_end,
    status,
    dispatch_status,
    route_zone,
    default_assigned_to,
    override_reason
  )
  VALUES (
    v_org_id,
    v_schedule_id,
    p_outfall_id,
    p_parameter_id,
    p_scheduled_date,
    p_scheduled_date,
    p_scheduled_date,
    'pending',
    'ready',
    p_route_zone,
    p_default_assigned_to,
    p_reason
  )
  ON CONFLICT (schedule_id, scheduled_date)
  DO UPDATE SET
    route_zone = COALESCE(EXCLUDED.route_zone, sampling_calendar.route_zone),
    default_assigned_to = COALESCE(EXCLUDED.default_assigned_to, sampling_calendar.default_assigned_to),
    override_reason = COALESCE(EXCLUDED.override_reason, sampling_calendar.override_reason),
    updated_at = now()
  RETURNING id INTO v_calendar_id;

  INSERT INTO sampling_calendar_adjustments (
    organization_id,
    calendar_id,
    adjustment_type,
    new_scheduled_date,
    reason,
    metadata
  )
  VALUES (
    v_org_id,
    v_calendar_id,
    CASE WHEN v_entry_type = 'rain_event' THEN 'rain_event' ELSE 'manual_entry' END,
    p_scheduled_date,
    COALESCE(p_reason, 'Manual sampling calendar entry created'),
    jsonb_build_object('entry_type', v_entry_type)
  );

  RETURN jsonb_build_object(
    'schedule_id', v_schedule_id,
    'calendar_id', v_calendar_id
  );
END;
$$;


ALTER FUNCTION "public"."create_manual_sampling_calendar_entry"("p_permit_id" "uuid", "p_outfall_id" "uuid", "p_parameter_id" "uuid", "p_scheduled_date" "date", "p_entry_type" "text", "p_route_zone" "text", "p_default_assigned_to" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sampling_route_batch"("p_route_date" "date", "p_route_zone" "text", "p_assigned_to" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text", "p_calendar_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_route_batch_id uuid;
  v_selected_count integer := 0;
BEGIN
  IF NOT can_manage_sampling_records() THEN
    RAISE EXCEPTION 'Only managers can create route batches';
  END IF;

  IF NULLIF(trim(p_route_zone), '') IS NULL THEN
    RAISE EXCEPTION 'Route zone is required';
  END IF;

  INSERT INTO sampling_route_batches (
    organization_id,
    route_date,
    route_zone,
    assigned_to,
    notes,
    created_by
  )
  VALUES (
    get_user_org_id(),
    p_route_date,
    trim(p_route_zone),
    p_assigned_to,
    p_notes,
    auth.uid()
  )
  RETURNING id INTO v_route_batch_id;

  WITH eligible AS (
    SELECT
      sc.id AS calendar_id,
      derive_sampling_priority_rank(p.name, sc.scheduled_date) AS priority_rank,
      derive_sampling_priority_reason(p.name, sc.scheduled_date) AS priority_reason,
      o.outfall_number
    FROM sampling_calendar sc
    JOIN parameters p ON p.id = sc.parameter_id
    JOIN outfalls o ON o.id = sc.outfall_id
    WHERE sc.organization_id = get_user_org_id()
      AND sc.scheduled_date = p_route_date
      AND sc.status IN ('pending', 'overdue')
      AND sc.dispatch_status = 'ready'
      AND sc.current_field_visit_id IS NULL
      AND sc.current_route_batch_id IS NULL
      AND COALESCE(sc.route_zone, '') = COALESCE(trim(p_route_zone), '')
      AND (
        p_calendar_ids IS NULL
        OR sc.id = ANY(p_calendar_ids)
      )
  ),
  inserted AS (
    INSERT INTO sampling_route_stops (
      route_batch_id,
      calendar_id,
      stop_sequence,
      priority_rank,
      priority_reason
    )
    SELECT
      v_route_batch_id,
      eligible.calendar_id,
      row_number() OVER (ORDER BY eligible.priority_rank ASC, eligible.outfall_number ASC, eligible.calendar_id ASC),
      eligible.priority_rank,
      eligible.priority_reason
    FROM eligible
    ON CONFLICT (calendar_id) DO NOTHING
    RETURNING calendar_id
  )
  UPDATE sampling_calendar sc
  SET current_route_batch_id = v_route_batch_id,
      updated_at = now()
  WHERE sc.id IN (SELECT calendar_id FROM inserted);

  GET DIAGNOSTICS v_selected_count = ROW_COUNT;

  IF v_selected_count = 0 THEN
    DELETE FROM sampling_route_batches WHERE id = v_route_batch_id;
    RAISE EXCEPTION 'No eligible sampling calendar items were available for route batching';
  END IF;

  PERFORM recalculate_sampling_route_batch_status(v_route_batch_id);

  RETURN jsonb_build_object(
    'route_batch_id', v_route_batch_id,
    'stop_count', v_selected_count
  );
END;
$$;


ALTER FUNCTION "public"."create_sampling_route_batch"("p_route_date" "date", "p_route_zone" "text", "p_assigned_to" "uuid", "p_notes" "text", "p_calendar_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_has_any_role"("p_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_role_assignments ura
    JOIN roles r ON r.id = ura.role_id
    WHERE ura.user_id = auth.uid()
      AND r.name = ANY(p_roles)
  );
$$;


ALTER FUNCTION "public"."current_user_has_any_role"("p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cutover_scope_table_count"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."cutover_scope_table_count"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."derive_sampling_priority_rank"("p_parameter_name" "text", "p_scheduled_date" "date") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    CASE
      WHEN p_scheduled_date < CURRENT_DATE THEN 0
      WHEN p_scheduled_date = CURRENT_DATE THEN 1000
      WHEN p_scheduled_date <= CURRENT_DATE + 2 THEN 2000
      ELSE 3000
    END
    + CASE
        WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(fecal|bacteria|e\\. coli|ecoli|coliform|enterococcus)%' THEN 0
        WHEN lower(COALESCE(p_parameter_name, '')) LIKE '%bod%' THEN 10
        WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(ammonia|nh3|nitrate|nitrite|phosphorus|orthophosphate)%' THEN 25
        WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(chlorine|residual chlorine|oil|grease|og)%' THEN 35
        ELSE 100
      END;
$$;


ALTER FUNCTION "public"."derive_sampling_priority_rank"("p_parameter_name" "text", "p_scheduled_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."derive_sampling_priority_reason"("p_parameter_name" "text", "p_scheduled_date" "date") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT concat_ws(
    ' / ',
    CASE
      WHEN p_scheduled_date < CURRENT_DATE THEN 'overdue'
      WHEN p_scheduled_date = CURRENT_DATE THEN 'due_today'
      WHEN p_scheduled_date <= CURRENT_DATE + 2 THEN 'due_soon'
      ELSE 'scheduled'
    END,
    CASE
      WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(fecal|bacteria|e\\. coli|ecoli|coliform|enterococcus)%' THEN 'short_hold_bacteria'
      WHEN lower(COALESCE(p_parameter_name, '')) LIKE '%bod%' THEN 'short_hold_bod'
      WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(ammonia|nh3|nitrate|nitrite|phosphorus|orthophosphate)%' THEN 'short_hold_nutrient'
      WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(chlorine|residual chlorine|oil|grease|og)%' THEN 'short_hold_other'
      ELSE NULL
    END
  );
$$;


ALTER FUNCTION "public"."derive_sampling_priority_reason"("p_parameter_name" "text", "p_scheduled_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_exceedance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_outfall_id uuid;
  v_sample_date date;
  v_org_id uuid;
  v_limit RECORD;
  v_conversion_factor numeric;
  v_normalized_result numeric;
  v_exceedance_pct numeric;
  v_severity text;
  v_result_unit text;
BEGIN
  -- Skip if no result value or non-detect
  IF NEW.result_value IS NULL OR NEW.is_non_detect = true THEN
    RETURN NEW;
  END IF;

  -- Get sampling event context
  SELECT
    se.outfall_id,
    se.sample_date,
    np.organization_id
  INTO v_outfall_id, v_sample_date, v_org_id
  FROM public.sampling_events se
  JOIN public.outfalls o ON o.id = se.outfall_id
  JOIN public.npdes_permits np ON np.id = o.permit_id
  WHERE se.id = NEW.sampling_event_id;

  -- Exit if no outfall found
  IF v_outfall_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get result unit
  v_result_unit := COALESCE(NEW.unit, '');

  -- Check against all applicable permit limits
  FOR v_limit IN
    SELECT
      pl.id as limit_id,
      pl.limit_value,
      pl.limit_min,
      pl.limit_max,
      pl.limit_type,
      pl.unit as limit_unit,
      pl.is_active
    FROM public.permit_limits pl
    WHERE pl.outfall_id = v_outfall_id
      AND pl.parameter_id = NEW.parameter_id
      AND pl.is_active = true
      AND pl.limit_type != 'report_only'
      AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
  LOOP
    -- Get unit conversion factor
    v_conversion_factor := public.get_unit_conversion(
      NEW.parameter_id,
      v_result_unit,
      v_limit.limit_unit
    );

    -- Normalize result to limit units
    v_normalized_result := NEW.result_value * v_conversion_factor;

    -- Determine which limit value to compare
    DECLARE
      v_comparison_value numeric;
    BEGIN
      -- Use limit_max for range limits (pH), limit_value for others
      IF v_limit.limit_max IS NOT NULL AND v_limit.limit_type = 'range' THEN
        v_comparison_value := v_limit.limit_max;
      ELSE
        v_comparison_value := COALESCE(v_limit.limit_value, v_limit.limit_max);
      END IF;

      -- Skip if no comparison value
      IF v_comparison_value IS NULL OR v_comparison_value = 0 THEN
        CONTINUE;
      END IF;

      -- Check for exceedance
      IF v_normalized_result > v_comparison_value THEN
        -- Calculate exceedance percentage
        v_exceedance_pct := ((v_normalized_result - v_comparison_value) / v_comparison_value) * 100;

        -- Determine severity based on percentage
        v_severity := CASE
          WHEN v_exceedance_pct > 100 THEN 'critical'
          WHEN v_exceedance_pct > 50 THEN 'major'
          WHEN v_exceedance_pct > 10 THEN 'moderate'
          ELSE 'minor'
        END;

        -- Insert or update exceedance record
        INSERT INTO public.exceedances (
          organization_id,
          lab_result_id,
          permit_limit_id,
          outfall_id,
          parameter_id,
          sample_date,
          result_value,
          unit,
          limit_value,
          limit_type,
          exceedance_pct,
          severity,
          status,
          detected_at
        )
        VALUES (
          v_org_id,
          NEW.id,
          v_limit.limit_id,
          v_outfall_id,
          NEW.parameter_id,
          v_sample_date,
          NEW.result_value,
          v_result_unit,
          v_comparison_value,
          v_limit.limit_type,
          v_exceedance_pct,
          v_severity,
          'open',
          now()
        )
        ON CONFLICT (lab_result_id, permit_limit_id) DO UPDATE
        SET
          result_value = EXCLUDED.result_value,
          exceedance_pct = EXCLUDED.exceedance_pct,
          severity = EXCLUDED.severity,
          detected_at = now();

      ELSE
        -- Result is within limits, remove any existing exceedance
        DELETE FROM public.exceedances
        WHERE lab_result_id = NEW.id
          AND permit_limit_id = v_limit.limit_id;
      END IF;
    END;
  END LOOP;

  -- Also check for range minimum violations (pH below minimum)
  FOR v_limit IN
    SELECT
      pl.id as limit_id,
      pl.limit_min,
      pl.limit_type,
      pl.unit as limit_unit
    FROM public.permit_limits pl
    WHERE pl.outfall_id = v_outfall_id
      AND pl.parameter_id = NEW.parameter_id
      AND pl.is_active = true
      AND pl.limit_type = 'range'
      AND pl.limit_min IS NOT NULL
  LOOP
    -- Get unit conversion factor
    v_conversion_factor := public.get_unit_conversion(
      NEW.parameter_id,
      v_result_unit,
      v_limit.limit_unit
    );

    -- Normalize result to limit units
    v_normalized_result := NEW.result_value * v_conversion_factor;

    -- Check if below minimum
    IF v_normalized_result < v_limit.limit_min THEN
      -- Calculate exceedance percentage (inverted for below-minimum)
      v_exceedance_pct := ((v_limit.limit_min - v_normalized_result) / v_limit.limit_min) * 100;

      -- Determine severity
      v_severity := CASE
        WHEN v_exceedance_pct > 100 THEN 'critical'
        WHEN v_exceedance_pct > 50 THEN 'major'
        WHEN v_exceedance_pct > 10 THEN 'moderate'
        ELSE 'minor'
      END;

      -- Insert or update exceedance record
      INSERT INTO public.exceedances (
        organization_id,
        lab_result_id,
        permit_limit_id,
        outfall_id,
        parameter_id,
        sample_date,
        result_value,
        unit,
        limit_value,
        limit_type,
        exceedance_pct,
        severity,
        status,
        detected_at
      )
      VALUES (
        v_org_id,
        NEW.id,
        v_limit.limit_id,
        v_outfall_id,
        NEW.parameter_id,
        v_sample_date,
        NEW.result_value,
        v_result_unit,
        v_limit.limit_min,
        'below_minimum',
        v_exceedance_pct,
        v_severity,
        'open',
        now()
      )
      ON CONFLICT (lab_result_id, permit_limit_id) DO UPDATE
      SET
        result_value = EXCLUDED.result_value,
        exceedance_pct = EXCLUDED.exceedance_pct,
        severity = EXCLUDED.severity,
        detected_at = now();
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."detect_exceedance"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."detect_exceedance"() IS 'Auto-detect permit limit violations when lab results are inserted/updated. Creates exceedance records which trigger corrective action workflow.';



CREATE OR REPLACE FUNCTION "public"."dispatch_sampling_route_batch"("p_route_batch_id" "uuid", "p_field_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_batch sampling_route_batches%ROWTYPE;
  v_route_stop RECORD;
  v_visit_id uuid;
  v_assigned_to uuid;
  v_created_count integer := 0;
BEGIN
  IF NOT can_manage_sampling_records() THEN
    RAISE EXCEPTION 'Only managers can dispatch route batches';
  END IF;

  SELECT *
  INTO v_batch
  FROM sampling_route_batches
  WHERE id = p_route_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route batch % was not found', p_route_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() THEN
    RAISE EXCEPTION 'Route batch % is outside the active organization scope', p_route_batch_id;
  END IF;

  FOR v_route_stop IN
    SELECT
      rs.id AS route_stop_id,
      sc.id AS calendar_id,
      sc.organization_id,
      sc.outfall_id,
      sc.scheduled_date,
      sc.default_assigned_to,
      ss.permit_id,
      ss.instructions
    FROM sampling_route_stops rs
    JOIN sampling_calendar sc ON sc.id = rs.calendar_id
    JOIN sampling_schedules ss ON ss.id = sc.schedule_id
    WHERE rs.route_batch_id = p_route_batch_id
      AND sc.current_field_visit_id IS NULL
    ORDER BY rs.stop_sequence
  LOOP
    v_assigned_to := COALESCE(v_batch.assigned_to, v_route_stop.default_assigned_to);

    IF v_assigned_to IS NULL THEN
      RAISE EXCEPTION 'Route batch % has a stop without an assigned sampler', p_route_batch_id;
    END IF;

    INSERT INTO field_visits (
      organization_id,
      permit_id,
      outfall_id,
      assigned_to,
      assigned_by,
      scheduled_date,
      field_notes,
      sampling_calendar_id,
      route_batch_id
    )
    VALUES (
      v_route_stop.organization_id,
      v_route_stop.permit_id,
      v_route_stop.outfall_id,
      v_assigned_to,
      auth.uid(),
      v_route_stop.scheduled_date,
      COALESCE(p_field_notes, v_batch.notes, v_route_stop.instructions),
      v_route_stop.calendar_id,
      p_route_batch_id
    )
    RETURNING id INTO v_visit_id;

    UPDATE sampling_route_stops
    SET stop_status = 'dispatched',
        updated_at = now()
    WHERE id = v_route_stop.route_stop_id;

    v_created_count := v_created_count + 1;
  END LOOP;

  PERFORM recalculate_sampling_route_batch_status(p_route_batch_id);

  RETURN jsonb_build_object(
    'route_batch_id', p_route_batch_id,
    'created_visit_count', v_created_count
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_sampling_route_batch"("p_route_batch_id" "uuid", "p_field_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_cutover_write_freeze"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."enforce_cutover_write_freeze"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_field_visit_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_photo_count integer;
  v_no_discharge_count integer;
  v_access_issue_count integer;
  v_access_narrative text;
BEGIN
  IF NEW.visit_status = 'completed' AND COALESCE(OLD.visit_status, '') <> 'completed' THEN
    IF NEW.started_at IS NULL OR NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'Completed visits require started_at and completed_at';
    END IF;

    IF NEW.started_latitude IS NULL OR NEW.started_longitude IS NULL
       OR NEW.completed_latitude IS NULL OR NEW.completed_longitude IS NULL THEN
      RAISE EXCEPTION 'Completed visits require GPS coordinates at start and completion';
    END IF;

    IF NEW.outcome = 'sample_collected' AND NEW.linked_sampling_event_id IS NULL THEN
      RAISE EXCEPTION 'sample_collected visits require a linked sampling_event';
    END IF;

    SELECT COUNT(*)
    INTO v_photo_count
    FROM field_evidence_assets fea
    WHERE fea.field_visit_id = NEW.id
      AND fea.evidence_type = 'photo';

    IF NEW.outcome = 'no_discharge' THEN
      SELECT COUNT(*)
      INTO v_no_discharge_count
      FROM no_discharge_events nde
      WHERE nde.field_visit_id = NEW.id;

      IF v_no_discharge_count = 0 THEN
        RAISE EXCEPTION 'no_discharge visits require a no_discharge_events record';
      END IF;

      IF v_photo_count = 0 THEN
        RAISE EXCEPTION 'no_discharge visits require at least one photo evidence asset';
      END IF;
    END IF;

    IF NEW.outcome = 'access_issue' THEN
      SELECT COUNT(*), MAX(ai.obstruction_narrative)
      INTO v_access_issue_count, v_access_narrative
      FROM access_issues ai
      WHERE ai.field_visit_id = NEW.id;

      IF v_access_issue_count = 0 THEN
        RAISE EXCEPTION 'access_issue visits require an access_issues record';
      END IF;

      IF COALESCE(btrim(v_access_narrative), '') = '' THEN
        RAISE EXCEPTION 'access_issue visits require obstruction narrative';
      END IF;

      IF v_photo_count = 0 THEN
        RAISE EXCEPTION 'access_issue visits require at least one photo evidence asset';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_field_visit_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_field_visit_editable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_field_visit_id uuid;
  v_visit_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_field_visit_id := OLD.field_visit_id;
  ELSE
    v_field_visit_id := NEW.field_visit_id;
  END IF;

  IF v_field_visit_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT visit_status
  INTO v_visit_status
  FROM field_visits
  WHERE id = v_field_visit_id;

  IF v_visit_status = 'completed' THEN
    RAISE EXCEPTION 'Field visit % is completed and can no longer be modified', v_field_visit_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_field_visit_editable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escalate_incident"("p_incident_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_incident RECORD;
  v_type RECORD;
  v_chain_id uuid;
  v_next_step RECORD;
  v_actor_name text;
  v_caller_org uuid;
BEGIN
  v_caller_org := get_user_org_id();

  SELECT * INTO v_incident FROM incidents WHERE id = p_incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;

  -- Verify caller belongs to same org
  IF v_incident.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_type FROM incident_types WHERE id = v_incident.incident_type_id;

  IF v_incident.active_chain_type = 'compliance' THEN
    v_chain_id := v_type.compliance_chain_id;
  ELSE
    v_chain_id := v_type.operational_chain_id;
  END IF;

  IF v_chain_id IS NULL THEN
    RAISE EXCEPTION 'No escalation chain configured for this incident type + chain type';
  END IF;

  SELECT * INTO v_next_step
  FROM escalation_chain_steps
  WHERE chain_id = v_chain_id
    AND step_number = v_incident.current_escalation_step + 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Already at highest escalation level';
  END IF;

  SELECT COALESCE(first_name || ' ' || last_name, email)
  INTO v_actor_name
  FROM user_profiles WHERE id = auth.uid();

  UPDATE incidents SET
    current_escalation_step = v_next_step.step_number,
    current_owner_name = v_next_step.owner_name,
    current_owner_role = v_next_step.owner_role,
    current_owner_user_id = v_next_step.owner_user_id,
    status = 'escalated',
    escalated_at = now(),
    updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (
    incident_id, event_type, actor_name, actor_user_id,
    old_value, new_value, notes
  ) VALUES (
    p_incident_id, 'escalated', v_actor_name, auth.uid(),
    v_incident.current_escalation_step::text,
    v_next_step.step_number::text,
    COALESCE(p_notes, 'Escalated to step ' || v_next_step.step_number || ': ' || v_next_step.owner_name)
  );

  IF v_next_step.owner_user_id IS NOT NULL THEN
    PERFORM send_notification(
      v_next_step.owner_user_id,
      'incident_escalated',
      'Incident escalated to you: ' || v_incident.title,
      p_notes,
      CASE WHEN v_incident.severity = 'critical' THEN 'critical'::notification_priority
           WHEN v_incident.severity = 'high' THEN 'urgent'::notification_priority
           ELSE 'warning'::notification_priority
      END,
      'incident',
      p_incident_id
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."escalate_incident"("p_incident_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_cutover_batch"("p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."execute_cutover_batch"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_readonly_query"("query_text" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  normalized text;
  result jsonb;
begin
  if query_text is null or btrim(query_text) = '' then
    raise exception 'Query is empty';
  end if;

  if length(query_text) > 10000 then
    raise exception 'Query exceeds 10000 character limit';
  end if;

  normalized := upper(regexp_replace(query_text, '\s+', ' ', 'g'));

  if normalized ~ ';\s*[^\s]+' then
    raise exception 'Multiple statements are not allowed';
  end if;

  if normalized !~ '^(SELECT|WITH|EXPLAIN)(\s|$)' then
    raise exception 'Only SELECT queries are permitted';
  end if;

  if normalized ~ '(^|[^A-Z])(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|COPY|VACUUM|REINDEX|CLUSTER|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|PREPARE|CALL|DO|MERGE)([^A-Z]|$)' then
    raise exception 'Only SELECT queries are permitted';
  end if;

  if normalized ~ 'SELECT[\s\S]*INTO[\s\S]*' then
    raise exception 'SELECT INTO is not allowed';
  end if;

  if normalized !~ '\bLIMIT\b' then
    query_text := query_text || ' LIMIT 500';
  end if;

  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s) t', query_text)
    into result;

  return result;
end;
$_$;


ALTER FUNCTION "public"."execute_readonly_query"("query_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_roadmap_tasks_mark_linear_pending"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Reverse-sync writer set the flag for this transaction — don't bounce.
  IF current_setting('app.linear_webhook_writer', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF (NEW.task_description IS DISTINCT FROM OLD.task_description)
     OR (NEW.status         IS DISTINCT FROM OLD.status)
     OR (NEW.phase          IS DISTINCT FROM OLD.phase)
     OR (NEW.section        IS DISTINCT FROM OLD.section)
     OR (NEW.owner_type     IS DISTINCT FROM OLD.owner_type)
     OR (NEW.assigned_to    IS DISTINCT FROM OLD.assigned_to)
     OR (NEW.notes          IS DISTINCT FROM OLD.notes)
     OR (NEW.depends_on     IS DISTINCT FROM OLD.depends_on)
     OR (NEW.unblocks       IS DISTINCT FROM OLD.unblocks)
     OR (NEW.completed_at   IS DISTINCT FROM OLD.completed_at)
  THEN
    NEW.linear_sync_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_roadmap_tasks_mark_linear_pending"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_compliance_snapshot"("p_org_id" "uuid", "p_snapshot_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_snapshot_id uuid;
  v_total_permits integer;
  v_active_permits integer;
  v_total_outfalls integer;
  v_active_outfalls integer;
  v_sampling_due integer;
  v_sampling_completed integer;
  v_sampling_pct numeric;
  v_total_exceedances integer;
  v_open_exceedances integer;
  v_exceedance_rate numeric;
  v_total_violations integer;
  v_open_violations integer;
  v_critical_violations integer;
  v_total_cas integer;
  v_open_cas integer;
  v_overdue_cas integer;
  v_avg_ca_days numeric;
  v_total_wos integer;
  v_open_wos integer;
  v_overdue_wos integer;
  v_dmr_due integer;
  v_dmr_completed integer;
  v_dmr_rate numeric;
  v_total_incidents integer;
  v_open_incidents integer;
  v_total_penalties numeric;
  v_compliance_score numeric;
  v_state_breakdown jsonb;
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active')
  INTO v_total_permits, v_active_permits
  FROM public.npdes_permits
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, id, NULL);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE o.is_active = true)
  INTO v_total_outfalls, v_active_outfalls
  FROM public.outfalls o
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE se.status = 'completed')
  INTO v_sampling_due, v_sampling_completed
  FROM public.sampling_events se
  JOIN public.outfalls o ON se.outfall_id = o.id
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id)
    AND se.scheduled_date >= p_snapshot_date - INTERVAL '30 days'
    AND se.scheduled_date <= p_snapshot_date;

  v_sampling_pct := CASE WHEN v_sampling_due > 0
    THEN ROUND((v_sampling_completed::numeric / v_sampling_due) * 100, 2)
    ELSE 100 END;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE e.status = 'open')
  INTO v_total_exceedances, v_open_exceedances
  FROM public.exceedances e
  JOIN public.outfalls o ON e.outfall_id = o.id
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE e.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id);

  v_exceedance_rate := CASE WHEN v_sampling_completed > 0
    THEN ROUND((v_total_exceedances::numeric / v_sampling_completed) * 100, 2)
    ELSE 0 END;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('open', 'under_investigation')),
    COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved', 'closed'))
  INTO v_total_violations, v_open_violations, v_critical_violations
  FROM public.compliance_violations
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, NULL, NULL);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('closed', 'verified', 'cancelled')),
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('closed', 'verified', 'cancelled')),
    ROUND(AVG(
      CASE WHEN closed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400
      END
    )::numeric, 1)
  INTO v_total_cas, v_open_cas, v_overdue_cas, v_avg_ca_days
  FROM public.corrective_actions
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, npdes_permit_id, NULL);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'verified', 'cancelled')),
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'verified', 'cancelled'))
  INTO v_total_wos, v_open_wos, v_overdue_wos
  FROM public.work_orders
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, permit_id, outfall_id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ds.status IN ('submitted', 'accepted'))
  INTO v_dmr_due, v_dmr_completed
  FROM public.dmr_submissions ds
  JOIN public.npdes_permits p ON p.id = ds.permit_id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, ds.permit_id, NULL)
    AND ds.period_start >= date_trunc('quarter', p_snapshot_date::timestamp)::date;

  v_dmr_rate := CASE WHEN v_dmr_due > 0
    THEN ROUND((v_dmr_completed::numeric / v_dmr_due) * 100, 2)
    ELSE 100 END;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('open', 'investigating'))
  INTO v_total_incidents, v_open_incidents
  FROM public.incidents
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, NULL, permit_id, outfall_id);

  SELECT COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0)
  INTO v_total_penalties
  FROM public.compliance_violations
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, NULL, NULL);

  v_compliance_score := ROUND(
    (v_sampling_pct * 0.40) +
    ((100 - LEAST(v_exceedance_rate, 100)) * 0.25) +
    (CASE WHEN v_total_cas > 0
      THEN ((v_total_cas - v_overdue_cas)::numeric / v_total_cas) * 100
      ELSE 100 END * 0.20) +
    (v_dmr_rate * 0.15),
    2
  );

  SELECT jsonb_agg(jsonb_build_object(
    'state', sub.state_code,
    'permits', sub.permit_count,
    'outfalls', sub.outfall_count,
    'exceedances', sub.exc_count,
    'violations', sub.viol_count
  ))
  INTO v_state_breakdown
  FROM (
    SELECT
      s.state_code,
      COUNT(DISTINCT p.id) AS permit_count,
      COUNT(DISTINCT o.id) AS outfall_count,
      COUNT(DISTINCT e.id) AS exc_count,
      COUNT(DISTINCT cv.id) AS viol_count
    FROM public.sites s
    LEFT JOIN public.npdes_permits p
      ON p.site_id = s.id
      AND p.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, p.id, NULL)
    LEFT JOIN public.outfalls o
      ON o.permit_id = p.id
      AND public.in_live_program_scope(p_org_id, s.id, p.id, o.id)
    LEFT JOIN public.exceedances e
      ON e.outfall_id = o.id
      AND e.organization_id = p_org_id
    LEFT JOIN public.compliance_violations cv
      ON cv.site_id = s.id
      AND cv.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, NULL, NULL)
    WHERE s.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, NULL, NULL)
    GROUP BY s.state_code
  ) sub;

  INSERT INTO public.compliance_snapshots (
    organization_id, snapshot_date, snapshot_type,
    total_permits, active_permits, total_outfalls, active_outfalls,
    sampling_events_due, sampling_events_completed, sampling_compliance_pct,
    total_exceedances, open_exceedances, exceedance_rate_pct,
    total_violations, open_violations, critical_violations,
    total_corrective_actions, open_corrective_actions, overdue_corrective_actions, avg_ca_closure_days,
    total_work_orders, open_work_orders, overdue_work_orders,
    dmr_submissions_due, dmr_submissions_completed, dmr_submission_rate_pct,
    total_incidents, open_incidents,
    total_penalties, compliance_score, state_breakdown,
    generated_by
  ) VALUES (
    p_org_id, p_snapshot_date, 'daily',
    v_total_permits, v_active_permits, v_total_outfalls, v_active_outfalls,
    v_sampling_due, v_sampling_completed, v_sampling_pct,
    v_total_exceedances, v_open_exceedances, v_exceedance_rate,
    v_total_violations, v_open_violations, v_critical_violations,
    v_total_cas, v_open_cas, v_overdue_cas, v_avg_ca_days,
    v_total_wos, v_open_wos, v_overdue_wos,
    v_dmr_due, v_dmr_completed, v_dmr_rate,
    v_total_incidents, v_open_incidents,
    v_total_penalties, v_compliance_score, v_state_breakdown,
    auth.uid()
  )
  ON CONFLICT (organization_id, snapshot_date, snapshot_type)
  DO UPDATE SET
    total_permits = EXCLUDED.total_permits,
    active_permits = EXCLUDED.active_permits,
    total_outfalls = EXCLUDED.total_outfalls,
    active_outfalls = EXCLUDED.active_outfalls,
    sampling_events_due = EXCLUDED.sampling_events_due,
    sampling_events_completed = EXCLUDED.sampling_events_completed,
    sampling_compliance_pct = EXCLUDED.sampling_compliance_pct,
    total_exceedances = EXCLUDED.total_exceedances,
    open_exceedances = EXCLUDED.open_exceedances,
    exceedance_rate_pct = EXCLUDED.exceedance_rate_pct,
    total_violations = EXCLUDED.total_violations,
    open_violations = EXCLUDED.open_violations,
    critical_violations = EXCLUDED.critical_violations,
    total_corrective_actions = EXCLUDED.total_corrective_actions,
    open_corrective_actions = EXCLUDED.open_corrective_actions,
    overdue_corrective_actions = EXCLUDED.overdue_corrective_actions,
    avg_ca_closure_days = EXCLUDED.avg_ca_closure_days,
    total_work_orders = EXCLUDED.total_work_orders,
    open_work_orders = EXCLUDED.open_work_orders,
    overdue_work_orders = EXCLUDED.overdue_work_orders,
    dmr_submissions_due = EXCLUDED.dmr_submissions_due,
    dmr_submissions_completed = EXCLUDED.dmr_submissions_completed,
    dmr_submission_rate_pct = EXCLUDED.dmr_submission_rate_pct,
    total_incidents = EXCLUDED.total_incidents,
    open_incidents = EXCLUDED.open_incidents,
    total_penalties = EXCLUDED.total_penalties,
    compliance_score = EXCLUDED.compliance_score,
    state_breakdown = EXCLUDED.state_breakdown,
    generated_by = EXCLUDED.generated_by,
    created_at = now()
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;


ALTER FUNCTION "public"."generate_compliance_snapshot"("p_org_id" "uuid", "p_snapshot_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_sampling_calendar"("p_month_start" "date", "p_organization_id" "uuid" DEFAULT "public"."get_user_org_id"()) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_schedule sampling_schedules%ROWTYPE;
  v_month_start date := date_trunc('month', p_month_start)::date;
  v_month_end date := (date_trunc('month', p_month_start) + interval '1 month - 1 day')::date;
  v_days_in_month integer := EXTRACT(day FROM (date_trunc('month', p_month_start) + interval '1 month - 1 day'))::integer;
  v_candidate date;
  v_candidate_two date;
  v_preferred_dom integer;
  v_secondary_dom integer;
  v_preferred_dow integer;
  v_inserted integer := 0;
  v_row_count integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR v_schedule IN
    SELECT *
    FROM sampling_schedules
    WHERE organization_id = p_organization_id
      AND is_active = true
  LOOP
    CASE lower(COALESCE(v_schedule.frequency_code, ''))
      WHEN 'weekly' THEN
        v_preferred_dow := COALESCE(
          v_schedule.preferred_day_of_week,
          EXTRACT(dow FROM COALESCE(v_schedule.schedule_anchor_date, v_month_start))::integer
        );

        v_candidate := v_month_start + ((7 + v_preferred_dow - EXTRACT(dow FROM v_month_start)::integer) % 7);

        WHILE v_candidate <= v_month_end LOOP
          INSERT INTO sampling_calendar (
            organization_id,
            schedule_id,
            outfall_id,
            parameter_id,
            scheduled_date,
            window_start,
            window_end,
            status,
            dispatch_status,
            route_zone,
            default_assigned_to
          )
          VALUES (
            p_organization_id,
            v_schedule.id,
            v_schedule.outfall_id,
            v_schedule.parameter_id,
            v_candidate,
            v_candidate,
            v_candidate,
            'pending',
            'ready',
            v_schedule.route_zone,
            v_schedule.default_assigned_to
          )
          ON CONFLICT (schedule_id, scheduled_date) DO NOTHING;

          GET DIAGNOSTICS v_row_count = ROW_COUNT;
          v_inserted := v_inserted + v_row_count;
          v_candidate := v_candidate + 7;
        END LOOP;

      WHEN 'monthly' THEN
        v_preferred_dom := LEAST(
          COALESCE(
            v_schedule.preferred_day_of_month,
            EXTRACT(day FROM COALESCE(v_schedule.schedule_anchor_date, v_month_start))::integer,
            15
          ),
          v_days_in_month
        );

        v_candidate := make_date(EXTRACT(year FROM v_month_start)::integer, EXTRACT(month FROM v_month_start)::integer, v_preferred_dom);

        INSERT INTO sampling_calendar (
          organization_id,
          schedule_id,
          outfall_id,
          parameter_id,
          scheduled_date,
          window_start,
          window_end,
          status,
          dispatch_status,
          route_zone,
          default_assigned_to
        )
        VALUES (
          p_organization_id,
          v_schedule.id,
          v_schedule.outfall_id,
          v_schedule.parameter_id,
          v_candidate,
          v_candidate,
          v_candidate,
          'pending',
          'ready',
          v_schedule.route_zone,
          v_schedule.default_assigned_to
        )
        ON CONFLICT (schedule_id, scheduled_date) DO NOTHING;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_inserted := v_inserted + v_row_count;

      WHEN 'semi_monthly' THEN
        v_preferred_dom := LEAST(
          COALESCE(
            v_schedule.preferred_day_of_month,
            EXTRACT(day FROM COALESCE(v_schedule.schedule_anchor_date, v_month_start))::integer,
            1
          ),
          v_days_in_month
        );

        v_secondary_dom := LEAST(
          COALESCE(v_schedule.secondary_day_of_month, 15),
          v_days_in_month
        );

        v_candidate := make_date(EXTRACT(year FROM v_month_start)::integer, EXTRACT(month FROM v_month_start)::integer, v_preferred_dom);
        v_candidate_two := make_date(EXTRACT(year FROM v_month_start)::integer, EXTRACT(month FROM v_month_start)::integer, v_secondary_dom);

        IF v_candidate_two <= v_candidate THEN
          v_candidate_two := LEAST(
            v_candidate + GREATEST(COALESCE(v_schedule.min_days_between_samples, 14), 10),
            v_month_end
          );
        END IF;

        IF (v_candidate_two - v_candidate) < GREATEST(COALESCE(v_schedule.min_days_between_samples, 10), 10) THEN
          v_candidate_two := v_candidate + GREATEST(COALESCE(v_schedule.min_days_between_samples, 14), 14);
        END IF;

        INSERT INTO sampling_calendar (
          organization_id,
          schedule_id,
          outfall_id,
          parameter_id,
          scheduled_date,
          window_start,
          window_end,
          status,
          dispatch_status,
          route_zone,
          default_assigned_to
        )
        VALUES (
          p_organization_id,
          v_schedule.id,
          v_schedule.outfall_id,
          v_schedule.parameter_id,
          v_candidate,
          v_candidate,
          v_candidate,
          'pending',
          'ready',
          v_schedule.route_zone,
          v_schedule.default_assigned_to
        )
        ON CONFLICT (schedule_id, scheduled_date) DO NOTHING;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_inserted := v_inserted + v_row_count;

        IF v_candidate_two <= v_month_end THEN
          INSERT INTO sampling_calendar (
            organization_id,
            schedule_id,
            outfall_id,
            parameter_id,
            scheduled_date,
            window_start,
            window_end,
            status,
            dispatch_status,
            route_zone,
            default_assigned_to
          )
          VALUES (
            p_organization_id,
            v_schedule.id,
            v_schedule.outfall_id,
            v_schedule.parameter_id,
            v_candidate_two,
            v_candidate_two,
            v_candidate_two,
            'pending',
            'ready',
            v_schedule.route_zone,
            v_schedule.default_assigned_to
          )
          ON CONFLICT (schedule_id, scheduled_date) DO NOTHING;

          GET DIAGNOSTICS v_row_count = ROW_COUNT;
          v_inserted := v_inserted + v_row_count;
        END IF;

      WHEN 'manual' THEN
        v_skipped := v_skipped + 1;
      WHEN 'rain_event' THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_skipped := v_skipped + 1;
    END CASE;
  END LOOP;

  PERFORM refresh_sampling_calendar_statuses(p_organization_id, CURRENT_DATE);

  RETURN jsonb_build_object(
    'generated_month', v_month_start,
    'generated_count', v_inserted,
    'skipped_schedule_count', v_skipped
  );
END;
$$;


ALTER FUNCTION "public"."generate_sampling_calendar"("p_month_start" "date", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_archive_batch_summary"("p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
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

  RETURN jsonb_build_object(
    'batch', to_jsonb(v_batch),
    'uploads', COALESCE((
      SELECT jsonb_agg(to_jsonb(cmu) ORDER BY cmu.created_at DESC)
      FROM public.cutover_matrix_uploads cmu
      WHERE cmu.batch_id = p_batch_id
    ), '[]'::jsonb),
    'manifest', COALESCE((
      SELECT jsonb_agg(to_jsonb(am) ORDER BY am.table_name)
      FROM public.archive_manifest am
      WHERE am.batch_id = p_batch_id
    ), '[]'::jsonb),
    'roster_counts', jsonb_build_object(
      'sites', (
        SELECT COUNT(DISTINCT site_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
      ),
      'permits', (
        SELECT COUNT(DISTINCT permit_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
          AND permit_id IS NOT NULL
      ),
      'outfalls', (
        SELECT COUNT(DISTINCT outfall_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
          AND outfall_id IS NOT NULL
      )
    )
  );
END;
$$;


ALTER FUNCTION "public"."get_archive_batch_summary"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_archive_table_preview"("p_batch_id" "uuid", "p_table_name" "text", "p_limit" integer DEFAULT 25) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
  v_rows jsonb;
  v_allowed_tables text[] := ARRAY[
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

  IF NOT (p_table_name = ANY (v_allowed_tables)) THEN
    RAISE EXCEPTION 'Unsupported archive table %', p_table_name;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (
       SELECT *
       FROM archive.%I
       WHERE cutover_batch_id = $1
       ORDER BY archived_at DESC
       LIMIT $2
     ) t',
    p_table_name
  )
  INTO v_rows
  USING p_batch_id, GREATEST(COALESCE(p_limit, 25), 1);

  RETURN jsonb_build_object(
    'table_name', p_table_name,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$_$;


ALTER FUNCTION "public"."get_archive_table_preview"("p_batch_id" "uuid", "p_table_name" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_audit_readiness_score"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_checklist_score numeric;
  v_doc_score numeric;
  v_evidence_score numeric;
  v_overall numeric;
  v_total_checklist_items integer;
  v_completed_checklist_items integer;
  v_total_docs integer;
  v_current_docs integer;
  v_total_obligations integer;
  v_evidenced_obligations integer;
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Checklist completion across active checklists
  SELECT
    COALESCE(SUM(total_items), 0),
    COALESCE(SUM(completed_items), 0)
  INTO v_total_checklist_items, v_completed_checklist_items
  FROM audit_checklists
  WHERE organization_id = p_org_id
    AND status IN ('active', 'in_progress');

  v_checklist_score := CASE WHEN v_total_checklist_items > 0
    THEN ROUND((v_completed_checklist_items::numeric / v_total_checklist_items) * 100, 1)
    ELSE 100 END;

  -- Document completeness
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_on_file AND is_current)
  INTO v_total_docs, v_current_docs
  FROM document_completeness
  WHERE organization_id = p_org_id;

  v_doc_score := CASE WHEN v_total_docs > 0
    THEN ROUND((v_current_docs::numeric / v_total_docs) * 100, 1)
    ELSE 100 END;

  -- Obligation evidence coverage
  SELECT COUNT(*)
  INTO v_total_obligations
  FROM consent_decree_obligations
  WHERE organization_id = p_org_id
    AND status = 'active';

  SELECT COUNT(DISTINCT oe.obligation_id)
  INTO v_evidenced_obligations
  FROM obligation_evidence oe
  JOIN consent_decree_obligations cdo ON cdo.id = oe.obligation_id
  WHERE oe.organization_id = p_org_id
    AND cdo.status = 'active'
    AND oe.verification_status IN ('verified', 'unverified');

  v_evidence_score := CASE WHEN v_total_obligations > 0
    THEN ROUND((v_evidenced_obligations::numeric / v_total_obligations) * 100, 1)
    ELSE 100 END;

  -- Weighted overall: 35% checklists, 35% documents, 30% evidence
  v_overall := ROUND(
    (v_checklist_score * 0.35) +
    (v_doc_score * 0.35) +
    (v_evidence_score * 0.30),
    1
  );

  RETURN jsonb_build_object(
    'overall_score', v_overall,
    'checklist_score', v_checklist_score,
    'checklist_total', v_total_checklist_items,
    'checklist_completed', v_completed_checklist_items,
    'document_score', v_doc_score,
    'document_total', v_total_docs,
    'document_current', v_current_docs,
    'evidence_score', v_evidence_score,
    'obligations_total', v_total_obligations,
    'obligations_evidenced', v_evidenced_obligations
  );
END;
$$;


ALTER FUNCTION "public"."get_audit_readiness_score"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_compliance_trend"("p_org_id" "uuid", "p_days" integer DEFAULT 30) RETURNS TABLE("snapshot_date" "date", "compliance_score" numeric, "sampling_compliance_pct" numeric, "exceedance_rate_pct" numeric, "open_violations" integer, "open_corrective_actions" integer, "open_work_orders" integer, "open_incidents" integer, "total_penalties" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    cs.snapshot_date,
    cs.compliance_score,
    cs.sampling_compliance_pct,
    cs.exceedance_rate_pct,
    cs.open_violations,
    cs.open_corrective_actions,
    cs.open_work_orders,
    cs.open_incidents,
    cs.total_penalties
  FROM compliance_snapshots cs
  WHERE cs.organization_id = p_org_id
    AND cs.snapshot_type = 'daily'
    AND cs.snapshot_date >= CURRENT_DATE - (p_days || ' days')::interval
  ORDER BY cs.snapshot_date ASC;
END;
$$;


ALTER FUNCTION "public"."get_compliance_trend"("p_org_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_echo_dmr_coverage"("p_site_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("permit_id" "uuid", "dmr_record_count" bigint, "last_synced_at" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    permit_row.id AS permit_id,
    COALESCE(coverage_row.dmr_record_count, 0)::bigint AS dmr_record_count,
    coverage_row.last_synced_at
  FROM public.npdes_permits AS permit_row
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS dmr_record_count,
      MAX(
        COALESCE(
          NULLIF(echo_json ->> 'last_synced_at', ''),
          NULLIF(echo_json ->> 'synced_at', ''),
          NULLIF(echo_json ->> 'sync_at', ''),
          NULLIF(echo_json ->> 'updated_at', ''),
          NULLIF(echo_json ->> 'created_at', '')
        )
      ) AS last_synced_at
    FROM (
      SELECT to_jsonb(echo_row) AS echo_json
      FROM public.external_echo_dmrs AS echo_row
    ) AS echo_json_rows
    WHERE
      (echo_json ->> 'permit_id') = permit_row.id::text
      OR (echo_json ->> 'npdes_permit_id') = permit_row.id::text
      OR (
        regexp_replace(
          UPPER(COALESCE(echo_json ->> 'npdes_id', echo_json ->> 'permit_number', echo_json ->> 'npdes_permit_number', '')),
          '[^A-Z0-9]',
          '',
          'g'
        ) = ANY (
          ARRAY[
            regexp_replace(UPPER(COALESCE(permit_row.permit_number, '')), '[^A-Z0-9]', '', 'g'),
            regexp_replace(UPPER(COALESCE(permit_row.metadata ->> 'federal_npdes_id_override', '')), '[^A-Z0-9]', '', 'g')
          ]
        )
        AND (
          COALESCE(permit_row.permit_number, '') <> ''
          OR COALESCE(permit_row.metadata ->> 'federal_npdes_id_override', '') <> ''
        )
      )
  ) AS coverage_row ON true
  WHERE
    (p_site_id IS NULL OR permit_row.site_id = p_site_id)
    AND (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.user_profiles AS profile_row
        WHERE profile_row.id = auth.uid()
          AND profile_row.is_active = true
          AND profile_row.organization_id = permit_row.organization_id
      )
    );
$$;


ALTER FUNCTION "public"."get_echo_dmr_coverage"("p_site_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_embedding_extracted_data"("p_queue_id" "uuid", "p_max_records" integer DEFAULT 20) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  SELECT
    CASE
      WHEN extracted_data IS NULL THEN NULL
      WHEN extracted_data->'records' IS NULL THEN extracted_data
      WHEN jsonb_array_length(extracted_data->'records') <= p_max_records THEN extracted_data
      ELSE (
        (extracted_data - 'records') ||
        jsonb_build_object(
          'records', (
            SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
            FROM (
              SELECT r
              FROM jsonb_array_elements(extracted_data->'records') AS r
              LIMIT p_max_records
            ) sub
          ),
          'records_truncated', true,
          'records_total', jsonb_array_length(extracted_data->'records')
        )
      )
    END
  FROM public.file_processing_queue
  WHERE id = p_queue_id;
$$;


ALTER FUNCTION "public"."get_embedding_extracted_data"("p_queue_id" "uuid", "p_max_records" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_equipment_due_calibration"("p_org_id" "uuid", "p_within_days" integer DEFAULT 14) RETURNS TABLE("equipment_id" "uuid", "equipment_name" "text", "equipment_type" "text", "serial_number" "text", "last_calibrated_at" timestamp with time zone, "next_calibration_due" "date", "days_until_due" integer, "assigned_to_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_org uuid;
BEGIN
  v_caller_org := get_user_org_id();

  -- Verify caller belongs to requested org
  IF p_org_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ec.id AS equipment_id,
    ec.name AS equipment_name,
    ec.equipment_type,
    ec.serial_number,
    cl.calibrated_at AS last_calibrated_at,
    cl.next_calibration_due,
    (cl.next_calibration_due - CURRENT_DATE)::integer AS days_until_due,
    COALESCE(up.first_name || ' ' || up.last_name, up.email) AS assigned_to_name
  FROM equipment_catalog ec
  LEFT JOIN LATERAL (
    SELECT cl2.calibrated_at, cl2.next_calibration_due
    FROM calibration_logs cl2
    WHERE cl2.equipment_id = ec.id
    ORDER BY cl2.calibrated_at DESC
    LIMIT 1
  ) cl ON true
  LEFT JOIN equipment_assignments ea
    ON ea.equipment_id = ec.id AND ea.returned_at IS NULL
  LEFT JOIN user_profiles up ON up.id = ea.assigned_to
  WHERE ec.organization_id = p_org_id
    AND ec.requires_calibration = true
    AND ec.is_active = true
    AND (
      cl.next_calibration_due IS NULL
      OR cl.next_calibration_due <= CURRENT_DATE + p_within_days
    );
END;
$$;


ALTER FUNCTION "public"."get_equipment_due_calibration"("p_org_id" "uuid", "p_within_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inbox_zero_stats"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'handled', COUNT(*) FILTER (WHERE action != 'pending'),
    'pending', COUNT(*) FILTER (WHERE action = 'pending'),
    'drafts_ready', COUNT(*) FILTER (WHERE draft_status = 'ready' AND action = 'pending'),
    'auto_sent', COUNT(*) FILTER (WHERE draft_status = 'auto_sent'),
    'noise_killed', (SELECT COUNT(*) FROM public.email_noise_rules WHERE hits > 0),
    'tier_1', COUNT(*) FILTER (WHERE tier = 1),
    'tier_2', COUNT(*) FILTER (WHERE tier = 2),
    'tier_3', COUNT(*) FILTER (WHERE tier = 3),
    'tier_4', COUNT(*) FILTER (WHERE tier = 4),
    'tier_5', COUNT(*) FILTER (WHERE tier = 5),
    'total_cost_cents', COALESCE(SUM(draft_cost_cents), 0),
    'total_tokens', COALESCE(SUM(draft_tokens_used), 0),
    'bb8_handled', COUNT(*) FILTER (WHERE assigned_agent_handle = 'bb8_inbox' AND action != 'pending'),
    'r2d2_handled', COUNT(*) FILTER (WHERE assigned_agent_handle = 'r2d2_inbox' AND action != 'pending')
  ) INTO result
  FROM public.email_triage
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND received_at >= p_date::TIMESTAMPTZ
    AND received_at < (p_date + 1)::TIMESTAMPTZ;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_inbox_zero_stats"("p_user_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rls_policy_summary"() RETURNS TABLE("tbl_name" "text", "policy_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT tablename::text, COUNT(*)::bigint
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
  ORDER BY tablename;
$$;


ALTER FUNCTION "public"."get_rls_policy_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unit_conversion"("p_parameter_id" "uuid", "p_from_unit" "text", "p_to_unit" "text") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  v_factor numeric;
BEGIN
  -- Return 1.0 if units match (case-insensitive)
  IF lower(trim(COALESCE(p_from_unit, ''))) = lower(trim(COALESCE(p_to_unit, ''))) THEN
    RETURN 1.0;
  END IF;

  -- Try parameter-specific conversion first
  SELECT conversion_factor INTO v_factor
  FROM public.unit_conversions
  WHERE parameter_id = p_parameter_id
    AND lower(trim(from_unit)) = lower(trim(COALESCE(p_from_unit, '')))
    AND lower(trim(to_unit)) = lower(trim(COALESCE(p_to_unit, '')));

  IF v_factor IS NOT NULL THEN
    RETURN v_factor;
  END IF;

  -- Try universal conversion (parameter_id IS NULL)
  SELECT conversion_factor INTO v_factor
  FROM public.unit_conversions
  WHERE parameter_id IS NULL
    AND lower(trim(from_unit)) = lower(trim(COALESCE(p_from_unit, '')))
    AND lower(trim(to_unit)) = lower(trim(COALESCE(p_to_unit, '')));

  IF v_factor IS NOT NULL THEN
    RETURN v_factor;
  END IF;

  -- No conversion found, return 1.0 (assume same unit)
  RETURN 1.0;
END;
$$;


ALTER FUNCTION "public"."get_unit_conversion"("p_parameter_id" "uuid", "p_from_unit" "text", "p_to_unit" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_unit_conversion"("p_parameter_id" "uuid", "p_from_unit" "text", "p_to_unit" "text") IS 'Lookup unit conversion factor from unit_conversions table. Returns 1.0 if units match or no conversion found.';



CREATE OR REPLACE FUNCTION "public"."get_user_parent_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT parent_id FROM organizations WHERE id = (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
$$;


ALTER FUNCTION "public"."get_user_parent_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."in_live_program_scope"("p_org_id" "uuid", "p_site_id" "uuid" DEFAULT NULL::"uuid", "p_permit_id" "uuid" DEFAULT NULL::"uuid", "p_outfall_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_site_id uuid := p_site_id;
  v_permit_id uuid := p_permit_id;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.live_program_roster lpr
    WHERE lpr.organization_id = p_org_id
  ) THEN
    RETURN true;
  END IF;

  IF v_permit_id IS NULL AND p_outfall_id IS NOT NULL THEN
    SELECT o.permit_id
    INTO v_permit_id
    FROM public.outfalls o
    WHERE o.id = p_outfall_id;
  END IF;

  IF v_site_id IS NULL AND v_permit_id IS NOT NULL THEN
    SELECT p.site_id
    INTO v_site_id
    FROM public.npdes_permits p
    WHERE p.id = v_permit_id;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.live_program_roster lpr
    WHERE lpr.organization_id = p_org_id
      AND (
        (p_outfall_id IS NOT NULL AND lpr.outfall_id = p_outfall_id)
        OR (
          v_permit_id IS NOT NULL
          AND lpr.permit_id = v_permit_id
          AND lpr.outfall_id IS NULL
        )
        OR (
          v_site_id IS NOT NULL
          AND lpr.site_id = v_site_id
          AND lpr.permit_id IS NULL
          AND lpr.outfall_id IS NULL
        )
      )
  );
END;
$$;


ALTER FUNCTION "public"."in_live_program_scope"("p_org_id" "uuid", "p_site_id" "uuid", "p_permit_id" "uuid", "p_outfall_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_template_run_count"("template_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE report_templates
  SET run_count = run_count + 1, last_run_at = now(), updated_at = now()
  WHERE id = template_id;
END;
$$;


ALTER FUNCTION "public"."increment_template_run_count"("template_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cutover_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "effective_at" timestamp with time zone NOT NULL,
    "executed_at" timestamp with time zone,
    "executed_by" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "writes_frozen" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "summary_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cutover_batches_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'ready'::"text", 'executing'::"text", 'executed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."cutover_batches" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_archive_batches"() RETURNS SETOF "public"."cutover_batches"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT *
  FROM public.cutover_batches
  WHERE organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
    AND status = 'executed'
  ORDER BY executed_at DESC NULLS LAST, created_at DESC;
$$;


ALTER FUNCTION "public"."list_archive_batches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_ca_signature_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Log responsible person signature change
  IF NEW.responsible_person_signed_at IS DISTINCT FROM OLD.responsible_person_signed_at THEN
    BEGIN
      INSERT INTO public.audit_log (
        user_id, organization_id, action, module, table_name, record_id,
        old_values, new_values, created_at
      ) VALUES (
        auth.uid(), NEW.organization_id, 'update', 'corrective_actions',
        'corrective_actions', NEW.id,
        jsonb_build_object('responsible_person_signed_at', OLD.responsible_person_signed_at),
        jsonb_build_object('responsible_person_id', NEW.responsible_person_id,
                           'responsible_person_signed_at', NEW.responsible_person_signed_at,
                           'signature_type', 'responsible'),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[CA Signature Audit] Failed to log responsible signature: %', SQLERRM;
    END;
  END IF;

  -- Log approver signature change
  IF NEW.approved_by_signed_at IS DISTINCT FROM OLD.approved_by_signed_at THEN
    BEGIN
      INSERT INTO public.audit_log (
        user_id, organization_id, action, module, table_name, record_id,
        old_values, new_values, created_at
      ) VALUES (
        auth.uid(), NEW.organization_id, 'update', 'corrective_actions',
        'corrective_actions', NEW.id,
        jsonb_build_object('approved_by_signed_at', OLD.approved_by_signed_at),
        jsonb_build_object('approved_by_id', NEW.approved_by_id,
                           'approved_by_signed_at', NEW.approved_by_signed_at,
                           'signature_type', 'approver'),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[CA Signature Audit] Failed to log approver signature: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_ca_signature_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_permit_limit_review_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  -- Get organization_id via outfall → site chain
  SELECT s.organization_id INTO v_org_id
  FROM public.outfalls o
  JOIN public.sites s ON s.id = o.site_id
  WHERE o.id = NEW.outfall_id;

  -- Get the user making the change (from NEW.reviewed_by or session user)
  v_user_id := COALESCE(NEW.reviewed_by, auth.uid());

  -- Log the review status change
  INSERT INTO public.audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    v_user_id,
    v_org_id,
    CASE
      WHEN OLD.review_status IS NULL THEN 'permit_limit_review_created'
      WHEN NEW.review_status = 'verified' THEN 'permit_limit_verified'
      WHEN NEW.review_status = 'disputed' THEN 'permit_limit_disputed'
      WHEN NEW.review_status = 'in_review' THEN 'permit_limit_review_started'
      ELSE 'permit_limit_review_updated'
    END,
    'compliance',
    'permit_limits',
    NEW.id,
    jsonb_build_object(
      'review_status', OLD.review_status,
      'reviewed_by', OLD.reviewed_by,
      'reviewed_at', OLD.reviewed_at,
      'review_notes', OLD.review_notes
    ),
    jsonb_build_object(
      'review_status', NEW.review_status,
      'reviewed_by', NEW.reviewed_by,
      'reviewed_at', NEW.reviewed_at,
      'review_notes', NEW.review_notes,
      'extraction_confidence', NEW.extraction_confidence,
      'extraction_source', NEW.extraction_source
    ),
    now()
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block the update (fail-safe)
    RAISE WARNING 'Failed to log permit_limit review change: %', SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_permit_limit_review_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_permit_limit_review_change"() IS 'Audit trail for permit limit verification workflow. Logs all review status transitions.';



CREATE OR REPLACE FUNCTION "public"."log_roadmap_sync_event"("p_direction" "text", "p_task_id" "text", "p_linear_issue_id" "text", "p_action" "text", "p_changed_fields" "jsonb" DEFAULT NULL::"jsonb", "p_error_message" "text" DEFAULT NULL::"text", "p_webhook_id" "text" DEFAULT NULL::"text", "p_actor" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  INSERT INTO public.roadmap_sync_events
    (direction, task_id, linear_issue_id, action, changed_fields, error_message, webhook_id, actor)
  VALUES
    (p_direction, p_task_id, p_linear_issue_id, p_action, p_changed_fields, p_error_message, p_webhook_id, p_actor);
$$;


ALTER FUNCTION "public"."log_roadmap_sync_event"("p_direction" "text", "p_task_id" "text", "p_linear_issue_id" "text", "p_action" "text", "p_changed_fields" "jsonb", "p_error_message" "text", "p_webhook_id" "text", "p_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_threshold" double precision DEFAULT 0.7, "match_count" integer DEFAULT 10, "filter_org_id" "uuid" DEFAULT NULL::"uuid", "filter_state" "text" DEFAULT NULL::"text", "filter_document_type" "text" DEFAULT NULL::"text", "filter_permit_number" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "document_id" "uuid", "chunk_index" integer, "chunk_text" "text", "source_page" integer, "source_section" "text", "document_type" "text", "state_code" "text", "permit_number" "text", "file_name" "text", "similarity" double precision)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'extensions', 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    dc.source_page,
    dc.source_section,
    dc.document_type,
    dc.state_code,
    dc.permit_number,
    dc.file_name,
    -- For normalized vectors: cosine_similarity = 1 - (L2^2 / 2)
    GREATEST(0, 1.0 - (power(dc.embedding <-> query_embedding, 2)) / 2.0)::float AS similarity
  FROM document_chunks dc
  WHERE
    (filter_org_id IS NULL OR dc.organization_id = filter_org_id)
    AND (dc.embedding <-> query_embedding) < sqrt(2.0 * (1.0 - match_threshold))
    AND (filter_state IS NULL OR dc.state_code = filter_state)
    AND (filter_document_type IS NULL OR dc.document_type = filter_document_type)
    AND (filter_permit_number IS NULL OR dc.permit_number = filter_permit_number)
  ORDER BY dc.embedding <-> query_embedding ASC
  LIMIT LEAST(match_count, 50);
END;
$$;


ALTER FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "filter_org_id" "uuid", "filter_state" "text", "filter_document_type" "text", "filter_permit_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_ca_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only fire when followup_assigned_to changes to a non-null value
  IF NEW.followup_assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if no change
  IF OLD IS NOT NULL AND OLD.followup_assigned_to = NEW.followup_assigned_to THEN
    RETURN NEW;
  END IF;

  PERFORM send_notification(
    NEW.followup_assigned_to,
    'corrective_action_assigned',
    'Corrective Action assigned to you: ' || NEW.title,
    format('Priority: %s | Due: %s | Step: %s',
           NEW.priority,
           COALESCE(NEW.due_date::text, 'No due date'),
           REPLACE(NEW.workflow_step, '_', ' ')),
    CASE NEW.priority
      WHEN 'critical' THEN 'critical'::notification_priority
      WHEN 'high' THEN 'urgent'::notification_priority
      ELSE 'warning'::notification_priority
    END,
    'corrective_action',
    NEW.id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_ca_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_ca_signature"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Responsible person just signed — notify assigned user
  IF OLD.responsible_person_signed_at IS NULL
     AND NEW.responsible_person_signed_at IS NOT NULL
     AND NEW.followup_assigned_to IS NOT NULL THEN
    PERFORM send_notification(
      NEW.followup_assigned_to,
      'corrective_action_due',
      format('CA "%s" signed by responsible person', NEW.title),
      'Responsible person has signed. Awaiting approver signature.',
      'info'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  -- Approver just signed — notify assigned user
  IF OLD.approved_by_signed_at IS NULL
     AND NEW.approved_by_signed_at IS NOT NULL
     AND NEW.followup_assigned_to IS NOT NULL THEN
    PERFORM send_notification(
      NEW.followup_assigned_to,
      'corrective_action_due',
      format('CA "%s" approved — ready for closure', NEW.title),
      'Both signatures captured. This corrective action can now be closed.',
      'info'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_ca_signature"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_ca_step_advanced"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only fire on step change
  IF OLD.workflow_step = NEW.workflow_step THEN
    RETURN NEW;
  END IF;

  -- Notify assigned user (if any)
  IF NEW.followup_assigned_to IS NOT NULL THEN
    PERFORM send_notification(
      NEW.followup_assigned_to,
      'corrective_action_due',
      format('CA "%s" advanced to %s', NEW.title, REPLACE(NEW.workflow_step, '_', ' ')),
      format('Previous step: %s | New step: %s | Status: %s',
             REPLACE(OLD.workflow_step, '_', ' '),
             REPLACE(NEW.workflow_step, '_', ' '),
             NEW.status),
      'info'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  -- If at verification or closure, notify responsible person
  IF NEW.workflow_step IN ('verification', 'closure') AND NEW.responsible_person_id IS NOT NULL THEN
    PERFORM send_notification(
      NEW.responsible_person_id,
      'corrective_action_due',
      format('CA "%s" needs your signature (%s step)', NEW.title, REPLACE(NEW.workflow_step, '_', ' ')),
      'Your signature is required to advance this corrective action.',
      'urgent'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_ca_step_advanced"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_dmr_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_permit_number text;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get permit number for notification title
  SELECT permit_number INTO v_permit_number
  FROM npdes_permits WHERE id = NEW.permit_id;

  -- Notify submitter when status changes to accepted/rejected
  IF NEW.status IN ('accepted', 'rejected') AND NEW.submitted_by IS NOT NULL THEN
    PERFORM send_notification(
      NEW.submitted_by,
      'upload_processed',
      format('DMR %s: %s (%s)', upper(NEW.status), COALESCE(v_permit_number, 'Unknown'), NEW.submission_type),
      format('Monitoring period: %s to %s',
             NEW.monitoring_period_start, NEW.monitoring_period_end),
      CASE NEW.status
        WHEN 'rejected' THEN 'urgent'::notification_priority
        ELSE 'info'::notification_priority
      END,
      'dmr_submission',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_dmr_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_legal_hold_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin_ids uuid[];
BEGIN
  -- Notify all admins and chief_counsel in the org
  SELECT array_agg(id) INTO v_admin_ids
  FROM user_profiles
  WHERE organization_id = NEW.organization_id
    AND role IN ('admin', 'chief_counsel', 'coo')
    AND is_active = true;

  IF v_admin_ids IS NOT NULL THEN
    FOR i IN 1..array_length(v_admin_ids, 1) LOOP
      PERFORM send_notification(
        v_admin_ids[i],
        'governance_issue_raised',
        CASE
          WHEN TG_OP = 'INSERT' THEN format('Legal Hold Placed on %s', NEW.entity_type)
          WHEN NOT NEW.is_active AND OLD.is_active THEN format('Legal Hold Released on %s', NEW.entity_type)
          ELSE format('Legal Hold Updated on %s', NEW.entity_type)
        END,
        COALESCE(
          CASE WHEN TG_OP = 'INSERT' THEN NEW.hold_reason ELSE NEW.release_reason END,
          'Legal hold status changed.'
        ),
        'urgent'::notification_priority,
        NEW.entity_type,
        NEW.entity_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_legal_hold_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_work_order_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    PERFORM send_notification(
      NEW.assigned_to,
      'corrective_action_assigned',
      format('Work Order Assigned: %s', NEW.title),
      COALESCE(NEW.description, 'A work order has been assigned to you.'),
      CASE NEW.priority
        WHEN 'critical' THEN 'urgent'::notification_priority
        WHEN 'high' THEN 'warning'::notification_priority
        ELSE 'info'::notification_priority
      END,
      'work_order',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_work_order_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."override_readiness_gate"("p_batch_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE sampling_route_batches
  SET readiness_gate_passed = true,
      readiness_override_by = auth.uid(),
      readiness_override_reason = p_reason,
      readiness_checked_at = now()
  WHERE id = p_batch_id;

  -- Audit log entry
  INSERT INTO audit_log (
    user_id, action, details, module, table_name, record_id
  ) VALUES (
    auth.uid(),
    'readiness_gate_override',
    jsonb_build_object('batch_id', p_batch_id, 'reason', p_reason),
    'field_ops',
    'sampling_route_batches',
    p_batch_id
  );
END;
$$;


ALTER FUNCTION "public"."override_readiness_gate"("p_batch_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patrol_connection_pool_stats"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  WITH stats AS (
    SELECT
      (
        SELECT count(*)::integer
        FROM pg_stat_activity
        WHERE datname = current_database()
      ) AS active_connections,
      current_setting('max_connections')::integer AS max_connections
  )
  SELECT jsonb_build_object(
    'active_connections', s.active_connections,
    'max_connections', s.max_connections,
    'utilization_pct',
      CASE
        WHEN s.max_connections > 0 THEN round(
          (s.active_connections::numeric / s.max_connections::numeric) * 100,
          2
        )
        ELSE 0::numeric
      END,
    'captured_at', to_jsonb(now() AT TIME ZONE 'utc')
  )
  FROM stats s;
$$;


ALTER FUNCTION "public"."patrol_connection_pool_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."patrol_connection_pool_stats"() IS 'Read-only connection pool utilization for Overwatch SUP-003. Callable by service_role only.';



CREATE OR REPLACE FUNCTION "public"."patrol_data_integrity_snapshot"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."patrol_data_integrity_snapshot"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."patrol_data_integrity_snapshot"("p_organization_id" "uuid") IS 'Read-only data-integrity probe snapshot for Overwatch SUP-007. Callable by service_role only.';



CREATE OR REPLACE FUNCTION "public"."prevent_exemption_audit_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.action IN ('precipitation_exemption_claimed', 'precipitation_exemption_approved', 'precipitation_exemption_denied') THEN
    RAISE EXCEPTION 'Cannot delete exemption audit records — immutable for compliance';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_exemption_audit_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_rain_event_audit_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.action IN (
    'rain_event_dismissed',
    'rain_event_activated',
    'rain_event_manual_declared',
    'rain_event_exemption_claimed',
    'rain_event_exemption_approved',
    'rain_event_exemption_denied'
  ) THEN
    RAISE EXCEPTION 'Cannot delete immutable rain event audit log entry (id: %, action: %)',
      OLD.id, OLD.action;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_rain_event_audit_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_cutover_batch"("p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.resolve_cutover_batch_rows(p_batch_id);
END;
$$;


ALTER FUNCTION "public"."preview_cutover_batch"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_live_compliance_snapshots"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_snapshot_id uuid;
BEGIN
  IF p_org_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.compliance_snapshots
  WHERE organization_id = p_org_id;

  SELECT public.generate_compliance_snapshot(p_org_id, CURRENT_DATE)
  INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;


ALTER FUNCTION "public"."rebuild_live_compliance_snapshots"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_sampling_route_batch_status"("p_route_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_has_in_progress boolean;
  v_has_pending boolean;
  v_has_exception boolean;
  v_has_any boolean;
BEGIN
  SELECT
    COUNT(*) > 0,
    bool_or(stop_status = 'in_progress'),
    bool_or(stop_status IN ('pending', 'dispatched')),
    bool_or(stop_status = 'exception')
  INTO v_has_any, v_has_in_progress, v_has_pending, v_has_exception
  FROM sampling_route_stops
  WHERE route_batch_id = p_route_batch_id;

  UPDATE sampling_route_batches
  SET route_status = CASE
        WHEN NOT COALESCE(v_has_any, false) THEN 'draft'
        WHEN COALESCE(v_has_in_progress, false) THEN 'in_progress'
        WHEN COALESCE(v_has_pending, false) THEN 'dispatched'
        WHEN COALESCE(v_has_exception, false) THEN 'exception'
        ELSE 'completed'
      END,
      updated_at = now()
  WHERE id = p_route_batch_id;
END;
$$;


ALTER FUNCTION "public"."recalculate_sampling_route_batch_status"("p_route_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_sampling_calendar_statuses"("p_organization_id" "uuid" DEFAULT "public"."get_user_org_id"(), "p_as_of" "date" DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE sampling_calendar
  SET status = CASE
        WHEN status = 'completed' THEN status
        WHEN status = 'skipped' THEN status
        WHEN scheduled_date < p_as_of THEN 'overdue'
        ELSE 'pending'
      END,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND status IN ('pending', 'overdue')
    AND dispatch_status <> 'completed';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;


ALTER FUNCTION "public"."refresh_sampling_calendar_statuses"("p_organization_id" "uuid", "p_as_of" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_cutover_batch_rows"("p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."resolve_cutover_batch_rows"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_follow_up_by_thread"("p_thread_key" "text", "p_from_email" "text", "p_resolution_email_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_thread_key IS NULL OR p_from_email IS NULL THEN
    RETURN jsonb_build_object('resolved_count', 0);
  END IF;

  UPDATE follow_ups
  SET
    status = 'resolved',
    resolved_at = NOW(),
    resolution_type = 'reply_received',
    resolution_email_id = p_resolution_email_id,
    updated_at = NOW()
  WHERE thread_key = p_thread_key
    AND LOWER(contact_email) = LOWER(p_from_email)
    AND status IN ('waiting', 'overdue');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'resolved_count', v_count,
    'thread_key', p_thread_key,
    'from_email', p_from_email
  );
END;
$$;


ALTER FUNCTION "public"."resolve_follow_up_by_thread"("p_thread_key" "text", "p_from_email" "text", "p_resolution_email_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_incident"("p_incident_id" "uuid", "p_resolution_notes" "text", "p_status" "public"."incident_status" DEFAULT 'closed'::"public"."incident_status") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor_name text;
  v_old_status text;
  v_caller_org uuid;
  v_incident_org uuid;
BEGIN
  v_caller_org := get_user_org_id();

  SELECT status::text, organization_id
  INTO v_old_status, v_incident_org
  FROM incidents WHERE id = p_incident_id;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Incident not found';
  END IF;

  IF v_incident_org != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(first_name || ' ' || last_name, email)
  INTO v_actor_name
  FROM user_profiles WHERE id = auth.uid();

  UPDATE incidents SET
    status = p_status,
    resolved_at = now(),
    resolved_by = auth.uid(),
    resolution_notes = p_resolution_notes,
    updated_at = now()
  WHERE id = p_incident_id;

  INSERT INTO incident_events (
    incident_id, event_type, actor_name, actor_user_id,
    old_value, new_value, notes
  ) VALUES (
    p_incident_id, 'resolved', v_actor_name, auth.uid(),
    v_old_status, p_status::text, p_resolution_notes
  );
END;
$$;


ALTER FUNCTION "public"."resolve_incident"("p_incident_id" "uuid", "p_resolution_notes" "text", "p_status" "public"."incident_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_parameter"("p_code" "text" DEFAULT NULL::"text", "p_alias" "text" DEFAULT NULL::"text", "p_state_code" "text" DEFAULT NULL::"text") RETURNS TABLE("parameter_id" "uuid", "canonical_name" "text", "resolution_method" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- 1. Try EPA parameter code map first (if code provided)
  IF p_code IS NOT NULL AND p_code != '' THEN
    RETURN QUERY
    SELECT m.parameter_id, p.name, 'epa_code_map'::text
    FROM epa_parameter_code_map m
    JOIN parameters p ON p.id = m.parameter_id
    WHERE m.epa_code = p_code
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;

    -- 2. Try STORET code on parameters table
    RETURN QUERY
    SELECT p.id, p.name, 'storet_code'::text
    FROM parameters p
    WHERE p.storet_code = p_code
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 3. Try text alias (if alias provided)
  IF p_alias IS NOT NULL AND p_alias != '' THEN
    -- State-specific alias first, then universal
    RETURN QUERY
    SELECT pa.parameter_id, p.name, 'alias'::text
    FROM parameter_aliases pa
    JOIN parameters p ON p.id = pa.parameter_id
    WHERE lower(pa.alias) = lower(p_alias)
      AND (pa.state_code = p_state_code OR pa.state_code IS NULL)
    ORDER BY pa.state_code NULLS LAST
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;

    -- 4. Try canonical name match
    RETURN QUERY
    SELECT p.id, p.name, 'canonical_name'::text
    FROM parameters p
    WHERE lower(p.name) = lower(p_alias)
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Nothing found — return empty result set
  RETURN;
END;
$$;


ALTER FUNCTION "public"."resolve_parameter"("p_code" "text", "p_alias" "text", "p_state_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resolve_parameter"("p_code" "text", "p_alias" "text", "p_state_code" "text") IS 'Unified parameter resolution: tries EPA code map, STORET code, alias table, then canonical name. Used by all Edge Function parsers.';



CREATE OR REPLACE FUNCTION "public"."restore_archive_batch"("p_batch_id" "uuid", "p_mode" "text" DEFAULT 'archive_only_preview'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
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
  v_columns text;
  v_restore_counts jsonb := '{}'::jsonb;
  v_count bigint;
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

  IF p_mode NOT IN ('archive_only_preview', 'merge_back') THEN
    RAISE EXCEPTION 'Unsupported restore mode %', p_mode;
  END IF;

  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM archive.%I WHERE cutover_batch_id = $1',
      target_table
    )
    INTO v_count
    USING p_batch_id;

    v_restore_counts := v_restore_counts || jsonb_build_object(target_table, COALESCE(v_count, 0));
  END LOOP;

  IF p_mode = 'merge_back' THEN
    FOREACH target_table IN ARRAY target_tables LOOP
      SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_columns
      FROM information_schema.columns
      WHERE table_schema = 'archive'
        AND table_name = target_table
        AND column_name NOT IN ('cutover_batch_id', 'archived_at');

      IF v_columns IS NULL THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        'INSERT INTO public.%I (%s)
         SELECT %s
         FROM archive.%I
         WHERE cutover_batch_id = $1
         ON CONFLICT (id) DO NOTHING',
        target_table,
        v_columns,
        v_columns,
        target_table
      )
      USING p_batch_id;
    END LOOP;

    RETURN jsonb_build_object(
      'mode', p_mode,
      'restored', true,
      'restore_counts', v_restore_counts
    );
  END IF;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'restored', false,
    'restore_counts', v_restore_counts
  );
END;
$_$;


ALTER FUNCTION "public"."restore_archive_batch"("p_batch_id" "uuid", "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_data_integrity_check"("p_org_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_check_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_passed integer := 0;
  v_warned integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
  v_count integer;
  v_start timestamptz := clock_timestamp();
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Create check record
  INSERT INTO data_integrity_checks (organization_id, run_by, status)
  VALUES (p_org_id, auth.uid(), 'running')
  RETURNING id INTO v_check_id;

  -- Check 1: Permits without sites
  SELECT COUNT(*) INTO v_count
  FROM npdes_permits WHERE organization_id = p_org_id AND site_id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Permits without sites', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Check 2: Outfalls without permits
  SELECT COUNT(*) INTO v_count
  FROM outfalls o
  LEFT JOIN npdes_permits p ON o.permit_id = p.id
  WHERE p.id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Orphaned outfalls', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 3: Exceedances without lab results
  SELECT COUNT(*) INTO v_count
  FROM exceedances e
  LEFT JOIN lab_results lr ON e.lab_result_id = lr.id
  WHERE e.organization_id = p_org_id AND lr.id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Exceedances without lab results', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 4: Corrective actions without source
  SELECT COUNT(*) INTO v_count
  FROM corrective_actions
  WHERE organization_id = p_org_id AND source_type IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'CAs without source type', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Check 5: Active users without org
  SELECT COUNT(*) INTO v_count
  FROM user_profiles
  WHERE organization_id IS NULL AND is_active = true;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Active users without organization', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 6: Sampling events without outfalls
  SELECT COUNT(*) INTO v_count
  FROM sampling_events se
  LEFT JOIN outfalls o ON se.outfall_id = o.id
  WHERE o.id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Orphaned sampling events', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 7: Violations without type
  SELECT COUNT(*) INTO v_count
  FROM compliance_violations
  WHERE organization_id = p_org_id AND violation_type IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Violations without type', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Check 8: Audit log gaps (last 24h)
  SELECT COUNT(*) INTO v_count
  FROM audit_log
  WHERE organization_id = p_org_id
    AND created_at >= now() - INTERVAL '24 hours';
  v_total := v_total + 1;
  IF v_count > 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Audit log activity (24h)', 'status', CASE WHEN v_count > 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Update check record
  UPDATE data_integrity_checks
  SET
    status = CASE
      WHEN v_failed > 0 THEN 'failed'
      WHEN v_warned > 0 THEN 'warnings'
      ELSE 'passed'
    END,
    checks_total = v_total,
    checks_passed = v_passed,
    checks_warned = v_warned,
    checks_failed = v_failed,
    results = v_results,
    completed_at = clock_timestamp(),
    duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::integer
  WHERE id = v_check_id;

  RETURN v_check_id;
END;
$$;


ALTER FUNCTION "public"."run_data_integrity_check"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_retention_policy_audit"("p_org_id" "uuid" DEFAULT "public"."get_user_org_id"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_caller_org uuid := get_user_org_id();
  v_policy RECORD;
  v_cutoff timestamptz;
  v_sql text;
  v_within integer := 0;
  v_outside integer := 0;
  v_on_hold integer := 0;
  v_updated integer := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_policy IN
    SELECT *
    FROM public.retention_policies
    WHERE organization_id = p_org_id
    ORDER BY record_type
  LOOP
    v_cutoff := now() - make_interval(years => GREATEST(v_policy.retention_years, 0));
    v_within := 0;
    v_outside := 0;
    v_on_hold := 0;

    CASE v_policy.record_type
      WHEN 'audit_log' THEN
        SELECT
          COUNT(*) FILTER (WHERE al.created_at >= v_cutoff),
          COUNT(*) FILTER (WHERE al.created_at < v_cutoff)
        INTO v_within, v_outside
        FROM public.audit_log al
        WHERE al.organization_id = p_org_id;

      WHEN 'calibration_records' THEN
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(cl.calibrated_at, cl.created_at) >= v_cutoff),
          COUNT(*) FILTER (WHERE COALESCE(cl.calibrated_at, cl.created_at) < v_cutoff)
        INTO v_within, v_outside
        FROM public.calibration_logs cl
        JOIN public.equipment_catalog ec ON ec.id = cl.equipment_id
        WHERE ec.organization_id = p_org_id;

      WHEN 'compliance_violations' THEN
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(cv.violation_date::timestamptz, cv.created_at) >= v_cutoff),
          COUNT(*) FILTER (WHERE COALESCE(cv.violation_date::timestamptz, cv.created_at) < v_cutoff)
        INTO v_within, v_outside
        FROM public.compliance_violations cv
        WHERE cv.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.compliance_violations cv ON cv.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'violation'
          AND lh.is_active = true
          AND cv.organization_id = p_org_id;

      WHEN 'corrective_actions' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(
              ca.closed_date::timestamptz,
              ca.completed_date::timestamptz,
              ca.date_received::timestamptz,
              ca.created_at
            ) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(
              ca.closed_date::timestamptz,
              ca.completed_date::timestamptz,
              ca.date_received::timestamptz,
              ca.created_at
            ) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.corrective_actions ca
        WHERE ca.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.corrective_actions ca ON ca.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'corrective_action'
          AND lh.is_active = true
          AND ca.organization_id = p_org_id;

      WHEN 'dmr_submissions' THEN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dmr_submissions'
            AND column_name = 'monitoring_period_end'
        ) THEN
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(ds.monitoring_period_end::timestamptz, ds.created_at) >= $1
              ),
              COUNT(*) FILTER (
                WHERE COALESCE(ds.monitoring_period_end::timestamptz, ds.created_at) < $1
              )
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        ELSIF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dmr_submissions'
            AND column_name = 'period_end'
        ) THEN
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_end::timestamptz, ds.created_at) >= $1
              ),
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_end::timestamptz, ds.created_at) < $1
              )
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        ELSIF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dmr_submissions'
            AND column_name = 'period_start'
        ) THEN
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_start::timestamptz, ds.created_at) >= $1
              ),
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_start::timestamptz, ds.created_at) < $1
              )
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        ELSE
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (WHERE ds.created_at >= $1),
              COUNT(*) FILTER (WHERE ds.created_at < $1)
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        END IF;

        EXECUTE v_sql
          INTO v_within, v_outside
          USING v_cutoff, p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.dmr_submissions ds ON ds.id = lh.entity_id
        JOIN public.npdes_permits p ON p.id = ds.permit_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'dmr_submission'
          AND lh.is_active = true
          AND p.organization_id = p_org_id;

      WHEN 'exceedances' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(
              e.detected_at,
              e.sample_date::timestamptz,
              e.created_at
            ) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(
              e.detected_at,
              e.sample_date::timestamptz,
              e.created_at
            ) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.exceedances e
        WHERE e.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.exceedances e ON e.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'exceedance'
          AND lh.is_active = true
          AND e.organization_id = p_org_id;

      WHEN 'field_visits' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(fv.completed_at, fv.started_at, fv.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(fv.completed_at, fv.started_at, fv.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.field_visits fv
        WHERE fv.organization_id = p_org_id;

      WHEN 'incidents' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(i.resolved_at, i.reported_at, i.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(i.resolved_at, i.reported_at, i.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.incidents i
        WHERE i.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.incidents i ON i.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'incident'
          AND lh.is_active = true
          AND i.organization_id = p_org_id;

      WHEN 'lab_results' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(lr.analyzed_date::timestamptz, lr.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(lr.analyzed_date::timestamptz, lr.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.lab_results lr
        JOIN public.sampling_events se ON se.id = lr.sampling_event_id
        JOIN public.outfalls o ON o.id = se.outfall_id
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = p_org_id;

      WHEN 'npdes_permits' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(
              p.expiration_date::timestamptz,
              p.effective_date::timestamptz,
              p.issued_date::timestamptz,
              p.created_at
            ) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(
              p.expiration_date::timestamptz,
              p.effective_date::timestamptz,
              p.issued_date::timestamptz,
              p.created_at
            ) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.npdes_permits p
        WHERE p.organization_id = p_org_id;

      WHEN 'sampling_events' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(se.sample_date::timestamptz, se.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(se.sample_date::timestamptz, se.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.sampling_events se
        JOIN public.outfalls o ON o.id = se.outfall_id
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = p_org_id;

      WHEN 'training_completions' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(tc.completed_at::timestamptz, tc.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(tc.completed_at::timestamptz, tc.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.training_completions tc
        WHERE tc.organization_id = p_org_id;

      ELSE
        v_within := 0;
        v_outside := 0;
        v_on_hold := 0;
    END CASE;

    UPDATE public.retention_policies
    SET
      last_audit_at = now(),
      records_within_policy = COALESCE(v_within, 0),
      records_outside_policy = COALESCE(v_outside, 0),
      records_on_hold = COALESCE(v_on_hold, 0)
    WHERE id = v_policy.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$_$;


ALTER FUNCTION "public"."run_retention_policy_audit"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_emails"("search_query" "text" DEFAULT NULL::"text", "p_account_id" "uuid" DEFAULT NULL::"uuid", "p_tiers" integer[] DEFAULT NULL::integer[], "p_actions" "text"[] DEFAULT NULL::"text"[], "p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO result
  FROM (
    SELECT
      e.id,
      e.account_id,
      e.graph_message_id,
      e.internet_message_id,
      e.conversation_id,
      e.subject,
      e.body_preview,
      e.body_text,
      e.body_html,
      e.sender_email,
      e.sender_name,
      e.to_recipients,
      e.cc_recipients,
      e.has_attachments,
      e.importance,
      e.is_read,
      e.is_draft,
      e.direction,
      e.received_at,
      e.categories,
      e.flag_status,
      e.created_at,
      jsonb_build_object(
        'id', t.id,
        'email_id', t.email_id,
        'account_id', t.account_id,
        'tier', t.tier,
        'tier_label', t.tier_label,
        'confidence', t.confidence,
        'classification_signals', t.classification_signals,
        'urgency_score', t.urgency_score,
        'sender_email', t.sender_email,
        'sender_name', t.sender_name,
        'subject', t.subject,
        'received_at', t.received_at,
        'draft_status', t.draft_status,
        'draft_body', t.draft_body,
        'draft_outlook_id', t.draft_outlook_id,
        'draft_model', t.draft_model,
        'draft_pattern', t.draft_pattern,
        'draft_confidence', t.draft_confidence,
        'draft_generated_at', t.draft_generated_at,
        'action', t.action,
        'action_at', t.action_at,
        'action_by', t.action_by,
        'snoozed_until', t.snoozed_until,
        'delegated_to', t.delegated_to,
        'delegation_rule_id', t.delegation_rule_id,
        'feedback', t.feedback,
        'feedback_notes', t.feedback_notes,
        'feedback_at', t.feedback_at,
        'thread_depth', t.thread_depth,
        'thread_summary', t.thread_summary,
        'created_at', t.created_at,
        'updated_at', t.updated_at,
        'alerted_at', t.alerted_at,
        'assigned_agent_handle', t.assigned_agent_handle,
        'agent_action_log', t.agent_action_log
      ) AS triage,
      jsonb_build_object(
        'id', e.account_id,
        'workspace_id', COALESCE(ic.workspace_id::text, ''),
        'email_address', COALESCE(ic.email_address, e.sender_email),
        'display_name', COALESCE(ic.connection_name, '')
      ) AS account
    FROM public.emails e
    LEFT JOIN public.email_triage t ON t.email_id = e.id
    LEFT JOIN public.integration_connections ic ON ic.id = e.connection_id
    WHERE
      (p_account_id IS NULL OR e.account_id = p_account_id)
      AND (p_tiers IS NULL OR t.tier = ANY(p_tiers))
      AND (p_actions IS NULL OR t.action = ANY(p_actions))
      AND (search_query IS NULL OR search_query = '' OR (
        e.subject ILIKE '%' || search_query || '%'
        OR e.sender_name ILIKE '%' || search_query || '%'
        OR e.sender_email ILIKE '%' || search_query || '%'
        OR e.body_preview ILIKE '%' || search_query || '%'
      ))
    ORDER BY e.received_at DESC
    LIMIT p_limit
  ) sub;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."search_emails"("search_query" "text", "p_account_id" "uuid", "p_tiers" integer[], "p_actions" "text"[], "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_tom_memory"("query_text" "text", "source_filter" "text" DEFAULT NULL::"text", "max_results" integer DEFAULT 20) RETURNS TABLE("mem_id" "uuid", "mem_source" "text", "mem_title" "text", "mem_body" "text", "mem_sender" "text", "mem_recipient" "text", "mem_timestamp" timestamp with time zone, "mem_metadata" "jsonb", "rank" real)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.source,
    m.title,
    m.body,
    m.sender,
    m.recipient,
    m.timestamp,
    m.metadata,
    ts_rank(m.fts_vector, websearch_to_tsquery('english', query_text)) AS rank
  FROM public.tom_memory m
  WHERE m.fts_vector @@ websearch_to_tsquery('english', query_text)
    AND (source_filter IS NULL OR m.source = source_filter)
  ORDER BY rank DESC, m.timestamp DESC
  LIMIT max_results;
END;
$$;


ALTER FUNCTION "public"."search_tom_memory"("query_text" "text", "source_filter" "text", "max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_tom_memory_exact"("query_text" "text", "source_filter" "text" DEFAULT NULL::"text", "max_results" integer DEFAULT 20) RETURNS TABLE("mem_id" "uuid", "mem_source" "text", "mem_title" "text", "mem_body" "text", "mem_sender" "text", "mem_recipient" "text", "mem_timestamp" timestamp with time zone, "mem_metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.source,
    m.title,
    m.body,
    m.sender,
    m.recipient,
    m.timestamp,
    m.metadata
  FROM public.tom_memory m
  WHERE (m.title ILIKE '%' || query_text || '%' OR m.body ILIKE '%' || query_text || '%')
    AND (source_filter IS NULL OR m.source = source_filter)
  ORDER BY m.timestamp DESC
  LIMIT max_results;
END;
$$;


ALTER FUNCTION "public"."search_tom_memory_exact"("query_text" "text", "source_filter" "text", "max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_notification"("p_recipient_id" "uuid", "p_event_type" "text", "p_title" "text", "p_body" "text" DEFAULT NULL::"text", "p_priority" "public"."notification_priority" DEFAULT 'info'::"public"."notification_priority", "p_entity_type" "text" DEFAULT NULL::"text", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
  v_notification_id uuid;
  v_prefs RECORD;
  v_channels text[] := ARRAY['in_app'];
BEGIN
  -- Resolve org from recipient
  SELECT organization_id INTO v_org_id
  FROM user_profiles WHERE id = p_recipient_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- Check user preferences for this event type
  SELECT * INTO v_prefs
  FROM notification_preferences
  WHERE user_id = p_recipient_id AND event_type = p_event_type;

  IF FOUND THEN
    v_channels := ARRAY['in_app'];
    IF v_prefs.email_enabled THEN v_channels := v_channels || 'email'; END IF;
    IF v_prefs.sms_enabled THEN v_channels := v_channels || 'sms'; END IF;
    -- If user disabled in_app, still include it for urgent+
    IF NOT v_prefs.in_app_enabled AND p_priority NOT IN ('urgent', 'critical', 'emergency') THEN
      v_channels := array_remove(v_channels, 'in_app');
    END IF;
  END IF;

  -- Always include all channels for emergency
  IF p_priority = 'emergency' THEN
    v_channels := ARRAY['in_app', 'email', 'sms'];
  END IF;

  INSERT INTO notifications (
    organization_id, recipient_id, event_type, priority,
    title, body, channels, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id, p_recipient_id, p_event_type, p_priority,
    p_title, p_body, v_channels, p_entity_type, p_entity_id, p_metadata
  ) RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;


ALTER FUNCTION "public"."send_notification"("p_recipient_id" "uuid", "p_event_type" "text", "p_title" "text", "p_body" "text", "p_priority" "public"."notification_priority", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_org_incident_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT COALESCE(MAX(incident_number), 0) + 1
  INTO NEW.incident_number
  FROM incidents
  WHERE organization_id = NEW.organization_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_org_incident_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_sampling_calendar_from_field_visit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_calendar_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sampling_calendar_id IS NOT NULL THEN
      UPDATE sampling_calendar
      SET current_field_visit_id = NULL,
          dispatch_status = CASE
            WHEN status IN ('completed', 'skipped') THEN dispatch_status
            WHEN scheduled_date < CURRENT_DATE THEN 'exception'
            ELSE 'ready'
          END,
          updated_at = now()
      WHERE id = OLD.sampling_calendar_id
        AND current_field_visit_id = OLD.id;
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.sampling_calendar_id IS NOT NULL
     AND OLD.sampling_calendar_id <> NEW.sampling_calendar_id THEN
    UPDATE sampling_calendar
    SET current_field_visit_id = NULL,
        dispatch_status = CASE
          WHEN status IN ('completed', 'skipped') THEN dispatch_status
          WHEN scheduled_date < CURRENT_DATE THEN 'exception'
          ELSE 'ready'
        END,
        updated_at = now()
    WHERE id = OLD.sampling_calendar_id
      AND current_field_visit_id = OLD.id;
  END IF;

  v_calendar_id := NEW.sampling_calendar_id;

  IF v_calendar_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE sampling_calendar sc
  SET current_field_visit_id = CASE WHEN NEW.visit_status = 'cancelled' THEN NULL ELSE NEW.id END,
      dispatch_status = CASE
        WHEN NEW.visit_status = 'assigned' THEN 'dispatched'
        WHEN NEW.visit_status = 'in_progress' THEN 'in_progress'
        WHEN NEW.visit_status = 'completed' AND NEW.outcome = 'access_issue' THEN 'exception'
        WHEN NEW.visit_status = 'completed' THEN 'completed'
        WHEN NEW.visit_status = 'cancelled' THEN 'ready'
        ELSE sc.dispatch_status
      END,
      status = CASE
        WHEN NEW.visit_status = 'completed' AND NEW.outcome = 'sample_collected' THEN 'completed'
        WHEN NEW.visit_status = 'completed' AND NEW.outcome = 'no_discharge' THEN 'skipped'
        WHEN NEW.visit_status = 'cancelled' AND sc.scheduled_date < CURRENT_DATE THEN 'overdue'
        WHEN NEW.visit_status = 'cancelled' THEN 'pending'
        ELSE sc.status
      END,
      sampling_event_id = CASE
        WHEN NEW.visit_status = 'completed' AND NEW.outcome = 'sample_collected' THEN NEW.linked_sampling_event_id
        ELSE sc.sampling_event_id
      END,
      skip_reason = CASE
        WHEN NEW.visit_status = 'completed' AND NEW.outcome = 'no_discharge' THEN COALESCE(sc.skip_reason, 'No discharge documented in field visit')
        WHEN NEW.visit_status = 'cancelled' THEN NULL
        ELSE sc.skip_reason
      END,
      updated_at = now()
  WHERE sc.id = v_calendar_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_sampling_calendar_from_field_visit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_sampling_route_batch_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_sampling_route_batch_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_sampling_route_stop_from_calendar"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_route_batch_id uuid;
BEGIN
  UPDATE sampling_route_stops
  SET stop_status = CASE
        WHEN NEW.dispatch_status = 'in_progress' THEN 'in_progress'
        WHEN NEW.dispatch_status = 'completed' THEN 'completed'
        WHEN NEW.dispatch_status = 'skipped' THEN 'skipped'
        WHEN NEW.dispatch_status = 'exception' THEN 'exception'
        WHEN NEW.dispatch_status = 'dispatched' OR NEW.current_field_visit_id IS NOT NULL THEN 'dispatched'
        ELSE 'pending'
      END,
      updated_at = now()
  WHERE calendar_id = NEW.id
  RETURNING route_batch_id INTO v_route_batch_id;

  IF v_route_batch_id IS NOT NULL THEN
    PERFORM recalculate_sampling_route_batch_status(v_route_batch_id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_sampling_route_stop_from_calendar"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "text" NOT NULL,
    "phase" integer NOT NULL,
    "section" "text" NOT NULL,
    "task_description" "text" NOT NULL,
    "owner_type" "text" NOT NULL,
    "assigned_to" "uuid",
    "depends_on" "text"[],
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "evidence_paths" "text"[],
    "notes" "text",
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "is_new_v3" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "answer_data" "jsonb" DEFAULT '{}'::"jsonb",
    "evidence_source" "jsonb" DEFAULT '{}'::"jsonb",
    "unblocks" "text"[] DEFAULT '{}'::"text"[],
    "updated_by" "uuid",
    "linear_issue_id" "text",
    "linear_issue_identifier" "text",
    "linear_url" "text",
    "linear_synced_at" timestamp with time zone,
    "linear_sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "linear_sync_error" "text",
    "linear_sync_attempt_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "roadmap_tasks_linear_sync_status_check" CHECK (("linear_sync_status" = ANY (ARRAY['pending'::"text", 'synced'::"text", 'error'::"text", 'skipped'::"text"]))),
    CONSTRAINT "roadmap_tasks_owner_type_check" CHECK (("owner_type" = ANY (ARRAY['you'::"text", 'tom'::"text", 'scc_mgmt'::"text", 'both'::"text", 'legal'::"text", 'software'::"text"]))),
    CONSTRAINT "roadmap_tasks_phase_check" CHECK ((("phase" >= 1) AND ("phase" <= 5))),
    CONSTRAINT "roadmap_tasks_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'blocked'::"text", 'complete'::"text", 'na'::"text"])))
);


ALTER TABLE "public"."roadmap_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."roadmap_tasks"."linear_issue_id" IS 'Linear internal UUID of the mirrored issue. Set by linear-import-roadmap.mjs and never changes after.';



COMMENT ON COLUMN "public"."roadmap_tasks"."linear_issue_identifier" IS 'Human-readable Linear key, e.g. SCC-123. Useful for cross-references.';



COMMENT ON COLUMN "public"."roadmap_tasks"."linear_url" IS 'Direct URL to the Linear issue, surfaced in the in-app Roadmap UI.';



COMMENT ON COLUMN "public"."roadmap_tasks"."linear_synced_at" IS 'Wall-clock timestamp of last successful sync to Linear. NULL means never synced.';



COMMENT ON COLUMN "public"."roadmap_tasks"."linear_sync_status" IS 'pending = needs push to Linear; synced = up to date; error = last attempt failed; skipped = sync disabled for this task.';



COMMENT ON COLUMN "public"."roadmap_tasks"."linear_sync_error" IS 'Last error message returned by Linear API. Cleared on successful sync.';



COMMENT ON COLUMN "public"."roadmap_tasks"."linear_sync_attempt_count" IS 'Number of consecutive failed sync attempts. Resets to 0 on success.';



CREATE OR REPLACE FUNCTION "public"."sync_status_from_linear"("p_task_id" "text", "p_new_status" "text", "p_actor" "text" DEFAULT 'linear-webhook'::"text", "p_webhook_id" "text" DEFAULT NULL::"text", "p_linear_issue_id" "text" DEFAULT NULL::"text") RETURNS "public"."roadmap_tasks"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_row public.roadmap_tasks;
  v_old_status text;
BEGIN
  -- Suppress the trigger's "mark pending" behavior for this transaction.
  PERFORM set_config('app.linear_webhook_writer', 'true', true);

  -- Read old status for the audit log
  SELECT status INTO v_old_status FROM public.roadmap_tasks WHERE task_id = p_task_id;
  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'No roadmap_task with task_id=%', p_task_id;
  END IF;

  -- Idempotency short-circuit: if Linear is telling us what's already true, no-op.
  IF v_old_status = p_new_status THEN
    SELECT * INTO v_row FROM public.roadmap_tasks WHERE task_id = p_task_id;
    INSERT INTO public.roadmap_sync_events(direction, task_id, linear_issue_id, action, changed_fields, webhook_id, actor)
    VALUES (
      'linear_to_supabase', p_task_id, p_linear_issue_id, 'skip',
      jsonb_build_object('reason', 'status_unchanged', 'status', p_new_status),
      p_webhook_id, p_actor
    );
    RETURN v_row;
  END IF;

  UPDATE public.roadmap_tasks
  SET status = p_new_status,
      linear_sync_status = 'synced',
      linear_synced_at = NOW(),
      linear_sync_error = NULL,
      linear_sync_attempt_count = 0,
      updated_at = NOW()
  WHERE task_id = p_task_id
  RETURNING * INTO v_row;

  INSERT INTO public.roadmap_sync_events(direction, task_id, linear_issue_id, action, changed_fields, webhook_id, actor)
  VALUES (
    'linear_to_supabase', p_task_id, p_linear_issue_id, 'update',
    jsonb_build_object('status', jsonb_build_object('from', v_old_status, 'to', p_new_status)),
    p_webhook_id, p_actor
  );

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."sync_status_from_linear"("p_task_id" "text", "p_new_status" "text", "p_actor" "text", "p_webhook_id" "text", "p_linear_issue_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_audit_checklist_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Recalculate checklist progress when items change
  UPDATE audit_checklists
  SET
    total_items = (SELECT COUNT(*) FROM audit_checklist_items WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id)),
    completed_items = (SELECT COUNT(*) FROM audit_checklist_items WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id) AND status IN ('complete', 'na')),
    updated_at = now()
  WHERE id = COALESCE(NEW.checklist_id, OLD.checklist_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_audit_checklist_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ca_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ca_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_dmr_submission_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_dmr_submission_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_field_ops_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_field_ops_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_generic_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_generic_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_go_live_checklist_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE go_live_checklists
  SET total_items = (
        SELECT count(*) FROM go_live_checklist_items
        WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id)
          AND status != 'na'
      ),
      completed_items = (
        SELECT count(*) FROM go_live_checklist_items
        WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id)
          AND status = 'passed'
      )
  WHERE id = COALESCE(NEW.checklist_id, OLD.checklist_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_go_live_checklist_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_governance_issue_status"("p_issue_id" "uuid", "p_current_status" "text", "p_final_disposition" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_actor_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_issue governance_issues%ROWTYPE;
  v_actor_name text := COALESCE(NULLIF(trim(p_actor_name), ''), 'System');
  v_event_type text;
BEGIN
  IF p_current_status NOT IN ('open', 'under_review', 'decision_recorded', 'closed') THEN
    RAISE EXCEPTION 'Invalid governance issue status: %', p_current_status;
  END IF;

  SELECT *
  INTO v_issue
  FROM governance_issues
  WHERE id = p_issue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Governance issue % was not found', p_issue_id;
  END IF;

  IF v_issue.organization_id <> get_user_org_id() THEN
    RAISE EXCEPTION 'Governance issue % is outside the active organization scope', p_issue_id;
  END IF;

  UPDATE governance_issues
  SET current_status = p_current_status,
      final_disposition = CASE
        WHEN p_current_status IN ('decision_recorded', 'closed') THEN p_final_disposition
        ELSE final_disposition
      END,
      final_decision_at = CASE
        WHEN p_current_status IN ('decision_recorded', 'closed') THEN now()
        ELSE final_decision_at
      END,
      closed_at = CASE
        WHEN p_current_status = 'closed' THEN now()
        ELSE closed_at
      END
  WHERE id = p_issue_id;

  v_event_type := CASE
    WHEN p_current_status IN ('decision_recorded', 'closed') THEN 'decision_recorded'
    ELSE 'status_changed'
  END;

  INSERT INTO governance_issue_events (
    governance_issue_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    notes,
    metadata
  )
  VALUES (
    p_issue_id,
    v_event_type,
    v_issue.current_status,
    p_current_status,
    auth.uid(),
    v_actor_name,
    COALESCE(p_notes, p_final_disposition),
    jsonb_build_object('final_disposition', p_final_disposition)
  );

  RETURN jsonb_build_object(
    'issue_id', p_issue_id,
    'status', p_current_status
  );
END;
$$;


ALTER FUNCTION "public"."update_governance_issue_status"("p_issue_id" "uuid", "p_current_status" "text", "p_final_disposition" "text", "p_notes" "text", "p_actor_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_scheduled_report_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_scheduled_report_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_work_order_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_work_order_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_dmr_submission"("p_submission_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_submission RECORD;
  v_caller_org uuid;
  v_total_items integer;
  v_missing_values integer;
  v_missing_nodi integer;
  v_exceedance_count integer;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_item RECORD;
BEGIN
  v_caller_org := get_user_org_id();

  SELECT * INTO v_submission
  FROM dmr_submissions WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_submission.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- If no discharge, only need NODI code
  IF v_submission.no_discharge THEN
    IF v_submission.nodi_code IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'type', 'missing_nodi',
        'message', 'No Discharge selected but no NODI code specified'
      );
    END IF;

    RETURN jsonb_build_object(
      'valid', jsonb_array_length(v_errors) = 0,
      'errors', v_errors,
      'warnings', v_warnings,
      'total_items', 0
    );
  END IF;

  -- Count totals
  SELECT COUNT(*) INTO v_total_items
  FROM dmr_line_items WHERE submission_id = p_submission_id;

  IF v_total_items = 0 THEN
    v_errors := v_errors || jsonb_build_object(
      'type', 'no_line_items',
      'message', 'No line items found. Run auto-populate from lab data first.'
    );
  END IF;

  -- Items with neither measured value nor NODI code
  SELECT COUNT(*) INTO v_missing_values
  FROM dmr_line_items
  WHERE submission_id = p_submission_id
    AND measured_value IS NULL
    AND nodi_code IS NULL;

  IF v_missing_values > 0 THEN
    v_errors := v_errors || jsonb_build_object(
      'type', 'missing_values',
      'message', format('%s line items have no measured value and no NODI code', v_missing_values),
      'count', v_missing_values
    );
  END IF;

  -- Exceedance warnings
  SELECT COUNT(*) INTO v_exceedance_count
  FROM dmr_line_items
  WHERE submission_id = p_submission_id
    AND is_exceedance = true;

  IF v_exceedance_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'exceedances',
      'message', format('%s parameter(s) exceed permit limits', v_exceedance_count),
      'count', v_exceedance_count
    );
  END IF;

  -- Check for items with NODI code 'N' (no data) — might need justification
  SELECT COUNT(*) INTO v_missing_nodi
  FROM dmr_line_items
  WHERE submission_id = p_submission_id
    AND nodi_code = 'N';

  IF v_missing_nodi > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'nodi_no_data',
      'message', format('%s items marked "No Data" — may require explanation', v_missing_nodi),
      'count', v_missing_nodi
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings,
    'total_items', v_total_items,
    'populated', v_total_items - v_missing_values,
    'missing', v_missing_values,
    'exceedances', v_exceedance_count
  );
END;
$$;


ALTER FUNCTION "public"."validate_dmr_submission"("p_submission_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_field_visit_relationships"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  permit_org_id uuid;
  outfall_permit_id uuid;
  assigned_org_id uuid;
  calendar_org_id uuid;
  calendar_outfall_id uuid;
  calendar_scheduled_date date;
BEGIN
  SELECT organization_id
  INTO permit_org_id
  FROM public.npdes_permits
  WHERE id = NEW.permit_id;

  IF permit_org_id IS NULL THEN
    RAISE EXCEPTION 'Permit % was not found', NEW.permit_id;
  END IF;

  IF permit_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Permit % does not belong to organization %', NEW.permit_id, NEW.organization_id;
  END IF;

  SELECT permit_id
  INTO outfall_permit_id
  FROM public.outfalls
  WHERE id = NEW.outfall_id;

  IF outfall_permit_id IS NULL THEN
    RAISE EXCEPTION 'Outfall % was not found', NEW.outfall_id;
  END IF;

  IF outfall_permit_id <> NEW.permit_id THEN
    RAISE EXCEPTION 'Outfall % does not belong to permit %', NEW.outfall_id, NEW.permit_id;
  END IF;

  SELECT organization_id
  INTO assigned_org_id
  FROM public.user_profiles
  WHERE id = NEW.assigned_to;

  IF assigned_org_id IS NULL THEN
    RAISE EXCEPTION 'Assigned user % was not found', NEW.assigned_to;
  END IF;

  IF assigned_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Assigned user % does not belong to organization %', NEW.assigned_to, NEW.organization_id;
  END IF;

  IF NEW.sampling_calendar_id IS NOT NULL THEN
    SELECT organization_id, outfall_id, scheduled_date
    INTO calendar_org_id, calendar_outfall_id, calendar_scheduled_date
    FROM public.sampling_calendar
    WHERE id = NEW.sampling_calendar_id;

    IF calendar_org_id IS NULL THEN
      RAISE EXCEPTION 'Sampling calendar item % was not found', NEW.sampling_calendar_id;
    END IF;

    IF calendar_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Sampling calendar item % does not belong to organization %', NEW.sampling_calendar_id, NEW.organization_id;
    END IF;

    IF calendar_outfall_id <> NEW.outfall_id THEN
      RAISE EXCEPTION 'Sampling calendar item % does not belong to outfall %', NEW.sampling_calendar_id, NEW.outfall_id;
    END IF;

    IF calendar_scheduled_date <> NEW.scheduled_date THEN
      RAISE EXCEPTION 'Field visit scheduled date % must match sampling calendar date %', NEW.scheduled_date, calendar_scheduled_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_field_visit_relationships"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."access_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "field_visit_id" "uuid" NOT NULL,
    "issue_type" "text" DEFAULT 'access_issue'::"text" NOT NULL,
    "obstruction_narrative" "text" NOT NULL,
    "contact_attempted" boolean DEFAULT false NOT NULL,
    "contact_name" "text",
    "contact_outcome" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "access_issues_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['access_issue'::"text", 'road_blocked'::"text", 'locked_gate'::"text", 'weather'::"text", 'safety_hazard'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."access_issues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "handle" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "workspace_id" "uuid",
    "is_shared" boolean DEFAULT false NOT NULL,
    "duty_mode" "text" DEFAULT 'event_driven'::"text" NOT NULL,
    "heartbeat_mins" integer DEFAULT 30 NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "avatar_url" "text",
    "discord_channel_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "action" "text" NOT NULL,
    "performed_by" "uuid" NOT NULL,
    "comments" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."approval_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive_manifest" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "table_name" "text" NOT NULL,
    "archived_row_count" integer DEFAULT 0 NOT NULL,
    "checksum_text" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."archive_manifest" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "item_text" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "assigned_to" "uuid",
    "due_date" "date",
    "evidence_notes" "text",
    "evidence_file_path" "text",
    "evidence_record_type" "text",
    "evidence_record_id" "uuid",
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_checklist_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'complete'::"text", 'na'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."audit_checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "audit_type" "text" NOT NULL,
    "description" "text",
    "target_date" "date",
    "state_code" "text",
    "site_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_items" integer DEFAULT 0 NOT NULL,
    "completed_items" integer DEFAULT 0 NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_checklists_audit_type_check" CHECK (("audit_type" = ANY (ARRAY['epa_inspection'::"text", 'state_dep_audit'::"text", 'consent_decree_review'::"text", 'internal_audit'::"text", 'msha_inspection'::"text", 'osmre_inspection'::"text", 'custom'::"text"]))),
    CONSTRAINT "audit_checklists_state_code_check" CHECK (("state_code" = ANY (ARRAY['AL'::"text", 'KY'::"text", 'TN'::"text", 'VA'::"text", 'WV'::"text"]))),
    CONSTRAINT "audit_checklists_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'in_progress'::"text", 'complete'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."audit_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "module" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auto_response_trust" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_email" "text" NOT NULL,
    "sender_domain" "text",
    "trust_level" "text" DEFAULT 'draft_only'::"text",
    "total_emails" integer DEFAULT 0,
    "total_auto_sent" integer DEFAULT 0,
    "rejection_count" integer DEFAULT 0,
    "last_rejection_at" timestamp with time zone,
    "promoted_at" timestamp with time zone,
    "promoted_by" "text" DEFAULT 'system'::"text",
    "workspace" "text",
    "user_id" "uuid" DEFAULT '3ccb8364-da19-482e-b3fa-6ee4ed40822b'::"uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "auto_response_trust_trust_level_check" CHECK (("trust_level" = ANY (ARRAY['draft_only'::"text", 'draft_and_stage'::"text", 'auto_send_ack'::"text", 'auto_send_all'::"text", 'full_autonomy'::"text"])))
);


ALTER TABLE "public"."auto_response_trust" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auto_send_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rule_name" "text" NOT NULL,
    "reply_pattern" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "min_confidence" double precision DEFAULT 0.95 NOT NULL,
    "sender_domain_whitelist" "text"[] DEFAULT '{}'::"text"[],
    "sender_email_whitelist" "text"[] DEFAULT '{}'::"text"[],
    "max_auto_sends_per_day" integer DEFAULT 5 NOT NULL,
    "require_thread_history" boolean DEFAULT true,
    "total_auto_sent" integer DEFAULT 0,
    "last_auto_sent_at" timestamp with time zone,
    CONSTRAINT "auto_send_rules_reply_pattern_check" CHECK (("reply_pattern" = ANY (ARRAY['acknowledgment'::"text", 'meeting'::"text", 'info_request'::"text", 'delegation'::"text", 'scheduling'::"text", 'followup'::"text", 'approval'::"text", 'vendor'::"text", 'client_update'::"text", 'escalation'::"text"])))
);


ALTER TABLE "public"."auto_send_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bottle_kit_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "kit_name" "text" NOT NULL,
    "parameter_group" "text",
    "bottle_count" integer DEFAULT 0 NOT NULL,
    "bottles_available" integer DEFAULT 0 NOT NULL,
    "preservative" "text",
    "container_type" "text" DEFAULT 'plastic'::"text",
    "volume_ml" integer,
    "last_restocked_at" timestamp with time zone,
    "restock_threshold" integer DEFAULT 10,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bottle_kit_inventory_container_type_check" CHECK (("container_type" = ANY (ARRAY['plastic'::"text", 'glass'::"text", 'amber_glass'::"text"])))
);


ALTER TABLE "public"."bottle_kit_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."build_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "priority" smallint DEFAULT 5 NOT NULL,
    "build_config" "jsonb" DEFAULT '{}'::"jsonb",
    "output" "jsonb" DEFAULT '{}'::"jsonb",
    "error" "text",
    "pr_url" "text",
    "logs_url" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "queued_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "build_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'in_progress'::"text", 'qa'::"text", 'deploy_ready'::"text", 'blocked'::"text", 'error'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."build_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calibration_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "calibrated_by" "uuid" NOT NULL,
    "calibrated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_calibration_due" "date",
    "result" "text" DEFAULT 'pass'::"text" NOT NULL,
    "standard_used" "text",
    "readings_before" "jsonb",
    "readings_after" "jsonb",
    "certificate_path" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "calibration_logs_result_check" CHECK (("result" = ANY (ARRAY['pass'::"text", 'fail'::"text", 'adjusted'::"text"])))
);


ALTER TABLE "public"."calibration_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_audits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid",
    "audit_type" "text" NOT NULL,
    "auditor_name" "text",
    "auditor_organization" "text",
    "audit_date" "date" NOT NULL,
    "report_date" "date",
    "findings_count" integer DEFAULT 0,
    "critical_findings" integer DEFAULT 0,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "document_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "compliance_audits_audit_type_check" CHECK (("audit_type" = ANY (ARRAY['internal'::"text", 'third_party_environmental'::"text", 'third_party_ems'::"text", 'treatment_system'::"text", 'regulatory_inspection'::"text"]))),
    CONSTRAINT "compliance_audits_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'draft_report'::"text", 'final_report'::"text", 'corrective_actions_pending'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."compliance_audits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "snapshot_type" "text" DEFAULT 'daily'::"text" NOT NULL,
    "total_permits" integer DEFAULT 0 NOT NULL,
    "active_permits" integer DEFAULT 0 NOT NULL,
    "total_outfalls" integer DEFAULT 0 NOT NULL,
    "active_outfalls" integer DEFAULT 0 NOT NULL,
    "sampling_events_due" integer DEFAULT 0 NOT NULL,
    "sampling_events_completed" integer DEFAULT 0 NOT NULL,
    "sampling_compliance_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "total_exceedances" integer DEFAULT 0 NOT NULL,
    "open_exceedances" integer DEFAULT 0 NOT NULL,
    "exceedance_rate_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "total_violations" integer DEFAULT 0 NOT NULL,
    "open_violations" integer DEFAULT 0 NOT NULL,
    "critical_violations" integer DEFAULT 0 NOT NULL,
    "total_corrective_actions" integer DEFAULT 0 NOT NULL,
    "open_corrective_actions" integer DEFAULT 0 NOT NULL,
    "overdue_corrective_actions" integer DEFAULT 0 NOT NULL,
    "avg_ca_closure_days" numeric(5,1),
    "total_work_orders" integer DEFAULT 0 NOT NULL,
    "open_work_orders" integer DEFAULT 0 NOT NULL,
    "overdue_work_orders" integer DEFAULT 0 NOT NULL,
    "dmr_submissions_due" integer DEFAULT 0 NOT NULL,
    "dmr_submissions_completed" integer DEFAULT 0 NOT NULL,
    "dmr_submission_rate_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "total_incidents" integer DEFAULT 0 NOT NULL,
    "open_incidents" integer DEFAULT 0 NOT NULL,
    "total_penalties" numeric DEFAULT 0 NOT NULL,
    "compliance_score" numeric(5,2) DEFAULT 0 NOT NULL,
    "state_breakdown" "jsonb",
    "generated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "compliance_snapshots_snapshot_type_check" CHECK (("snapshot_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."compliance_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_violations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "exceedance_id" "uuid",
    "incident_id" "uuid",
    "corrective_action_id" "uuid",
    "site_id" "uuid",
    "permit_id" "uuid",
    "outfall_id" "uuid",
    "violation_type" "text" NOT NULL,
    "violation_date" "date" NOT NULL,
    "discovery_date" "date",
    "parameter_id" "uuid",
    "measured_value" numeric,
    "limit_value" numeric,
    "unit" "text",
    "exceedance_pct" numeric,
    "severity" "text" DEFAULT 'minor'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "root_cause" "text",
    "root_cause_category" "text",
    "estimated_penalty" numeric,
    "actual_penalty" numeric,
    "penalty_paid_date" "date",
    "decree_paragraphs" "text"[],
    "regulatory_agency" "text",
    "state_code" "text",
    "resolution_notes" "text",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "compliance_violations_root_cause_category_check" CHECK (("root_cause_category" = ANY (ARRAY['equipment_failure'::"text", 'human_error'::"text", 'process_failure'::"text", 'weather_event'::"text", 'design_deficiency'::"text", 'training_gap'::"text", 'maintenance_lapse'::"text", 'external_factor'::"text", 'unknown'::"text", 'other'::"text"]))),
    CONSTRAINT "compliance_violations_severity_check" CHECK (("severity" = ANY (ARRAY['minor'::"text", 'moderate'::"text", 'major'::"text", 'critical'::"text"]))),
    CONSTRAINT "compliance_violations_state_code_check" CHECK (("state_code" = ANY (ARRAY['AL'::"text", 'KY'::"text", 'TN'::"text", 'VA'::"text", 'WV'::"text"]))),
    CONSTRAINT "compliance_violations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'under_investigation'::"text", 'reported'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "compliance_violations_violation_type_check" CHECK (("violation_type" = ANY (ARRAY['permit_exceedance'::"text", 'reporting_failure'::"text", 'monitoring_failure'::"text", 'discharge_violation'::"text", 'bmp_failure'::"text", 'consent_decree_violation'::"text", 'spill'::"text", 'unauthorized_discharge'::"text", 'recordkeeping'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."compliance_violations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conditional_exemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "exemption_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "trigger_conditions" "jsonb" NOT NULL,
    "effect_type" "text" NOT NULL,
    "effect_details" "jsonb" NOT NULL,
    "applies_to_outfalls" "text"[],
    "documentation_required" boolean DEFAULT true NOT NULL,
    "documentation_notes" "text",
    "notification_hours" integer,
    "notification_type" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conditional_exemptions_effect_type_check" CHECK (("effect_type" = ANY (ARRAY['waive_limit'::"text", 'change_limit'::"text", 'change_limit_table'::"text", 'require_documentation'::"text"])))
);


ALTER TABLE "public"."conditional_exemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consent_decree_obligations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paragraph_number" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "obligation_type" "text" NOT NULL,
    "frequency" "text",
    "initial_due_date" "date",
    "next_due_date" "date",
    "responsible_role" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "evidence_document_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completion_date" "date",
    "days_at_risk" integer GENERATED ALWAYS AS ("public"."calculate_days_at_risk"("next_due_date", "completion_date")) STORED,
    "penalty_tier" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("public"."calculate_days_at_risk"("next_due_date", "completion_date") = 0) THEN 'none'::"text"
    WHEN (("public"."calculate_days_at_risk"("next_due_date", "completion_date") >= 1) AND ("public"."calculate_days_at_risk"("next_due_date", "completion_date") <= 14)) THEN 'tier_1'::"text"
    WHEN (("public"."calculate_days_at_risk"("next_due_date", "completion_date") >= 15) AND ("public"."calculate_days_at_risk"("next_due_date", "completion_date") <= 30)) THEN 'tier_2'::"text"
    WHEN ("public"."calculate_days_at_risk"("next_due_date", "completion_date") > 30) THEN 'tier_3'::"text"
    ELSE 'none'::"text"
END) STORED,
    "accrued_penalty" numeric GENERATED ALWAYS AS ("public"."calculate_stipulated_penalty"("obligation_type", "public"."calculate_days_at_risk"("next_due_date", "completion_date"))) STORED,
    CONSTRAINT "consent_decree_obligations_obligation_type_check" CHECK (("obligation_type" = ANY (ARRAY['conditional'::"text", 'one_time'::"text", 'ongoing'::"text", 'recurring'::"text", 'ems_audit'::"text", 'treatment_inspection'::"text", 'database_maintenance'::"text", 'dmr_submission'::"text", 'quarterly_report'::"text", 'wet_report'::"text", 'biological_survey'::"text"]))),
    CONSTRAINT "consent_decree_obligations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'overdue'::"text", 'waived'::"text", 'modified'::"text"])))
);


ALTER TABLE "public"."consent_decree_obligations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email_addresses" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "name" "text" NOT NULL,
    "company" "text",
    "urgency_boost" integer DEFAULT 0,
    "relationship_tier" "text",
    "workspace" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contacts_relationship_tier_check" CHECK (("relationship_tier" = ANY (ARRAY['vip'::"text", 'important'::"text", 'regular'::"text", 'low'::"text"]))),
    CONSTRAINT "contacts_workspace_check" CHECK (("workspace" = ANY (ARRAY['lewis-insurance'::"text", 'redex'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."corrective_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "npdes_permit_id" "uuid",
    "site_id" "uuid",
    "smcra_permit_number" "text",
    "county" "text",
    "state" "text",
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "date_issued" "date",
    "date_received" "date",
    "issuing_person" "text",
    "issuing_agency" "text",
    "issued_to" "text",
    "regulation_cited" "text",
    "followup_assigned_to" "uuid",
    "due_date" "date",
    "contributing_factors" "text",
    "root_cause" "text",
    "immediate_mitigation" "text",
    "action_taken" "text",
    "preventive_action" "text",
    "documents_requiring_revision" "text",
    "completed_date" "date",
    "effectiveness_assessment" "text",
    "verified_by" "text",
    "verified_date" "date",
    "workflow_step" "text" DEFAULT 'identification'::"text" NOT NULL,
    "workflow_step_due_date" "date",
    "workflow_step_completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "responsible_person_id" "uuid",
    "responsible_person_signed_at" timestamp with time zone,
    "approved_by_id" "uuid",
    "approved_by_signed_at" timestamp with time zone,
    "generated_pdf_path" "text",
    "generated_pdf_at" timestamp with time zone,
    "closed_date" "date",
    "closed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "classification_level" "public"."record_classification" DEFAULT 'compliance_sensitive'::"public"."record_classification" NOT NULL,
    CONSTRAINT "chk_dual_signature_different_users" CHECK ((("responsible_person_id" IS NULL) OR ("approved_by_id" IS NULL) OR ("responsible_person_id" <> "approved_by_id"))),
    CONSTRAINT "corrective_actions_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "corrective_actions_source_type_check" CHECK (("source_type" = ANY (ARRAY['exceedance'::"text", 'enforcement'::"text", 'audit'::"text", 'inspection'::"text", 'manual'::"text", 'incident'::"text"]))),
    CONSTRAINT "corrective_actions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'completed'::"text", 'verified'::"text", 'closed'::"text"]))),
    CONSTRAINT "corrective_actions_workflow_step_check" CHECK (("workflow_step" = ANY (ARRAY['identification'::"text", 'root_cause_analysis'::"text", 'corrective_action_plan'::"text", 'preventive_action'::"text", 'implementation'::"text", 'verification'::"text", 'closure'::"text"])))
);


ALTER TABLE "public"."corrective_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."corrective_actions" IS 'EMS Document 2015-013 digital replacement - 7-step workflow for compliance issues';



COMMENT ON COLUMN "public"."corrective_actions"."source_id" IS 'Polymorphic FK: exceedances.id if source_type=exceedance, enforcement_actions.id if source_type=enforcement, NULL otherwise';



COMMENT ON COLUMN "public"."corrective_actions"."workflow_step" IS '7-step EMS workflow: identification → root_cause_analysis → corrective_action_plan → preventive_action → implementation → verification → closure';



COMMENT ON COLUMN "public"."corrective_actions"."classification_level" IS 'Phase 2 record classification. CAs default to compliance_sensitive.';



CREATE TABLE IF NOT EXISTS "public"."cutover_matrix_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "upload_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "row_number" integer NOT NULL,
    "state_code" "text",
    "site_name" "text",
    "permit_number" "text",
    "outfall_number" "text",
    "external_npdes_id" "text",
    "facility_name" "text",
    "mine_id" "text",
    "disposition" "text" NOT NULL,
    "notes" "text",
    "raw_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_site_id" "uuid",
    "resolved_permit_id" "uuid",
    "resolved_outfall_id" "uuid",
    "resolution_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolution_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cutover_matrix_rows_disposition_check" CHECK (("disposition" = ANY (ARRAY['live'::"text", 'archive'::"text", 'exclude'::"text"]))),
    CONSTRAINT "cutover_matrix_rows_resolution_status_check" CHECK (("resolution_status" = ANY (ARRAY['pending'::"text", 'matched'::"text", 'unresolved'::"text", 'ambiguous'::"text", 'excluded'::"text"])))
);


ALTER TABLE "public"."cutover_matrix_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cutover_matrix_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size_bytes" bigint,
    "file_format" "text" DEFAULT 'xlsx'::"text" NOT NULL,
    "uploaded_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "parsed_row_count" integer DEFAULT 0 NOT NULL,
    "resolution_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cutover_matrix_uploads_file_format_check" CHECK (("file_format" = ANY (ARRAY['xlsx'::"text", 'csv'::"text"])))
);


ALTER TABLE "public"."cutover_matrix_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_readiness_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "checklist_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "tablet_charged" boolean,
    "gps_functional" boolean,
    "meter_calibrated" boolean,
    "cooler_prepared" boolean,
    "bottles_sufficient" boolean,
    "vehicle_inspected" boolean,
    "ppe_available" boolean,
    "all_passed" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_readiness_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "field_name" "text" NOT NULL,
    "original_value" "jsonb" NOT NULL,
    "proposed_value" "jsonb" NOT NULL,
    "justification" "text" NOT NULL,
    "supporting_evidence_path" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "reviewed_by" "uuid",
    "review_comment" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_corrections_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['lab_result'::"text", 'permit_limit'::"text", 'dmr_line_item'::"text", 'exceedance'::"text"]))),
    CONSTRAINT "data_corrections_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."data_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid",
    "import_type" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text",
    "file_size_bytes" bigint,
    "file_hash" "text",
    "total_rows" integer,
    "rows_imported" integer,
    "rows_rejected" integer,
    "rows_duplicate" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_log" "jsonb",
    "imported_by" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "can_rollback" boolean DEFAULT true,
    "rolled_back_at" timestamp with time zone,
    "rolled_back_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_imports_import_type_check" CHECK (("import_type" = ANY (ARRAY['lab_results'::"text", 'field_data'::"text", 'dmr_data'::"text", 'permit_data'::"text", 'historical_data'::"text", 'correction'::"text"]))),
    CONSTRAINT "data_imports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'completed_with_errors'::"text", 'failed'::"text", 'rolled_back'::"text"])))
);


ALTER TABLE "public"."data_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_integrity_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "run_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "checks_total" integer DEFAULT 0 NOT NULL,
    "checks_passed" integer DEFAULT 0 NOT NULL,
    "checks_warned" integer DEFAULT 0 NOT NULL,
    "checks_failed" integer DEFAULT 0 NOT NULL,
    "results" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "run_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_integrity_checks_run_type_check" CHECK (("run_type" = ANY (ARRAY['manual'::"text", 'scheduled'::"text", 'startup'::"text"]))),
    CONSTRAINT "data_integrity_checks_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'passed'::"text", 'warnings'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."data_integrity_checks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deployment_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "stage_name" "text" NOT NULL,
    "stage_order" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "deployed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deployment_stages_stage_name_check" CHECK (("stage_name" = ANY (ARRAY['dev'::"text", 'staging'::"text", 'canary'::"text", 'production'::"text"]))),
    CONSTRAINT "deployment_stages_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'passed'::"text", 'failed'::"text", 'rolled_back'::"text"])))
);


ALTER TABLE "public"."deployment_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digest_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "digest_type" "text" NOT NULL,
    "digest_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "item_count" integer DEFAULT 0 NOT NULL,
    "telegram_message_id" "text",
    "stats" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "digest_deliveries_digest_type_check" CHECK (("digest_type" = ANY (ARRAY['morning'::"text", 'midday'::"text", 'evening'::"text"])))
);


ALTER TABLE "public"."digest_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digest_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "triage_id" "uuid" NOT NULL,
    "email_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "urgency_score" integer DEFAULT 0 NOT NULL,
    "tier" integer NOT NULL,
    "tier_label" "text" NOT NULL,
    "digest_window" "text" NOT NULL,
    "telegram_sent" boolean DEFAULT false,
    "telegram_sent_at" timestamp with time zone,
    "telegram_message_id" "text",
    "sender_email" "text" NOT NULL,
    "sender_name" "text",
    "subject" "text" NOT NULL,
    "draft_status" "text" DEFAULT 'none'::"text",
    CONSTRAINT "digest_queue_digest_window_check" CHECK (("digest_window" = ANY (ARRAY['immediate'::"text", 'fast_track'::"text", 'batch'::"text", 'daily'::"text"])))
);


ALTER TABLE "public"."digest_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discrepancy_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "npdes_id" "text",
    "mine_id" "text",
    "source" "text" NOT NULL,
    "discrepancy_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "monitoring_period_start" "date",
    "monitoring_period_end" "date",
    "description" "text" NOT NULL,
    "internal_value" "text",
    "external_value" "text",
    "internal_source_table" "text",
    "internal_source_id" "uuid",
    "external_source_id" "uuid",
    "detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "dismiss_reason" "text",
    "escalated_to" "uuid",
    "escalated_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurrence_count" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "chk_dr_severity" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "chk_dr_source" CHECK (("source" = ANY (ARRAY['echo'::"text", 'msha'::"text"]))),
    CONSTRAINT "chk_dr_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'dismissed'::"text", 'escalated'::"text", 'resolved'::"text"]))),
    CONSTRAINT "chk_dr_type" CHECK (("discrepancy_type" = ANY (ARRAY['missing_internal'::"text", 'missing_external'::"text", 'value_mismatch'::"text", 'status_mismatch'::"text"])))
);


ALTER TABLE "public"."discrepancy_reviews" OWNER TO "postgres";


COMMENT ON COLUMN "public"."discrepancy_reviews"."reviewed_by" IS 'User ID that resolved or dismissed the discrepancy review record.';



CREATE TABLE IF NOT EXISTS "public"."dmr_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dmr_submission_id" "uuid" NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "parameter_id" "uuid" NOT NULL,
    "quantity_avg" numeric,
    "quantity_max" numeric,
    "quantity_min" numeric,
    "quantity_units" "text",
    "concentration_avg" numeric,
    "concentration_max" numeric,
    "concentration_min" numeric,
    "concentration_units" "text",
    "number_of_exceedances" integer DEFAULT 0,
    "number_of_samples" integer DEFAULT 0,
    "monitoring_frequency" "text",
    "sample_type" "text",
    "no_discharge" boolean DEFAULT false,
    "no_data_reason" "text",
    "below_detection_method" "text",
    "exemption_applied" boolean DEFAULT false,
    "exemption_id" "uuid",
    "exemption_notes" "text",
    "permit_limit_avg" numeric,
    "permit_limit_max" numeric,
    "permit_limit_min" numeric,
    "is_exceedance" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dmr_line_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dmr_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "reporting_period_start" "date" NOT NULL,
    "reporting_period_end" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "submitted_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "submitted_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "document_id" "uuid",
    "submission_method" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submission_system" "text",
    "confirmation_number" "text",
    "reporting_frequency" "text" DEFAULT 'monthly'::"text",
    CONSTRAINT "dmr_submissions_reporting_frequency_check" CHECK (("reporting_frequency" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"]))),
    CONSTRAINT "dmr_submissions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_review'::"text", 'approved'::"text", 'submitted'::"text", 'rejected'::"text", 'overdue'::"text"]))),
    CONSTRAINT "dmr_submissions_submission_method_check" CHECK (("submission_method" = ANY (ARRAY['netdmr'::"text", 'paper'::"text", 'state_portal'::"text"])))
);


ALTER TABLE "public"."dmr_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "queue_entry_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "chunk_index" integer NOT NULL,
    "chunk_text" "text" NOT NULL,
    "chunk_chars" integer,
    "source_page" integer DEFAULT 0 NOT NULL,
    "source_section" "text",
    "document_type" "text",
    "state_code" "text",
    "permit_number" "text",
    "site_id" "uuid",
    "file_name" "text",
    "embedding" "extensions"."vector"(384),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_completeness" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "is_on_file" boolean DEFAULT false NOT NULL,
    "is_current" boolean DEFAULT false NOT NULL,
    "file_path" "text",
    "last_updated" "date",
    "expiry_date" "date",
    "notes" "text",
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "document_completeness_document_type_check" CHECK (("document_type" = ANY (ARRAY['permit_copy'::"text", 'dmr_current'::"text", 'dmr_archive'::"text", 'sampling_schedule'::"text", 'outfall_map'::"text", 'site_map'::"text", 'om_manual'::"text", 'spcc_plan'::"text", 'swppp'::"text", 'training_records'::"text", 'inspection_logs'::"text", 'monitoring_data'::"text", 'corrective_action_log'::"text", 'annual_report'::"text", 'discharge_log'::"text", 'chain_of_custody'::"text", 'lab_certifications'::"text", 'calibration_records'::"text", 'emergency_plan'::"text", 'consent_decree_copy'::"text"])))
);


ALTER TABLE "public"."document_completeness" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text",
    "file_size_bytes" bigint,
    "mime_type" "text",
    "module" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "organization_id" "uuid",
    "site_id" "uuid",
    "state_id" "uuid",
    "effective_date" "date",
    "expiration_date" "date",
    "uploaded_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "documents_module_check" CHECK (("module" = ANY (ARRAY['environmental'::"text", 'safety'::"text", 'workforce'::"text", 'contractor'::"text", 'fleet'::"text", 'production'::"text", 'legal'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_delegation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rule_name" "text" NOT NULL,
    "delegate_name" "text" NOT NULL,
    "delegate_email" "text",
    "keyword_patterns" "text"[] DEFAULT '{}'::"text"[],
    "sender_patterns" "text"[] DEFAULT '{}'::"text"[],
    "project_patterns" "text"[] DEFAULT '{}'::"text"[],
    "tier_filter" integer[],
    "instruction_template" "text" NOT NULL,
    "forward_email" boolean DEFAULT true,
    "reply_to_sender" boolean DEFAULT true,
    "reply_template" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "priority" integer DEFAULT 100,
    "max_delegations_per_day" integer DEFAULT 20,
    "total_delegated" integer DEFAULT 0,
    "last_delegated_at" timestamp with time zone
);


ALTER TABLE "public"."email_delegation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "triage_id" "uuid" NOT NULL,
    "email_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reply_pattern" "text" NOT NULL,
    "pattern_confidence" double precision DEFAULT 0.0 NOT NULL,
    "draft_body" "text" NOT NULL,
    "draft_subject" "text",
    "draft_outlook_id" "text",
    "status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "model" "text" DEFAULT 'claude-sonnet-4-20250514'::"text" NOT NULL,
    "tokens_used" integer DEFAULT 0,
    "cost_cents" double precision DEFAULT 0.0,
    "generation_time_ms" integer,
    "thread_context_used" boolean DEFAULT false,
    "voice_profile_used" "text",
    "brain_context_used" boolean DEFAULT false,
    "action_at" timestamp with time zone,
    "action_by" "text",
    "edited_body" "text",
    "rejection_reason" "text",
    "auto_send_eligible" boolean DEFAULT false,
    "auto_send_rule_id" "uuid",
    "auto_send_blocked_reason" "text",
    CONSTRAINT "email_drafts_pattern_confidence_check" CHECK ((("pattern_confidence" >= (0.0)::double precision) AND ("pattern_confidence" <= (1.0)::double precision))),
    CONSTRAINT "email_drafts_reply_pattern_check" CHECK (("reply_pattern" = ANY (ARRAY['acknowledgment'::"text", 'meeting'::"text", 'info_request'::"text", 'delegation'::"text", 'scheduling'::"text", 'followup'::"text", 'approval'::"text", 'vendor'::"text", 'client_update'::"text", 'escalation'::"text"]))),
    CONSTRAINT "email_drafts_status_check" CHECK (("status" = ANY (ARRAY['generating'::"text", 'pending_review'::"text", 'approved'::"text", 'edited'::"text", 'sent'::"text", 'rejected'::"text", 'auto_sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."email_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_intel" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_id" "uuid",
    "sender_email" "text" NOT NULL,
    "sender_name" "text",
    "subject" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "text",
    "urgency" "text" DEFAULT 'normal'::"text",
    "sentiment" "text",
    "raw_body" "text",
    "has_attachments" boolean DEFAULT false,
    "attachment_count" integer DEFAULT 0,
    "ai_model" "text" DEFAULT 'claude-sonnet-4-20250514'::"text",
    "ai_tokens_used" integer DEFAULT 0,
    "processed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_intel_sentiment_check" CHECK (("sentiment" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text", 'urgent'::"text"]))),
    CONSTRAINT "email_intel_urgency_check" CHECK (("urgency" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."email_intel" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_intel_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intel_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "url" "text",
    "file_name" "text",
    "file_path" "text",
    "file_size_bytes" bigint,
    "mime_type" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'new'::"text",
    "due_date" "date",
    "assigned_to" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_intel_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['task'::"text", 'note'::"text", 'link'::"text", 'document'::"text"]))),
    CONSTRAINT "email_intel_items_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "email_intel_items_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'in_progress'::"text", 'done'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."email_intel_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_noise_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_name" "text" NOT NULL,
    "rule_type" "text" NOT NULL,
    "match_value" "text" NOT NULL,
    "action" "text" NOT NULL,
    "workspace" "text",
    "hits" integer DEFAULT 0,
    "last_hit_at" timestamp with time zone,
    "enabled" boolean DEFAULT true,
    "created_by" "text" DEFAULT 'system'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT '3ccb8364-da19-482e-b3fa-6ee4ed40822b'::"uuid",
    "account_id" "uuid",
    CONSTRAINT "email_noise_rules_action_check" CHECK (("action" = ANY (ARRAY['auto_archive'::"text", 'auto_delete_mark'::"text", 'auto_read'::"text", 'auto_archive_and_read'::"text", 'block'::"text"]))),
    CONSTRAINT "email_noise_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['sender_domain'::"text", 'sender_email'::"text", 'subject_pattern'::"text", 'header_pattern'::"text", 'body_pattern'::"text", 'combo'::"text"]))),
    CONSTRAINT "email_noise_rules_workspace_check" CHECK (("workspace" = ANY (ARRAY['lewis-insurance'::"text", 'redex'::"text", 'all'::"text"])))
);


ALTER TABLE "public"."email_noise_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_sender_trust" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_email" "text" NOT NULL,
    "trust_level" integer DEFAULT 0 NOT NULL,
    "total_emails" integer DEFAULT 0 NOT NULL,
    "approvals_without_edit" integer DEFAULT 0 NOT NULL,
    "account_id" "uuid",
    "workspace" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_sender_trust_trust_level_check" CHECK ((("trust_level" >= 0) AND ("trust_level" <= 4)))
);


ALTER TABLE "public"."email_sender_trust" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_sync_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "uuid",
    "folder_id" "text" DEFAULT 'inbox'::"text",
    "delta_link" "text",
    "last_sync_at" timestamp with time zone,
    "emails_synced" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_triage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "connection_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tier" integer NOT NULL,
    "tier_label" "text" NOT NULL,
    "confidence" double precision DEFAULT 0.0 NOT NULL,
    "classification_signals" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "urgency_score" integer DEFAULT 0,
    "sender_email" "text" NOT NULL,
    "sender_name" "text",
    "subject" "text" NOT NULL,
    "thread_key" "text",
    "received_at" timestamp with time zone NOT NULL,
    "has_attachments" boolean DEFAULT false,
    "draft_status" "text" DEFAULT 'none'::"text",
    "draft_body" "text",
    "draft_outlook_id" "text",
    "draft_model" "text",
    "draft_pattern" "text",
    "draft_confidence" double precision,
    "draft_generated_at" timestamp with time zone,
    "draft_tokens_used" integer,
    "draft_cost_cents" double precision,
    "action" "text" DEFAULT 'pending'::"text",
    "action_at" timestamp with time zone,
    "action_by" "text" DEFAULT 'system'::"text",
    "snoozed_until" timestamp with time zone,
    "delegated_to" "text",
    "delegation_rule_id" "uuid",
    "feedback" "text",
    "feedback_notes" "text",
    "feedback_at" timestamp with time zone,
    "thread_depth" integer DEFAULT 0,
    "thread_summary" "text",
    "thread_decisions" "jsonb" DEFAULT '[]'::"jsonb",
    "thread_open_questions" "jsonb" DEFAULT '[]'::"jsonb",
    "thread_participants" "jsonb" DEFAULT '[]'::"jsonb",
    "thread_summarized_at" timestamp with time zone,
    "alerted_at" timestamp with time zone,
    "assigned_agent_id" "uuid",
    "assigned_agent_handle" "text",
    "agent_action_log" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "email_triage_action_check" CHECK (("action" = ANY (ARRAY['pending'::"text", 'draft_sent'::"text", 'draft_edited_sent'::"text", 'archived'::"text", 'snoozed'::"text", 'delegated'::"text", 'ignored'::"text", 'manual'::"text", 'replied'::"text"]))),
    CONSTRAINT "email_triage_draft_status_check" CHECK (("draft_status" = ANY (ARRAY['none'::"text", 'generating'::"text", 'ready'::"text", 'edited'::"text", 'sent'::"text", 'skipped'::"text", 'auto_sent'::"text"]))),
    CONSTRAINT "email_triage_feedback_check" CHECK (("feedback" = ANY (ARRAY['correct'::"text", 'wrong_tier'::"text", 'wrong_draft'::"text", 'not_helpful'::"text"]))),
    CONSTRAINT "email_triage_tier_check" CHECK ((("tier" >= 1) AND ("tier" <= 5)))
);


ALTER TABLE "public"."email_triage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_triage_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_classify" boolean DEFAULT true,
    "auto_draft_tiers" integer[] DEFAULT '{1,2}'::integer[],
    "auto_archive_tiers" integer[] DEFAULT '{4}'::integer[],
    "auto_tag_tiers" integer[] DEFAULT '{5}'::integer[],
    "newsletter_senders" "text"[] DEFAULT '{}'::"text"[],
    "marketing_senders" "text"[] DEFAULT '{}'::"text"[],
    "always_draft_senders" "text"[] DEFAULT '{}'::"text"[],
    "morning_digest_enabled" boolean DEFAULT true,
    "morning_digest_time" time without time zone DEFAULT '07:30:00'::time without time zone,
    "midday_digest_enabled" boolean DEFAULT true,
    "midday_digest_time" time without time zone DEFAULT '12:00:00'::time without time zone,
    "evening_digest_enabled" boolean DEFAULT true,
    "evening_digest_time" time without time zone DEFAULT '17:00:00'::time without time zone,
    "weekly_digest_enabled" boolean DEFAULT true,
    "weekly_digest_day" integer DEFAULT 1,
    "suppress_individual_for_digest" boolean DEFAULT true,
    "digest_timezone" "text" DEFAULT 'America/New_York'::"text",
    "max_drafts_per_day" integer DEFAULT 30,
    "max_cost_cents_per_day" integer DEFAULT 200
);


ALTER TABLE "public"."email_triage_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_voice_profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_type" "text" NOT NULL,
    "match_value" "text",
    "greeting_patterns" "text"[] DEFAULT '{}'::"text"[],
    "signoff_patterns" "text"[] DEFAULT '{}'::"text"[],
    "formality_level" "text",
    "avg_response_length" integer,
    "common_phrases" "text"[] DEFAULT '{}'::"text"[],
    "tone_keywords" "text"[] DEFAULT '{}'::"text"[],
    "prompt_template" "text" NOT NULL,
    "sample_count" integer DEFAULT 0,
    "last_analyzed_at" timestamp with time zone,
    CONSTRAINT "email_voice_profile_formality_level_check" CHECK (("formality_level" = ANY (ARRAY['casual'::"text", 'neutral'::"text", 'formal'::"text"]))),
    CONSTRAINT "email_voice_profile_profile_type_check" CHECK (("profile_type" = ANY (ARRAY['global'::"text", 'domain'::"text", 'contact'::"text"])))
);


ALTER TABLE "public"."email_voice_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_watch_senders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_address" "text" NOT NULL,
    "display_name" "text",
    "company" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_watch_senders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_whitelist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_type" "text" NOT NULL,
    "match_value" "text" NOT NULL,
    "label" "text",
    "workspace" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_whitelist_match_type_check" CHECK (("match_type" = ANY (ARRAY['domain'::"text", 'email'::"text"])))
);


ALTER TABLE "public"."email_whitelist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "connection_id" "uuid",
    "graph_message_id" "text",
    "internet_message_id" "text",
    "conversation_id" "text",
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body_preview" "text",
    "body_text" "text",
    "body_html" "text",
    "sender_email" "text" NOT NULL,
    "sender_name" "text",
    "to_recipients" "jsonb" DEFAULT '[]'::"jsonb",
    "cc_recipients" "jsonb" DEFAULT '[]'::"jsonb",
    "has_attachments" boolean DEFAULT false,
    "importance" "text" DEFAULT 'normal'::"text",
    "is_read" boolean DEFAULT false,
    "is_draft" boolean DEFAULT false,
    "direction" "text" DEFAULT 'inbound'::"text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[],
    "flag_status" "text",
    "thread_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "emails_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "emails_importance_check" CHECK (("importance" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "contact_name" "text" NOT NULL,
    "contact_role" "text" NOT NULL,
    "organization_name" "text",
    "phone_primary" "text",
    "phone_secondary" "text",
    "email" "text",
    "availability" "text" DEFAULT '24/7'::"text",
    "availability_notes" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "state_code" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "emergency_contacts_availability_check" CHECK (("availability" = ANY (ARRAY['24/7'::"text", 'business_hours'::"text", 'on_call'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "emergency_contacts_contact_role_check" CHECK (("contact_role" = ANY (ARRAY['epa_coordinator'::"text", 'state_dep_contact'::"text", 'legal_counsel'::"text", 'environmental_consultant'::"text", 'lab_contact'::"text", 'contractor'::"text", 'site_manager'::"text", 'safety_officer'::"text", 'emergency_responder'::"text", 'regulatory_liaison'::"text", 'media_contact'::"text", 'other'::"text"]))),
    CONSTRAINT "emergency_contacts_state_code_check" CHECK (("state_code" = ANY (ARRAY['AL'::"text", 'KY'::"text", 'TN'::"text", 'VA'::"text", 'WV'::"text"])))
);


ALTER TABLE "public"."emergency_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "incident_type" "text" NOT NULL,
    "severity_level" "text" DEFAULT 'all'::"text" NOT NULL,
    "description" "text",
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notification_chain" "jsonb",
    "responsible_roles" "text"[],
    "decree_paragraphs" "text"[],
    "regulatory_requirements" "text",
    "reporting_deadlines" "text",
    "state_code" "text",
    "site_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_reviewed_at" timestamp with time zone,
    "last_reviewed_by" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "emergency_procedures_incident_type_check" CHECK (("incident_type" = ANY (ARRAY['spill'::"text", 'unauthorized_discharge'::"text", 'equipment_failure'::"text", 'sampling_failure'::"text", 'data_loss'::"text", 'permit_exceedance'::"text", 'weather_event'::"text", 'site_emergency'::"text", 'regulatory_inspection'::"text", 'media_inquiry'::"text", 'other'::"text"]))),
    CONSTRAINT "emergency_procedures_severity_level_check" CHECK (("severity_level" = ANY (ARRAY['all'::"text", 'minor'::"text", 'moderate'::"text", 'major'::"text", 'critical'::"text"]))),
    CONSTRAINT "emergency_procedures_state_code_check" CHECK (("state_code" = ANY (ARRAY['AL'::"text", 'KY'::"text", 'TN'::"text", 'VA'::"text", 'WV'::"text"])))
);


ALTER TABLE "public"."emergency_procedures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enforcement_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "state_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "reference_number" "text",
    "issued_date" "date",
    "issuing_agency" "text",
    "description" "text",
    "related_permit_id" "uuid",
    "related_outfall_id" "uuid",
    "penalty_amount" numeric(12,2),
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "response_due_date" "date",
    "response_date" "date",
    "resolution_notes" "text",
    "resolved_date" "date",
    "document_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "enforcement_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['notice_of_violation'::"text", 'notice_of_exceedance'::"text", 'notice_of_non_compliance'::"text", 'notice_of_suspension'::"text", 'notice_to_comply'::"text", 'cessation_order'::"text", 'consent_order'::"text", 'show_cause_order'::"text", 'case_order'::"text", 'complaint_investigation'::"text", 'pattern_of_violation'::"text", 'bond_forfeiture'::"text", 'penalty'::"text", 'other'::"text"]))),
    CONSTRAINT "enforcement_actions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'under_review'::"text", 'response_submitted'::"text", 'resolved'::"text", 'appealed'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."enforcement_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."epa_parameter_code_map" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "epa_code" "text" NOT NULL,
    "epa_description" "text",
    "parameter_id" "uuid",
    "is_primary" boolean DEFAULT false NOT NULL,
    "echo_record_count" integer DEFAULT 0,
    "mapping_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."epa_parameter_code_map" OWNER TO "postgres";


COMMENT ON TABLE "public"."epa_parameter_code_map" IS 'Maps EPA STORET parameter codes from ECHO/DMR data to canonical parameters. Handles many-to-one (e.g., 01045+00980 both map to Iron Total).';



CREATE TABLE IF NOT EXISTS "public"."equipment_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "assigned_to" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "returned_at" timestamp with time zone,
    "condition_on_assign" "text" DEFAULT 'good'::"text",
    "condition_on_return" "text",
    "notes" "text",
    CONSTRAINT "equipment_assignments_condition_on_assign_check" CHECK (("condition_on_assign" = ANY (ARRAY['good'::"text", 'fair'::"text", 'needs_repair'::"text"]))),
    CONSTRAINT "equipment_assignments_condition_on_return_check" CHECK ((("condition_on_return" IS NULL) OR ("condition_on_return" = ANY (ARRAY['good'::"text", 'fair'::"text", 'needs_repair'::"text", 'damaged'::"text"]))))
);


ALTER TABLE "public"."equipment_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "equipment_type" "text" NOT NULL,
    "serial_number" "text",
    "model" "text",
    "manufacturer" "text",
    "purchase_date" "date",
    "warranty_expires" "date",
    "requires_calibration" boolean DEFAULT false NOT NULL,
    "calibration_interval_days" integer,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_catalog_equipment_type_check" CHECK (("equipment_type" = ANY (ARRAY['tablet'::"text", 'meter'::"text", 'gps'::"text", 'cooler'::"text", 'vehicle'::"text", 'probe'::"text", 'sampler'::"text", 'other'::"text"]))),
    CONSTRAINT "equipment_catalog_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'assigned'::"text", 'maintenance'::"text", 'retired'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."equipment_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalation_chain_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chain_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "owner_name" "text" NOT NULL,
    "owner_role" "text" NOT NULL,
    "owner_user_id" "uuid",
    "sla_hours" integer DEFAULT 24 NOT NULL,
    "auto_escalate" boolean DEFAULT true NOT NULL,
    "notification_channels" "text"[] DEFAULT '{in_app,email}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "escalation_chain_steps_step_number_check" CHECK ((("step_number" >= 1) AND ("step_number" <= 10)))
);


ALTER TABLE "public"."escalation_chain_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalation_chains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "chain_type" "text" DEFAULT 'operational'::"text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "escalation_chains_chain_type_check" CHECK (("chain_type" = ANY (ARRAY['operational'::"text", 'compliance'::"text"])))
);


ALTER TABLE "public"."escalation_chains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exceedances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lab_result_id" "uuid" NOT NULL,
    "permit_limit_id" "uuid" NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "parameter_id" "uuid" NOT NULL,
    "result_value" numeric NOT NULL,
    "limit_value" numeric NOT NULL,
    "limit_type" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "exceedance_pct" numeric,
    "sample_date" "date" NOT NULL,
    "severity" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "resolution_notes" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "narrative_cause" "text",
    "narrative_corrective_action" "text",
    "narrative_prevention" "text",
    "narrative_timeline" "text",
    "is_reportable" boolean DEFAULT true,
    "exemption_applied" boolean DEFAULT false,
    "exemption_id" "uuid",
    "cd_attachment_reference" "text",
    "organization_id" "uuid",
    "corrective_action_id" "uuid",
    "detected_at" timestamp with time zone DEFAULT "now"(),
    "resolved_by" "uuid",
    "result_unit" "text",
    "limit_unit" "text",
    "classification_level" "public"."record_classification" DEFAULT 'compliance_sensitive'::"public"."record_classification" NOT NULL,
    CONSTRAINT "exceedances_severity_check" CHECK (("severity" = ANY (ARRAY['minor'::"text", 'moderate'::"text", 'major'::"text", 'critical'::"text"]))),
    CONSTRAINT "exceedances_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'investigating'::"text", 'corrective_action'::"text", 'resolved'::"text", 'reported'::"text"])))
);


ALTER TABLE "public"."exceedances" OWNER TO "postgres";


COMMENT ON TABLE "public"."exceedances" IS 'Auto-detected permit limit violations. Extended for real-time monitoring dashboard.';



COMMENT ON COLUMN "public"."exceedances"."severity" IS 'Calculated: minor (<10%), moderate (10-50%), major (50-100%), critical (>100%)';



COMMENT ON COLUMN "public"."exceedances"."organization_id" IS 'Organization owning this exceedance, used for RLS scoping';



COMMENT ON COLUMN "public"."exceedances"."corrective_action_id" IS 'Link to auto-created corrective action';



COMMENT ON COLUMN "public"."exceedances"."detected_at" IS 'Timestamp when exceedance was auto-detected by trigger';



COMMENT ON COLUMN "public"."exceedances"."classification_level" IS 'Phase 2 record classification. Exceedances default to compliance_sensitive.';



CREATE TABLE IF NOT EXISTS "public"."external_echo_dmrs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "facility_id" "uuid",
    "npdes_id" "text" NOT NULL,
    "monitoring_period_start" "date",
    "monitoring_period_end" "date",
    "outfall" "text",
    "parameter_code" "text",
    "parameter_desc" "text",
    "statistical_base" "text",
    "limit_value" numeric,
    "limit_unit" "text",
    "dmr_value" numeric,
    "dmr_unit" "text",
    "nodi_code" "text",
    "violation_code" "text",
    "violation_desc" "text",
    "exceedance_pct" numeric,
    "raw_response" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_echo_dmrs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_echo_facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "npdes_id" "text" NOT NULL,
    "facility_name" "text",
    "permit_status" "text",
    "compliance_status" "text",
    "qtrs_in_nc" integer,
    "last_inspection_date" "date",
    "last_penalty_amount" numeric,
    "last_penalty_date" "date",
    "facility_address" "text",
    "city" "text",
    "state_code" "text",
    "zip" "text",
    "latitude" numeric,
    "longitude" numeric,
    "permit_effective_date" "date",
    "permit_expiration_date" "date",
    "sic_codes" "text"[],
    "naics_codes" "text"[],
    "raw_response" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_echo_facilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_msha_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "mine_id" "text" NOT NULL,
    "event_number" "text",
    "inspection_date" "date",
    "inspection_type" "text",
    "violation_number" "text",
    "violation_type" "text",
    "section_of_act" "text",
    "significant_substantial" boolean DEFAULT false,
    "negligence" "text",
    "proposed_penalty" numeric,
    "penalty_amount" numeric,
    "current_status" "text",
    "raw_data" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_msha_inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "sync_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "triggered_by" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "records_synced" integer DEFAULT 0,
    "records_failed" integer DEFAULT 0,
    "error_details" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_sync_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_evidence_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "field_visit_id" "uuid",
    "governance_issue_id" "uuid",
    "evidence_type" "text" DEFAULT 'photo'::"text" NOT NULL,
    "bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "uploaded_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" numeric,
    "longitude" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "field_evidence_assets_evidence_type_check" CHECK (("evidence_type" = ANY (ARRAY['photo'::"text", 'document'::"text", 'signature'::"text", 'other'::"text"]))),
    CONSTRAINT "field_evidence_assets_parent_required" CHECK ((("field_visit_id" IS NOT NULL) OR ("governance_issue_id" IS NOT NULL)))
);


ALTER TABLE "public"."field_evidence_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "field_visit_id" "uuid" NOT NULL,
    "parameter_name" "text" NOT NULL,
    "measured_value" numeric,
    "measured_text" "text",
    "unit" "text",
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "field_measurements_value_presence" CHECK ((("measured_value" IS NOT NULL) OR ("measured_text" IS NOT NULL)))
);


ALTER TABLE "public"."field_measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_outbound_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ops_processed" integer DEFAULT 0 NOT NULL,
    "ops_failed" integer DEFAULT 0 NOT NULL,
    "ops_held" integer DEFAULT 0 NOT NULL,
    "held_op_kinds" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "held_visit_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[] NOT NULL,
    "error_message" "text",
    "conflict_hold_reason" "text",
    "device_info" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."field_outbound_sync_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."field_outbound_sync_log" IS 'Server-side record of offline outbound queue flush attempts for admin diagnostics.';



CREATE TABLE IF NOT EXISTS "public"."field_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "assigned_to" "uuid" NOT NULL,
    "assigned_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "visit_status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "outcome" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "started_latitude" numeric,
    "started_longitude" numeric,
    "completed_latitude" numeric,
    "completed_longitude" numeric,
    "weather_conditions" "text",
    "field_notes" "text",
    "potential_force_majeure" boolean DEFAULT false NOT NULL,
    "potential_force_majeure_notes" "text",
    "linked_sampling_event_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sampling_calendar_id" "uuid",
    "route_batch_id" "uuid",
    "offline_created_at" timestamp with time zone,
    "classification_level" "public"."record_classification" DEFAULT 'operational_internal'::"public"."record_classification" NOT NULL,
    CONSTRAINT "field_visits_completed_requires_gps" CHECK ((("completed_at" IS NULL) OR (("completed_latitude" IS NOT NULL) AND ("completed_longitude" IS NOT NULL)))),
    CONSTRAINT "field_visits_completion_requires_outcome" CHECK ((("visit_status" <> 'completed'::"text") OR ("outcome" IS NOT NULL))),
    CONSTRAINT "field_visits_outcome_check" CHECK (("outcome" = ANY (ARRAY['sample_collected'::"text", 'no_discharge'::"text", 'access_issue'::"text"]))),
    CONSTRAINT "field_visits_started_requires_gps" CHECK ((("started_at" IS NULL) OR (("started_latitude" IS NOT NULL) AND ("started_longitude" IS NOT NULL)))),
    CONSTRAINT "field_visits_visit_status_check" CHECK (("visit_status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."field_visits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."field_visits"."route_batch_id" IS 'When set, this visit was created from dispatch_sampling_route_batch for supervisor daily route tracking.';



COMMENT ON COLUMN "public"."field_visits"."offline_created_at" IS 'Timestamp from the client device when the visit was started offline. NULL if started while online.';



COMMENT ON COLUMN "public"."field_visits"."classification_level" IS 'Phase 2 record classification. Auto-set by trigger or RPC.';



CREATE TABLE IF NOT EXISTS "public"."file_processing_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size_bytes" bigint,
    "mime_type" "text",
    "file_hash" "text",
    "file_category" "text" NOT NULL,
    "state_code" "text",
    "status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "processing_started_at" timestamp with time zone,
    "processing_completed_at" timestamp with time zone,
    "records_extracted" integer DEFAULT 0,
    "records_imported" integer DEFAULT 0,
    "records_failed" integer DEFAULT 0,
    "error_log" "jsonb" DEFAULT '[]'::"jsonb",
    "extracted_data" "jsonb",
    "document_id" "uuid",
    "data_import_id" "uuid",
    "r2_archived" boolean DEFAULT false,
    "r2_archive_path" "text",
    "r2_archived_at" timestamp with time zone,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "file_processing_queue_file_category_check" CHECK (("file_category" = ANY (ARRAY['npdes_permit'::"text", 'lab_data'::"text", 'field_inspection'::"text", 'water_monitoring'::"text", 'quarterly_report'::"text", 'dmr'::"text", 'audit_report'::"text", 'enforcement'::"text", 'consent_decree'::"text", 'sampling_matrix'::"text", 'other'::"text"]))),
    CONSTRAINT "file_processing_queue_state_code_check" CHECK (("state_code" = ANY (ARRAY['AL'::"text", 'KY'::"text", 'TN'::"text", 'VA'::"text", 'WV'::"text"]))),
    CONSTRAINT "file_processing_queue_status_check" CHECK (("status" = ANY (ARRAY['uploaded'::"text", 'queued'::"text", 'processing'::"text", 'parsed'::"text", 'validated'::"text", 'imported'::"text", 'failed'::"text", 'skipped'::"text", 'archived'::"text", 'embedded'::"text", 'embedding_failed'::"text"])))
);


ALTER TABLE "public"."file_processing_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fish_tissue_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "permit_id" "uuid",
    "collection_date" "date" NOT NULL,
    "collection_location" "text" NOT NULL,
    "latitude" numeric,
    "longitude" numeric,
    "species" "text" NOT NULL,
    "common_name" "text",
    "tissue_type" "text" NOT NULL,
    "number_of_specimens" integer,
    "composite" boolean DEFAULT true,
    "parameter_id" "uuid" NOT NULL,
    "result_value" numeric,
    "unit" "text" DEFAULT 'mg/kg'::"text",
    "detection_limit" numeric,
    "is_non_detect" boolean DEFAULT false,
    "trigger_level" numeric,
    "trigger_exceeded" boolean DEFAULT false,
    "lab_name" "text",
    "method" "text",
    "document_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fish_tissue_results_tissue_type_check" CHECK (("tissue_type" = ANY (ARRAY['whole_body'::"text", 'fillet'::"text", 'liver'::"text", 'muscle'::"text"])))
);


ALTER TABLE "public"."fish_tissue_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follow_ups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_email_id" "uuid",
    "source_triage_id" "uuid",
    "contact_email" "text" NOT NULL,
    "contact_name" "text",
    "subject" "text" NOT NULL,
    "description" "text",
    "thread_key" "text",
    "expected_reply_by" timestamp with time zone NOT NULL,
    "reminder_at" timestamp with time zone,
    "reminder_count" integer DEFAULT 0,
    "max_reminders" integer DEFAULT 3,
    "reminder_interval_hours" integer DEFAULT 48,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolution_type" "text",
    "resolution_email_id" "uuid",
    "follow_up_draft_id" "uuid",
    "auto_draft_on_overdue" boolean DEFAULT true,
    CONSTRAINT "follow_ups_resolution_type_check" CHECK (("resolution_type" = ANY (ARRAY['reply_received'::"text", 'manual'::"text", 'auto_draft_sent'::"text", 'escalated'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "follow_ups_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'overdue'::"text", 'resolved'::"text", 'cancelled'::"text", 'escalated'::"text"])))
);


ALTER TABLE "public"."follow_ups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fts_monthly_totals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "monitoring_year" smallint NOT NULL,
    "monitoring_month" smallint NOT NULL,
    "monitoring_quarter" smallint NOT NULL,
    "state" "text" NOT NULL,
    "total_penalties" numeric(12,2) DEFAULT 0 NOT NULL,
    "quarter_to_date" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fts_monthly_totals_state_check" CHECK (("state" = ANY (ARRAY['KY'::"text", 'WV'::"text", 'VA'::"text", 'TN'::"text", 'AL'::"text"])))
);


ALTER TABLE "public"."fts_monthly_totals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fts_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "quarter" smallint NOT NULL,
    "year" smallint NOT NULL,
    "format_version" "text" NOT NULL,
    "parse_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "parse_error" "text",
    "total_penalties" numeric(12,2),
    "total_violations" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fts_uploads_format_version_check" CHECK (("format_version" = ANY (ARRAY['Q3_legacy'::"text", 'Q4_plus'::"text"]))),
    CONSTRAINT "fts_uploads_parse_status_check" CHECK (("parse_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "fts_uploads_quarter_check" CHECK ((("quarter" >= 1) AND ("quarter" <= 4))),
    CONSTRAINT "fts_uploads_year_check" CHECK ((("year" >= 2020) AND ("year" <= 2099)))
);


ALTER TABLE "public"."fts_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fts_violations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "monitoring_year" smallint NOT NULL,
    "monitoring_month" smallint NOT NULL,
    "monitoring_quarter" smallint NOT NULL,
    "state" "text" NOT NULL,
    "dnr_number" "text" NOT NULL,
    "outfall_number" "text" NOT NULL,
    "penalty_category" smallint NOT NULL,
    "penalty_amount" numeric(10,2) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fts_violations_monitoring_month_check" CHECK ((("monitoring_month" >= 1) AND ("monitoring_month" <= 12))),
    CONSTRAINT "fts_violations_monitoring_quarter_check" CHECK ((("monitoring_quarter" >= 1) AND ("monitoring_quarter" <= 4))),
    CONSTRAINT "fts_violations_penalty_category_check" CHECK (("penalty_category" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "fts_violations_state_check" CHECK (("state" = ANY (ARRAY['KY'::"text", 'WV'::"text", 'VA'::"text", 'TN'::"text", 'AL'::"text"])))
);


ALTER TABLE "public"."fts_violations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "report_definition_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "report_config" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "format" "text" NOT NULL,
    "file_path_pdf" "text",
    "file_path_csv" "text",
    "file_size_bytes" integer,
    "row_count" integer,
    "data_quality_flags" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "accessed_at" timestamp with time zone[],
    CONSTRAINT "generated_reports_format_check" CHECK (("format" = ANY (ARRAY['pdf'::"text", 'csv'::"text", 'both'::"text"]))),
    CONSTRAINT "generated_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'generating'::"text", 'complete'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."generated_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."generated_reports" IS 'Immutable audit log of every report generated. No UPDATE/DELETE permitted. Consent Decree audit trail.';



CREATE TABLE IF NOT EXISTS "public"."go_live_checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "module" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" "text" DEFAULT 'required'::"text" NOT NULL,
    "assigned_to" "uuid",
    "evidence_notes" "text",
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "go_live_checklist_items_module_check" CHECK (("module" = ANY (ARRAY['auth'::"text", 'upload'::"text", 'compliance'::"text", 'field_ops'::"text", 'reporting'::"text", 'work_orders'::"text", 'violations'::"text", 'dmr'::"text", 'incidents'::"text", 'corrective_actions'::"text", 'audit'::"text", 'emergency'::"text", 'system_health'::"text", 'infrastructure'::"text", 'security'::"text"]))),
    CONSTRAINT "go_live_checklist_items_priority_check" CHECK (("priority" = ANY (ARRAY['critical'::"text", 'required'::"text", 'recommended'::"text", 'optional'::"text"]))),
    CONSTRAINT "go_live_checklist_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'passed'::"text", 'failed'::"text", 'blocked'::"text", 'na'::"text"])))
);


ALTER TABLE "public"."go_live_checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."go_live_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "target_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_items" integer DEFAULT 0 NOT NULL,
    "completed_items" integer DEFAULT 0 NOT NULL,
    "readiness_score" numeric(5,2) DEFAULT 0,
    "deployment_version" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "go_live_checklists_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text", 'blocked'::"text", 'ready'::"text", 'deployed'::"text", 'rolled_back'::"text"])))
);


ALTER TABLE "public"."go_live_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."go_live_sign_offs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sign_off_type" "text" NOT NULL,
    "signed_by" "uuid" NOT NULL,
    "signer_name" "text" NOT NULL,
    "signer_role" "text" NOT NULL,
    "conditions" "text",
    "notes" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "go_live_sign_offs_sign_off_type_check" CHECK (("sign_off_type" = ANY (ARRAY['technical'::"text", 'compliance'::"text", 'legal'::"text", 'executive'::"text", 'security'::"text", 'operational'::"text"])))
);


ALTER TABLE "public"."go_live_sign_offs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_escalation_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "issue_type" "text" NOT NULL,
    "step_number" integer NOT NULL,
    "owner_name" "text" NOT NULL,
    "owner_role" "text" NOT NULL,
    "owner_user_id" "uuid",
    "sla_hours" integer DEFAULT 24 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "governance_escalation_config_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['access_issue'::"text", 'potential_force_majeure'::"text"]))),
    CONSTRAINT "governance_escalation_config_step_number_check" CHECK ((("step_number" >= 1) AND ("step_number" <= 6)))
);


ALTER TABLE "public"."governance_escalation_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."governance_escalation_config" IS 'Configurable escalation chain per issue type. Replaces hardcoded "Bill Johnson" in complete_field_visit RPC.';



CREATE TABLE IF NOT EXISTS "public"."governance_issue_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "governance_issue_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "actor_user_id" "uuid" DEFAULT "auth"."uid"(),
    "actor_name" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "governance_issue_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'status_changed'::"text", 'decision_recorded'::"text", 'owner_changed'::"text", 'note_added'::"text", 'evidence_linked'::"text"])))
);


ALTER TABLE "public"."governance_issue_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "field_visit_id" "uuid",
    "access_issue_id" "uuid",
    "issue_type" "text" NOT NULL,
    "related_entity_type" "text" NOT NULL,
    "related_entity_id" "uuid" NOT NULL,
    "related_outfall_id" "uuid",
    "related_permit_id" "uuid",
    "state_code" "text" DEFAULT 'WV'::"text" NOT NULL,
    "decree_paragraphs" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "title" "text" NOT NULL,
    "issue_summary" "text" NOT NULL,
    "current_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "current_step" integer DEFAULT 1 NOT NULL,
    "current_owner_name" "text" DEFAULT 'Bill Johnson'::"text" NOT NULL,
    "current_owner_role" "text" DEFAULT 'Chief Compliance Officer'::"text" NOT NULL,
    "current_owner_user_id" "uuid",
    "raised_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "response_deadline" timestamp with time zone,
    "notice_deadline" timestamp with time zone,
    "written_deadline" timestamp with time zone,
    "final_disposition" "text",
    "final_decision_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "classification_level" "public"."record_classification" DEFAULT 'compliance_sensitive'::"public"."record_classification" NOT NULL,
    CONSTRAINT "governance_issues_current_status_check" CHECK (("current_status" = ANY (ARRAY['open'::"text", 'under_review'::"text", 'decision_recorded'::"text", 'closed'::"text"]))),
    CONSTRAINT "governance_issues_current_step_check" CHECK ((("current_step" >= 1) AND ("current_step" <= 4))),
    CONSTRAINT "governance_issues_issue_type_check" CHECK (("issue_type" = ANY (ARRAY['access_issue'::"text", 'potential_force_majeure'::"text"]))),
    CONSTRAINT "governance_issues_related_entity_type_check" CHECK (("related_entity_type" = ANY (ARRAY['field_visit'::"text", 'access_issue'::"text"])))
);


ALTER TABLE "public"."governance_issues" OWNER TO "postgres";


COMMENT ON COLUMN "public"."governance_issues"."classification_level" IS 'Phase 2 record classification. Governance issues default to compliance_sensitive.';



CREATE TABLE IF NOT EXISTS "public"."governance_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "review_type" "text" DEFAULT 'quarterly'::"text" NOT NULL,
    "review_period_start" "date" NOT NULL,
    "review_period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "findings" "text",
    "action_items" "jsonb",
    "recommendations" "text",
    "compliance_score" numeric(5,2),
    "audit_readiness_score" numeric(5,2),
    "conducted_by" "uuid",
    "conducted_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "governance_reviews_review_type_check" CHECK (("review_type" = ANY (ARRAY['quarterly'::"text", 'annual'::"text", 'special'::"text", 'consent_decree'::"text"]))),
    CONSTRAINT "governance_reviews_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'findings_draft'::"text", 'under_review'::"text", 'finalized'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."governance_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."handoff_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "input_source_type" "text" NOT NULL,
    "raw_content" "text",
    "attachment_path" "text",
    "file_name" "text",
    "file_mime_type" "text",
    "source_date" "date",
    "extracted_text" "text",
    "task_matches" "jsonb" DEFAULT '[]'::"jsonb",
    "unmatched_items" "jsonb" DEFAULT '[]'::"jsonb",
    "match_count" integer DEFAULT 0,
    "extraction_confidence" numeric(3,2),
    "ai_reasoning" "text",
    "processing_time_ms" integer,
    "status" "text" DEFAULT 'pending_review'::"text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "applied_task_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "handoff_id" "text",
    "proposed_updates" "jsonb" DEFAULT '[]'::"jsonb",
    "approved_updates" "jsonb" DEFAULT '[]'::"jsonb",
    "rejected_updates" "jsonb" DEFAULT '[]'::"jsonb",
    "source_from" "text",
    "source_reference" "text",
    "tasks_updated" "text"[] DEFAULT '{}'::"text"[],
    "ai_extraction" "jsonb",
    CONSTRAINT "handoff_history_input_source_type_check" CHECK (("input_source_type" = ANY (ARRAY['email'::"text", 'text'::"text", 'call'::"text", 'document'::"text", 'paste'::"text", 'file'::"text"]))),
    CONSTRAINT "handoff_history_status_check" CHECK (("status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text", 'partial'::"text"])))
);


ALTER TABLE "public"."handoff_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."human_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "field_name" "text" NOT NULL,
    "original_value" "text",
    "override_value" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "overridden_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "decree_paragraphs" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "human_overrides_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['exceedance'::"text", 'classification'::"text", 'escalation'::"text", 'incident'::"text", 'corrective_action'::"text", 'dmr_line_item'::"text", 'violation'::"text", 'readiness_check'::"text"])))
);


ALTER TABLE "public"."human_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "incident_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_name" "text" NOT NULL,
    "actor_user_id" "uuid",
    "old_value" "text",
    "new_value" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "incident_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'status_changed'::"text", 'severity_changed'::"text", 'escalated'::"text", 'owner_changed'::"text", 'note_added'::"text", 'evidence_linked'::"text", 'ca_created'::"text", 'countdown_started'::"text", 'countdown_paused'::"text", 'countdown_resumed'::"text", 'countdown_expired'::"text", 'resolved'::"text", 'reopened'::"text", 'classified'::"text"])))
);


ALTER TABLE "public"."incident_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'field'::"text" NOT NULL,
    "default_severity" "public"."incident_severity" DEFAULT 'medium'::"public"."incident_severity" NOT NULL,
    "default_recoverability" "public"."incident_recoverability" DEFAULT 'unknown'::"public"."incident_recoverability" NOT NULL,
    "auto_ca_enabled" boolean DEFAULT false NOT NULL,
    "countdown_hours" integer,
    "operational_chain_id" "uuid",
    "compliance_chain_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "incident_types_category_check" CHECK (("category" = ANY (ARRAY['field'::"text", 'sample_integrity'::"text", 'equipment'::"text", 'regulatory'::"text", 'environmental'::"text", 'safety'::"text", 'data_quality'::"text"])))
);


ALTER TABLE "public"."incident_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "incident_type_id" "uuid" NOT NULL,
    "incident_number" integer NOT NULL,
    "severity" "public"."incident_severity" DEFAULT 'medium'::"public"."incident_severity" NOT NULL,
    "recoverability" "public"."incident_recoverability" DEFAULT 'unknown'::"public"."incident_recoverability" NOT NULL,
    "status" "public"."incident_status" DEFAULT 'open'::"public"."incident_status" NOT NULL,
    "classification_level" "text" DEFAULT 'compliance_sensitive'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "root_cause" "text",
    "countdown_started_at" timestamp with time zone,
    "countdown_expires_at" timestamp with time zone,
    "countdown_reason" "text",
    "countdown_paused" boolean DEFAULT false NOT NULL,
    "active_chain_type" "text" DEFAULT 'operational'::"text",
    "current_escalation_step" integer DEFAULT 1 NOT NULL,
    "current_owner_name" "text",
    "current_owner_role" "text",
    "current_owner_user_id" "uuid",
    "escalated_at" timestamp with time zone,
    "field_visit_id" "uuid",
    "outfall_id" "uuid",
    "permit_id" "uuid",
    "corrective_action_id" "uuid",
    "legacy_governance_issue_id" "uuid",
    "auto_ca_triggered" boolean DEFAULT false NOT NULL,
    "auto_ca_created_at" timestamp with time zone,
    "decree_paragraphs" "text"[] DEFAULT '{}'::"text"[],
    "reported_by" "uuid",
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "incidents_active_chain_type_check" CHECK (("active_chain_type" = ANY (ARRAY['operational'::"text", 'compliance'::"text"]))),
    CONSTRAINT "incidents_classification_level_check" CHECK (("classification_level" = ANY (ARRAY['operational_internal'::"text", 'compliance_sensitive'::"text", 'privileged'::"text", 'public_eligible'::"text", 'regulator_shareable'::"text", 'restricted'::"text"])))
);


ALTER TABLE "public"."incidents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."incidents_incident_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."incidents_incident_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."incidents_incident_number_seq" OWNED BY "public"."incidents"."incident_number";



CREATE TABLE IF NOT EXISTS "public"."innovation_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "pack_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "acted_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "innovation_actions_action_check" CHECK (("action" = ANY (ARRAY['approve'::"text", 'reject'::"text", 'defer'::"text", 'build_now'::"text", 're_grade'::"text", 'enrich'::"text", 'refine'::"text", 'comment'::"text"])))
);


ALTER TABLE "public"."innovation_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."innovation_enrichment_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "pack_id" "uuid",
    "field_name" "text" NOT NULL,
    "requested_by_handle" "text" DEFAULT 'c3po'::"text" NOT NULL,
    "assigned_agent_handle" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "prompt" "text",
    "result_value" "jsonb" DEFAULT '{}'::"jsonb",
    "source_receipt" "text",
    "confidence" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "innovation_enrichment_tasks_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'complete'::"text", 'blocked'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."innovation_enrichment_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."innovation_grade_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "run_type" "text" NOT NULL,
    "grade" "text",
    "score" numeric(5,2),
    "rubric_scores" "jsonb" DEFAULT '{}'::"jsonb",
    "schema_completeness" numeric(5,2),
    "missing_fields" "text"[] DEFAULT '{}'::"text"[],
    "model_used" "text",
    "raw_output" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "innovation_grade_runs_grade_check" CHECK (("grade" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text", 'F'::"text"]))),
    CONSTRAINT "innovation_grade_runs_run_type_check" CHECK (("run_type" = ANY (ARRAY['initial'::"text", 'enriched'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."innovation_grade_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."innovation_ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pack_id" "uuid" NOT NULL,
    "ordinal" smallint DEFAULT 1 NOT NULL,
    "title" "text" NOT NULL,
    "one_sentence_pitch" "text",
    "problem_it_solves" "text",
    "who_it_helps" "text",
    "expected_leverage" "text",
    "workflow_fit" "text",
    "dependencies" "jsonb" DEFAULT '[]'::"jsonb",
    "risk_notes" "text",
    "effort_guess" "text",
    "definition_of_done" "jsonb" DEFAULT '[]'::"jsonb",
    "how_brian_uses_it" "jsonb" DEFAULT '[]'::"jsonb",
    "grade" "text",
    "score" numeric(5,2) DEFAULT 0,
    "rubric_json" "jsonb" DEFAULT '{}'::"jsonb",
    "normalization_json" "jsonb" DEFAULT '{}'::"jsonb",
    "refinement_json" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'raw'::"text" NOT NULL,
    "decision" "text",
    "decision_reason" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "innovation_ideas_decision_check" CHECK (("decision" = ANY (ARRAY['approve'::"text", 'reject'::"text", 'defer'::"text", 'build_now'::"text"]))),
    CONSTRAINT "innovation_ideas_grade_check" CHECK (("grade" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text", 'F'::"text"]))),
    CONSTRAINT "innovation_ideas_ordinal_check" CHECK ((("ordinal" >= 1) AND ("ordinal" <= 10))),
    CONSTRAINT "innovation_ideas_status_check" CHECK (("status" = ANY (ARRAY['raw'::"text", 'graded'::"text", 'needs_enrichment'::"text", 'enriching'::"text", 'enriched'::"text", 'approved'::"text", 'rejected'::"text", 'deferred'::"text", 'building'::"text", 'deploy_ready'::"text", 'blocked'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."innovation_ideas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."innovation_packs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_date" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "winner_idea_id" "uuid",
    "total_ideas" integer DEFAULT 0 NOT NULL,
    "summary" "text",
    "report_markdown" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "innovation_packs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'grading'::"text", 'enriching'::"text", 'ready'::"text", 'decided'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."innovation_packs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "connection_name" "text" NOT NULL,
    "workspace_id" "uuid",
    "email_address" "text",
    "encrypted_access_token" "text",
    "encrypted_refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "integration_connections_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'revoked'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."integration_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."keyword_alert_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_name" "text" NOT NULL,
    "keywords" "text"[] NOT NULL,
    "match_location" "text" DEFAULT 'both'::"text",
    "alert_level" "text" NOT NULL,
    "urgency_boost" integer DEFAULT 0,
    "force_tier" integer,
    "auto_tag" "text"[],
    "telegram_alert" boolean DEFAULT true,
    "telegram_message_template" "text",
    "workspace" "text" DEFAULT 'all'::"text",
    "enabled" boolean DEFAULT true,
    "hits" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" DEFAULT '3ccb8364-da19-482e-b3fa-6ee4ed40822b'::"uuid",
    CONSTRAINT "keyword_alert_rules_alert_level_check" CHECK (("alert_level" = ANY (ARRAY['red_flag'::"text", 'vip_override'::"text", 'priority_boost'::"text", 'tag_only'::"text"]))),
    CONSTRAINT "keyword_alert_rules_match_location_check" CHECK (("match_location" = ANY (ARRAY['subject'::"text", 'body'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."keyword_alert_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "kpi_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "target_value" numeric NOT NULL,
    "warning_threshold" numeric,
    "critical_threshold" numeric,
    "direction" "text" DEFAULT 'above'::"text" NOT NULL,
    "unit" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kpi_targets_direction_check" CHECK (("direction" = ANY (ARRAY['above'::"text", 'below'::"text"])))
);


ALTER TABLE "public"."kpi_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lab_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sampling_event_id" "uuid" NOT NULL,
    "parameter_id" "uuid" NOT NULL,
    "result_value" numeric,
    "result_text" "text",
    "unit" "text" NOT NULL,
    "detection_limit" numeric,
    "is_non_detect" boolean DEFAULT false NOT NULL,
    "qualifier" "text",
    "analyzed_date" "date",
    "method" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quantification_limit" numeric,
    "minimum_level" numeric,
    "method_detection_limit" numeric,
    "hold_time_met" boolean,
    "lab_qc_passed" boolean DEFAULT true,
    "duplicate_rpd" numeric,
    "sample_matrix" "text" DEFAULT 'water'::"text",
    "import_id" "uuid",
    CONSTRAINT "lab_results_sample_matrix_check" CHECK (("sample_matrix" = ANY (ARRAY['water'::"text", 'sediment'::"text", 'tissue'::"text", 'air'::"text", 'soil'::"text"])))
);


ALTER TABLE "public"."lab_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_holds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "hold_reason" "text" NOT NULL,
    "hold_category" "text" DEFAULT 'litigation'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "placed_by" "uuid" NOT NULL,
    "placed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_by" "uuid",
    "released_at" timestamp with time zone,
    "release_reason" "text",
    "decree_paragraphs" "text"[],
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_holds_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['exceedance'::"text", 'incident'::"text", 'corrective_action'::"text", 'violation'::"text", 'work_order'::"text", 'dmr_submission'::"text", 'governance_issue'::"text"]))),
    CONSTRAINT "legal_holds_hold_category_check" CHECK (("hold_category" = ANY (ARRAY['litigation'::"text", 'investigation'::"text", 'regulatory_inquiry'::"text", 'audit'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."legal_holds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_program_roster" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "cutover_batch_id" "uuid" NOT NULL,
    "state_code" "text",
    "site_id" "uuid" NOT NULL,
    "permit_id" "uuid",
    "outfall_id" "uuid",
    "source_row_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."live_program_roster" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "performed_by" "uuid",
    "maintenance_type" "text" DEFAULT 'preventive'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "parts_replaced" "text",
    "cost_estimate" numeric(10,2),
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_maintenance_due" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_logs_maintenance_type_check" CHECK (("maintenance_type" = ANY (ARRAY['preventive'::"text", 'corrective'::"text", 'emergency'::"text", 'inspection'::"text"])))
);


ALTER TABLE "public"."maintenance_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."no_discharge_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "field_visit_id" "uuid" NOT NULL,
    "narrative" "text" NOT NULL,
    "observed_condition" "text",
    "obstruction_observed" boolean DEFAULT false NOT NULL,
    "obstruction_details" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."no_discharge_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "email_enabled" boolean DEFAULT true NOT NULL,
    "sms_enabled" boolean DEFAULT false NOT NULL,
    "in_app_enabled" boolean DEFAULT true NOT NULL,
    "lead_days" integer DEFAULT 30,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "severity" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "related_table" "text",
    "related_record_id" "uuid",
    "sent_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "recipient_id" "uuid",
    "priority" "public"."notification_priority" DEFAULT 'info'::"public"."notification_priority",
    "channels" "text"[] DEFAULT '{in_app}'::"text"[],
    "in_app_read_at" timestamp with time zone,
    "email_sent_at" timestamp with time zone,
    "sms_sent_at" timestamp with time zone,
    "email_error" "text",
    "sms_error" "text",
    "entity_type" "text",
    "entity_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "dismissed_at" timestamp with time zone,
    CONSTRAINT "notifications_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'in_app'::"text"]))),
    CONSTRAINT "notifications_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"]))),
    CONSTRAINT "notifications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'read'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nov_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "violation_id" "uuid",
    "nov_number" "text",
    "issuing_agency" "text" NOT NULL,
    "state_code" "text",
    "issued_date" "date" NOT NULL,
    "received_date" "date",
    "response_due_date" "date",
    "response_submitted_date" "date",
    "response_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "description" "text",
    "alleged_violations" "text",
    "proposed_penalty" numeric,
    "final_penalty" numeric,
    "nov_document_path" "text",
    "response_document_path" "text",
    "resolution_notes" "text",
    "resolved_at" timestamp with time zone,
    "decree_paragraphs" "text"[],
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nov_records_response_status_check" CHECK (("response_status" = ANY (ARRAY['pending'::"text", 'drafting'::"text", 'under_review'::"text", 'submitted'::"text", 'accepted'::"text", 'appealed'::"text"]))),
    CONSTRAINT "nov_records_state_code_check" CHECK (("state_code" = ANY (ARRAY['AL'::"text", 'KY'::"text", 'TN'::"text", 'VA'::"text", 'WV'::"text"])))
);


ALTER TABLE "public"."nov_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npdes_id_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "state_code" "text" NOT NULL,
    "source_permit_id" "text" NOT NULL,
    "npdes_id" "text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."npdes_id_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."npdes_permits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "state_id" "uuid" NOT NULL,
    "permit_number" "text" NOT NULL,
    "permit_type" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "issued_date" "date",
    "effective_date" "date",
    "expiration_date" "date",
    "issuing_agency" "text",
    "document_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "general_permit_number" "text",
    "coverage_letter_number" "text",
    "coverage_letter_date" "date",
    "administratively_continued" boolean DEFAULT false,
    "facility_name" "text",
    "permittee_name" "text",
    "permittee_address" "text",
    CONSTRAINT "npdes_permits_permit_type_check" CHECK (("permit_type" = ANY (ARRAY['individual'::"text", 'general'::"text", 'stormwater'::"text"]))),
    CONSTRAINT "npdes_permits_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'administratively_continued'::"text", 'pending_renewal'::"text", 'terminated'::"text", 'revoked'::"text", 'draft'::"text"])))
);


ALTER TABLE "public"."npdes_permits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."obligation_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "obligation_id" "uuid" NOT NULL,
    "evidence_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_path" "text",
    "record_table" "text",
    "record_id" "uuid",
    "verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "effective_date" "date",
    "expiry_date" "date",
    "submitted_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "obligation_evidence_evidence_type_check" CHECK (("evidence_type" = ANY (ARRAY['document'::"text", 'record'::"text", 'report'::"text", 'photo'::"text", 'certification'::"text", 'training_completion'::"text", 'inspection_report'::"text", 'lab_result'::"text", 'dmr_submission'::"text", 'corrective_action'::"text", 'other'::"text"]))),
    CONSTRAINT "obligation_evidence_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['unverified'::"text", 'verified'::"text", 'expired'::"text", 'insufficient'::"text", 'disputed'::"text"])))
);


ALTER TABLE "public"."obligation_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "legal_name" "text",
    "org_type" "text" NOT NULL,
    "headquarters_state" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid",
    CONSTRAINT "organizations_org_type_check" CHECK (("org_type" = ANY (ARRAY['parent'::"text", 'subsidiary'::"text", 'affiliate'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outfall_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "alias" "text" NOT NULL,
    "source" "text",
    "match_method" "text",
    "organization_id" "uuid" NOT NULL,
    "permit_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "outfall_aliases_match_method_check" CHECK (("match_method" = ANY (ARRAY['exact'::"text", 'zero_strip'::"text", 'digits_only'::"text", 'user_confirmed'::"text"]))),
    CONSTRAINT "outfall_aliases_source_check" CHECK (("source" = ANY (ARRAY['lab_edd'::"text", 'permit_sheet'::"text", 'dmr'::"text", 'netdmr'::"text", 'osmre'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."outfall_aliases" OWNER TO "postgres";


COMMENT ON TABLE "public"."outfall_aliases" IS 'Maps lab/permit outfall identifiers to canonical outfalls.id.';



CREATE TABLE IF NOT EXISTS "public"."outfall_discharge_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "discharge_start" timestamp with time zone NOT NULL,
    "discharge_end" timestamp with time zone,
    "estimated_flow_gpd" numeric,
    "observed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."outfall_discharge_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outfall_limit_table_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "limit_table_id" "uuid" NOT NULL,
    "effective_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."outfall_limit_table_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outfalls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "outfall_number" "text" NOT NULL,
    "description" "text",
    "outfall_type" "text",
    "receiving_water" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dsn" "text",
    "mpid" "text",
    "pe_certified" boolean DEFAULT false,
    "pe_certification_date" "date",
    "pe_name" "text",
    "pe_form_number" "text",
    "drainage_area_acres" numeric,
    "receiving_water_segment" "text",
    "receiving_water_id" "uuid",
    "is_representative" boolean DEFAULT false,
    CONSTRAINT "outfalls_outfall_type_check" CHECK (("outfall_type" = ANY (ARRAY['process_water'::"text", 'stormwater'::"text", 'mine_drainage'::"text", 'treatment_system'::"text", 'sediment_pond'::"text", 'combined'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."outfalls" OWNER TO "postgres";


COMMENT ON COLUMN "public"."outfalls"."site_id" IS 'FK to sites. Nullable to allow import from permit PDFs that lack facility info. Should be backfilled when site data is available.';



CREATE TABLE IF NOT EXISTS "public"."outlet_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "field_visit_id" "uuid" NOT NULL,
    "flow_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "signage_condition" "text",
    "pipe_condition" "text",
    "erosion_observed" boolean DEFAULT false NOT NULL,
    "obstruction_observed" boolean DEFAULT false NOT NULL,
    "obstruction_details" "text",
    "inspector_notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "flow_category" "text",
    "flow_estimate_cfs" numeric,
    "flow_method" "text",
    "flow_safety_warning_shown" boolean,
    CONSTRAINT "outlet_inspections_flow_category_check" CHECK ((("flow_category" IS NULL) OR ("flow_category" = ANY (ARRAY['trickle'::"text", 'low'::"text", 'moderate'::"text", 'high'::"text", 'flood'::"text"])))),
    CONSTRAINT "outlet_inspections_flow_method_check" CHECK ((("flow_method" IS NULL) OR ("flow_method" = ANY (ARRAY['visual'::"text", 'float'::"text", 'instrument'::"text"])))),
    CONSTRAINT "outlet_inspections_flow_status_check" CHECK (("flow_status" = ANY (ARRAY['flowing'::"text", 'no_flow'::"text", 'obstructed'::"text", 'standing_water'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."outlet_inspections" OWNER TO "postgres";


COMMENT ON COLUMN "public"."outlet_inspections"."flow_category" IS 'Visual flow band; QA only — trickle/low/moderate/high/flood';



COMMENT ON COLUMN "public"."outlet_inspections"."flow_estimate_cfs" IS 'Reporter cfs estimate for DMR / quarterly stream monitoring';



COMMENT ON COLUMN "public"."outlet_inspections"."flow_method" IS 'visual | float | instrument';



COMMENT ON COLUMN "public"."outlet_inspections"."flow_safety_warning_shown" IS 'True when flood band selected and safety banner applies';



CREATE TABLE IF NOT EXISTS "public"."parameter_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parameter_id" "uuid" NOT NULL,
    "alias" "text" NOT NULL,
    "source" "text",
    "state_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parameter_aliases_source_check" CHECK (("source" = ANY (ARRAY['lab_edd'::"text", 'permit_sheet'::"text", 'dmr'::"text", 'netdmr'::"text", 'osmre'::"text", 'manual'::"text"]))),
    CONSTRAINT "parameter_aliases_state_code_check" CHECK ((("state_code" IS NULL) OR ("state_code" = ANY (ARRAY['AL'::"text", 'KY'::"text", 'TN'::"text", 'VA'::"text", 'WV'::"text"]))))
);


ALTER TABLE "public"."parameter_aliases" OWNER TO "postgres";


COMMENT ON TABLE "public"."parameter_aliases" IS 'Maps lab/permit parameter name variants to canonical parameters.id.';



CREATE TABLE IF NOT EXISTS "public"."parameters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text" NOT NULL,
    "cas_number" "text",
    "category" "text",
    "default_unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "storet_code" "text",
    "epa_parameter_code" "text",
    "fraction" "text",
    CONSTRAINT "parameters_category_check" CHECK (("category" = ANY (ARRAY['metal'::"text", 'physical'::"text", 'nutrient'::"text", 'organic'::"text", 'biological'::"text", 'other'::"text"]))),
    CONSTRAINT "parameters_fraction_check" CHECK (("fraction" = ANY (ARRAY['total'::"text", 'dissolved'::"text", 'total_recoverable'::"text", 'suspended'::"text", 'settleable'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."parameters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permit_amendments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "amendment_type" "text" NOT NULL,
    "amendment_number" integer,
    "amendment_date" "date" NOT NULL,
    "effective_date" "date",
    "description" "text",
    "limits_changed" boolean DEFAULT false,
    "outfalls_changed" boolean DEFAULT false,
    "parameters_changed" boolean DEFAULT false,
    "conditions_changed" boolean DEFAULT false,
    "document_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "permit_amendments_amendment_type_check" CHECK (("amendment_type" = ANY (ARRAY['modification'::"text", 'renewal'::"text", 'administrative_extension'::"text", 'transfer'::"text", 'minor_modification'::"text", 'major_modification'::"text"])))
);


ALTER TABLE "public"."permit_amendments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permit_limit_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "table_code" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "applies_to_outfalls" "text"[],
    "condition_type" "text" DEFAULT 'default'::"text" NOT NULL,
    "trigger_description" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "effective_date" "date",
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "permit_limit_tables_condition_type_check" CHECK (("condition_type" = ANY (ARRAY['default'::"text", 'precipitation'::"text", 'post_mining'::"text", 'reclamation'::"text", 'stormwater'::"text", 'alternate_effluent'::"text"])))
);


ALTER TABLE "public"."permit_limit_tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permit_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "parameter_id" "uuid" NOT NULL,
    "limit_type" "text" NOT NULL,
    "limit_value" numeric,
    "unit" "text" NOT NULL,
    "statistical_base" "text",
    "monitoring_frequency" "text",
    "sample_type" "text",
    "effective_date" "date",
    "end_date" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "limit_table_id" "uuid",
    "storet_code" "text",
    "condition_notes" "text",
    "reporting_frequency" "text",
    "review_status" "text" DEFAULT 'pending_review'::"text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "extraction_confidence" numeric,
    "extraction_source" "text",
    "import_batch_id" "uuid",
    "limit_min" numeric,
    "limit_max" numeric,
    CONSTRAINT "permit_limits_extraction_confidence_check" CHECK ((("extraction_confidence" >= (0)::numeric) AND ("extraction_confidence" <= (1)::numeric))),
    CONSTRAINT "permit_limits_extraction_source_check" CHECK (("extraction_source" = ANY (ARRAY['ai_excel'::"text", 'ai_pdf'::"text", 'manual'::"text", 'netdmr'::"text", 'osmre'::"text"]))),
    CONSTRAINT "permit_limits_limit_type_check" CHECK (("limit_type" = ANY (ARRAY['daily_max'::"text", 'daily_min'::"text", 'monthly_avg'::"text", 'weekly_avg'::"text", 'instantaneous_max'::"text", 'instantaneous_min'::"text", 'annual_avg'::"text", 'report_only'::"text", 'pass_fail'::"text", 'range'::"text"]))),
    CONSTRAINT "permit_limits_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending_review'::"text", 'in_review'::"text", 'verified'::"text", 'disputed'::"text"]))),
    CONSTRAINT "permit_limits_sample_type_check" CHECK (("sample_type" = ANY (ARRAY['grab'::"text", 'composite_24hr'::"text", 'composite_flow'::"text", 'calculated'::"text", 'continuous'::"text"])))
);


ALTER TABLE "public"."permit_limits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."permit_limits"."limit_min" IS 'Minimum value for range-type limits (e.g., pH minimum 6.0)';



COMMENT ON COLUMN "public"."permit_limits"."limit_max" IS 'Maximum value for range-type limits (e.g., pH maximum 9.0)';



CREATE TABLE IF NOT EXISTS "public"."precipitation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "event_start" timestamp with time zone NOT NULL,
    "event_end" timestamp with time zone,
    "rainfall_inches" numeric,
    "recurrence_interval" "text",
    "weather_station" "text",
    "data_source" "text",
    "exemption_claimed" boolean DEFAULT false NOT NULL,
    "exemption_claim_date" timestamp with time zone,
    "exemption_approved" boolean,
    "exemption_approved_by" "uuid",
    "sample_collected_within_48hrs" boolean,
    "analysis_completed_within_deadline" boolean,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "weather_station_id" "uuid",
    "precipitation_reading_id" "uuid",
    "trigger_source" "text" DEFAULT 'automated'::"text",
    "status" "text" DEFAULT 'alert_generated'::"text",
    "activated_by" "uuid",
    "activated_at" timestamp with time zone,
    "dismissed_by" "uuid",
    "dismissed_at" timestamp with time zone,
    "dismiss_reason_code" "text",
    "dismiss_justification" "text",
    "manual_trigger_reason_code" "text",
    "manual_trigger_justification" "text",
    "supporting_evidence_ids" "uuid"[],
    CONSTRAINT "chk_dismiss_justification_length" CHECK ((("dismiss_reason_code" IS NULL) OR (("dismiss_justification" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "dismiss_justification")) >= 50)))),
    CONSTRAINT "chk_manual_trigger_justification_length" CHECK ((("manual_trigger_reason_code" IS NULL) OR (("manual_trigger_justification" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "manual_trigger_justification")) >= 50)))),
    CONSTRAINT "precipitation_events_data_source_check" CHECK (("data_source" = ANY (ARRAY['manual'::"text", 'weather_api'::"text", 'rain_gauge'::"text", 'nws'::"text"]))),
    CONSTRAINT "precipitation_events_dismiss_reason_code_check" CHECK ((("dismiss_reason_code" IS NULL) OR ("dismiss_reason_code" = ANY (ARRAY['NO_DISCHARGE'::"text", 'STATION_ERROR'::"text", 'LOCALIZED_EVENT'::"text", 'BELOW_ACTUAL'::"text", 'OTHER'::"text"])))),
    CONSTRAINT "precipitation_events_manual_trigger_reason_code_check" CHECK ((("manual_trigger_reason_code" IS NULL) OR ("manual_trigger_reason_code" = ANY (ARRAY['GAUGE_ONLY'::"text", 'VISUAL_DISCHARGE'::"text", 'RADAR_INDICATED'::"text", 'PERMIT_REQUIREMENT'::"text"])))),
    CONSTRAINT "precipitation_events_status_check" CHECK (("status" = ANY (ARRAY['alert_generated'::"text", 'activated'::"text", 'dismissed'::"text", 'completed'::"text"]))),
    CONSTRAINT "precipitation_events_trigger_source_check" CHECK (("trigger_source" = ANY (ARRAY['automated'::"text", 'manual'::"text", 'gauge_only'::"text", 'radar'::"text"])))
);


ALTER TABLE "public"."precipitation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precipitation_exemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "precipitation_event_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "recurrence_interval" numeric(6,2) NOT NULL,
    "justification" "text" NOT NULL,
    "claimed_by" "uuid",
    "claimed_at" timestamp with time zone DEFAULT "now"(),
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "denial_reason" "text",
    "forty_eight_hr_sample_proof" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_claimed_ne_approved" CHECK (("claimed_by" IS DISTINCT FROM "approved_by")),
    CONSTRAINT "chk_exemption_justification_length" CHECK (("char_length"("justification") >= 50)),
    CONSTRAINT "chk_recurrence_interval_min" CHECK (("recurrence_interval" >= (10)::numeric)),
    CONSTRAINT "precipitation_exemptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."precipitation_exemptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."precipitation_exemptions" IS 'Exemption claims for high-recurrence-interval storm events (>= 10-year storms). Requires separate approver from claimant per Consent Decree obligations.';



CREATE TABLE IF NOT EXISTS "public"."precipitation_readings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weather_station_id" "uuid" NOT NULL,
    "reading_date" "date" NOT NULL,
    "reading_time" time without time zone,
    "rainfall_inches" numeric(5,2) NOT NULL,
    "duration_hours" numeric(4,1),
    "data_quality_flag" "text",
    "source_type" "text" NOT NULL,
    "raw_api_response" "jsonb",
    "fetched_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "precipitation_readings_source_type_check" CHECK (("source_type" = ANY (ARRAY['api_automated'::"text", 'manual_entry'::"text", 'gauge_upload'::"text"])))
);


ALTER TABLE "public"."precipitation_readings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quarterly_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_year" integer NOT NULL,
    "report_quarter" integer NOT NULL,
    "due_date" "date" NOT NULL,
    "submitted_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "prepared_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "document_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quarterly_reports_report_quarter_check" CHECK ((("report_quarter" >= 1) AND ("report_quarter" <= 4))),
    CONSTRAINT "quarterly_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_review'::"text", 'approved'::"text", 'submitted'::"text", 'overdue'::"text"])))
);


ALTER TABLE "public"."quarterly_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rca_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "corrective_action_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "category" "text" NOT NULL,
    "why_1" "text",
    "why_2" "text",
    "why_3" "text",
    "why_4" "text",
    "why_5" "text",
    "contributing_factors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "root_cause_summary" "text" NOT NULL,
    "recurrence_risk" "text",
    "preventive_recommendation" "text",
    "decree_paragraphs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "analyzed_by" "uuid",
    "analyzed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rca_findings_recurrence_risk_check" CHECK (("recurrence_risk" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."rca_findings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rca_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "why_prompts" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "suggested_preventive_actions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "decree_paragraphs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rca_templates_category_check" CHECK (("category" = ANY (ARRAY['equipment_failure'::"text", 'human_error'::"text", 'procedure_gap'::"text", 'weather_event'::"text", 'design_deficiency'::"text", 'material_failure'::"text", 'training_gap'::"text", 'communication_failure'::"text", 'external_factor'::"text", 'monitoring_gap'::"text", 'maintenance_lapse'::"text", 'regulatory_change'::"text"])))
);


ALTER TABLE "public"."rca_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."readiness_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_batch_id" "uuid" NOT NULL,
    "requirement_id" "uuid" NOT NULL,
    "checked_by" "uuid" NOT NULL,
    "passed" boolean NOT NULL,
    "failure_reason" "text",
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."readiness_checks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."readiness_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "requirement_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_blocking" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "applies_to_roles" "text"[] DEFAULT '{field_sampler}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "readiness_requirements_requirement_type_check" CHECK (("requirement_type" = ANY (ARRAY['training'::"text", 'certification'::"text", 'equipment'::"text", 'calibration'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."readiness_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receiving_waters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "water_body_type" "text",
    "parent_water_body" "text",
    "basin" "text",
    "subbasin" "text",
    "huc_code" "text",
    "state_id" "uuid",
    "tier_classification" "text",
    "designated_uses" "text"[],
    "impaired" boolean DEFAULT false,
    "tmdl_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receiving_waters_water_body_type_check" CHECK (("water_body_type" = ANY (ARRAY['stream'::"text", 'river'::"text", 'creek'::"text", 'lake'::"text", 'reservoir'::"text", 'wetland'::"text", 'ocean'::"text", 'estuary'::"text", 'unnamed_tributary'::"text"])))
);


ALTER TABLE "public"."receiving_waters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."regulatory_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid",
    "agency" "text" NOT NULL,
    "contact_type" "text" NOT NULL,
    "name" "text",
    "title" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "regulatory_contacts_contact_type_check" CHECK (("contact_type" = ANY (ARRAY['permit_writer'::"text", 'enforcement'::"text", 'dmr_support'::"text", 'emergency'::"text", 'inspection'::"text", 'general'::"text", 'legal'::"text", 'technical'::"text"])))
);


ALTER TABLE "public"."regulatory_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."regulatory_deadlines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid",
    "permit_id" "uuid",
    "deadline_type" "text" NOT NULL,
    "description" "text",
    "reference_event" "text",
    "offset_hours" integer,
    "offset_days" integer,
    "day_of_month" integer,
    "form_number" "text",
    "submission_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "regulatory_deadlines_deadline_type_check" CHECK (("deadline_type" = ANY (ARRAY['dmr_submission'::"text", 'quarterly_report'::"text", 'annual_report'::"text", 'noncompliance_oral'::"text", 'noncompliance_written'::"text", 'bypass_anticipated'::"text", 'bypass_unanticipated'::"text", 'upset_oral'::"text", 'upset_written'::"text", 'precip_exemption_claim'::"text", 'wet_notification'::"text", 'biological_survey'::"text", 'effluent_characterization'::"text", 'permit_renewal_application'::"text"])))
);


ALTER TABLE "public"."regulatory_deadlines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_key" "text" NOT NULL,
    "report_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "tier" integer NOT NULL,
    "priority" "text" NOT NULL,
    "formats_available" "text"[] DEFAULT '{pdf,csv}'::"text"[] NOT NULL,
    "prerequisite_condition" "text",
    "prerequisite_table" "text",
    "is_locked" boolean GENERATED ALWAYS AS (("prerequisite_table" IS NOT NULL)) STORED,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "report_definitions_priority_check" CHECK (("priority" = ANY (ARRAY['CRITICAL'::"text", 'HIGH'::"text", 'MEDIUM'::"text"]))),
    CONSTRAINT "report_definitions_tier_check" CHECK ((("tier" >= 1) AND ("tier" <= 5)))
);


ALTER TABLE "public"."report_definitions" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_definitions" IS 'Pre-built report definitions for the Report Engine. 30 reports across 5 tiers.';



CREATE TABLE IF NOT EXISTS "public"."report_delivery_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "report_definition_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "added_by" "uuid",
    "source" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "report_delivery_recipients_source_check" CHECK (("source" = ANY (ARRAY['admin'::"text", 'self_subscribe'::"text"])))
);


ALTER TABLE "public"."report_delivery_recipients" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_delivery_recipients" IS 'Per-report email delivery list. Admin sets defaults; users self-subscribe.';



CREATE TABLE IF NOT EXISTS "public"."report_role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_definition_id" "uuid" NOT NULL,
    "role_name" "text" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."report_role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."report_role_permissions" IS 'Join table: roles x reports. Controls which roles can access which reports.';



CREATE TABLE IF NOT EXISTS "public"."report_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scheduled_report_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "file_path" "text",
    "file_size_bytes" integer,
    "row_count" integer,
    "error_message" "text",
    "triggered_by" "text" DEFAULT 'manual'::"text" NOT NULL,
    "triggered_by_user" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "report_runs_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['manual'::"text", 'scheduled'::"text", 'api'::"text"])))
);


ALTER TABLE "public"."report_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "report_definition_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "report_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_shared" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "run_count" integer DEFAULT 0 NOT NULL,
    "last_run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."report_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retention_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "record_type" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "retention_years" integer NOT NULL,
    "regulatory_basis" "text" NOT NULL,
    "is_enforced" boolean DEFAULT false NOT NULL,
    "last_audit_at" timestamp with time zone,
    "records_within_policy" integer,
    "records_outside_policy" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "records_on_hold" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."retention_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roadmap_sync_events" (
    "id" bigint NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direction" "text" NOT NULL,
    "task_id" "text",
    "linear_issue_id" "text",
    "action" "text" NOT NULL,
    "changed_fields" "jsonb",
    "error_message" "text",
    "webhook_id" "text",
    "actor" "text",
    CONSTRAINT "roadmap_sync_events_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'comment'::"text", 'skip'::"text", 'error'::"text", 'adopt'::"text"]))),
    CONSTRAINT "roadmap_sync_events_direction_check" CHECK (("direction" = ANY (ARRAY['supabase_to_linear'::"text", 'linear_to_supabase'::"text", 'reconcile'::"text", 'pr_merge_comment'::"text"])))
);


ALTER TABLE "public"."roadmap_sync_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."roadmap_sync_events" IS 'Append-only log of every sync action between roadmap_tasks and Linear. Used for debugging, reconciliation, and metrics.';



ALTER TABLE "public"."roadmap_sync_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."roadmap_sync_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sampling_calendar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "parameter_id" "uuid" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "window_start" "date",
    "window_end" "date",
    "sampling_event_id" "uuid",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "skip_reason" "text",
    "reminder_sent" boolean DEFAULT false,
    "overdue_alert_sent" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "dispatch_status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "current_field_visit_id" "uuid",
    "route_zone" "text",
    "default_assigned_to" "uuid",
    "override_reason" "text",
    "source_calendar_id" "uuid",
    "current_route_batch_id" "uuid",
    CONSTRAINT "sampling_calendar_dispatch_status_check" CHECK (("dispatch_status" = ANY (ARRAY['ready'::"text", 'dispatched'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text", 'exception'::"text"]))),
    CONSTRAINT "sampling_calendar_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'overdue'::"text", 'completed'::"text", 'skipped'::"text", 'no_discharge'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."sampling_calendar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sampling_calendar_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "calendar_id" "uuid" NOT NULL,
    "adjustment_type" "text" NOT NULL,
    "prior_scheduled_date" "date",
    "new_scheduled_date" "date",
    "reason" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sampling_calendar_adjustments_adjustment_type_check" CHECK (("adjustment_type" = ANY (ARRAY['manual_entry'::"text", 'rain_event'::"text", 'skip'::"text", 'reschedule'::"text", 'makeup'::"text"])))
);


ALTER TABLE "public"."sampling_calendar_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sampling_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "sampled_by" "uuid",
    "sample_date" "date" NOT NULL,
    "sample_time" time without time zone DEFAULT '00:00:00'::time without time zone,
    "sample_type" "text",
    "field_notes" "text",
    "weather_conditions" "text",
    "chain_of_custody_id" "text",
    "lab_name" "text",
    "lab_received_date" "date",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "precipitation_event_id" "uuid",
    "is_precipitation_sample" boolean DEFAULT false,
    "precipitation_inches_24hr" numeric,
    CONSTRAINT "sampling_events_sample_type_check" CHECK (("sample_type" = ANY (ARRAY['grab'::"text", 'composite_24hr'::"text", 'composite_flow'::"text", 'calculated'::"text", 'continuous'::"text"]))),
    CONSTRAINT "sampling_events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_lab'::"text", 'results_received'::"text", 'validated'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."sampling_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sampling_route_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "route_date" "date" NOT NULL,
    "route_zone" "text" NOT NULL,
    "assigned_to" "uuid",
    "route_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "readiness_gate_passed" boolean,
    "readiness_override_by" "uuid",
    "readiness_override_reason" "text",
    "readiness_checked_at" timestamp with time zone,
    CONSTRAINT "sampling_route_batches_route_status_check" CHECK (("route_status" = ANY (ARRAY['draft'::"text", 'dispatched'::"text", 'in_progress'::"text", 'completed'::"text", 'exception'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."sampling_route_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sampling_route_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_batch_id" "uuid" NOT NULL,
    "calendar_id" "uuid" NOT NULL,
    "stop_sequence" integer NOT NULL,
    "priority_rank" integer DEFAULT 100 NOT NULL,
    "priority_reason" "text",
    "estimated_drive_minutes" integer,
    "stop_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sampling_route_stops_stop_sequence_check" CHECK (("stop_sequence" > 0)),
    CONSTRAINT "sampling_route_stops_stop_status_check" CHECK (("stop_status" = ANY (ARRAY['pending'::"text", 'dispatched'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text", 'exception'::"text"])))
);


ALTER TABLE "public"."sampling_route_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sampling_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permit_id" "uuid" NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "parameter_id" "uuid" NOT NULL,
    "frequency_code" "text" NOT NULL,
    "frequency_description" "text",
    "sample_type" "text" DEFAULT 'grab'::"text" NOT NULL,
    "min_days_between_samples" integer,
    "max_samples_per_period" integer,
    "period_type" "text" DEFAULT 'month'::"text",
    "seasonal_restriction" "text",
    "condition_restriction" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "route_zone" "text",
    "default_assigned_to" "uuid",
    "schedule_anchor_date" "date",
    "preferred_day_of_week" smallint,
    "preferred_day_of_month" smallint,
    "secondary_day_of_month" smallint,
    "instructions" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "rain_event_trigger" "jsonb",
    CONSTRAINT "sampling_schedules_period_type_check" CHECK (("period_type" = ANY (ARRAY['day'::"text", 'week'::"text", 'month'::"text", 'quarter'::"text", 'year'::"text", 'per_term'::"text"]))),
    CONSTRAINT "sampling_schedules_preferred_day_of_month_check" CHECK ((("preferred_day_of_month" >= 1) AND ("preferred_day_of_month" <= 31))),
    CONSTRAINT "sampling_schedules_preferred_day_of_week_check" CHECK ((("preferred_day_of_week" >= 0) AND ("preferred_day_of_week" <= 6))),
    CONSTRAINT "sampling_schedules_sample_type_check" CHECK (("sample_type" = ANY (ARRAY['grab'::"text", 'composite_24hr'::"text", 'composite_flow'::"text", 'calculated'::"text", 'continuous'::"text", 'estimation'::"text"]))),
    CONSTRAINT "sampling_schedules_secondary_day_of_month_check" CHECK ((("secondary_day_of_month" >= 1) AND ("secondary_day_of_month" <= 31)))
);


ALTER TABLE "public"."sampling_schedules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sampling_schedules"."rain_event_trigger" IS 'Per-outfall rain event trigger config: rainfall_threshold_inches, trigger_window_hours, discharge_required, field_confirmation_required, max_sample_delay_hours, recurrence_interval_years';



CREATE TABLE IF NOT EXISTS "public"."scheduled_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "report_definition_id" "uuid" NOT NULL,
    "report_config" "jsonb" NOT NULL,
    "cron_expression" "text" NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "last_run_at" timestamp with time zone,
    "next_run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scheduled_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."scheduled_reports" IS 'Recurring report configurations for pg_cron scheduler.';



CREATE TABLE IF NOT EXISTS "public"."site_weather_station_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "weather_station_id" "uuid" NOT NULL,
    "distance_miles" numeric(5,1),
    "is_primary" boolean DEFAULT false NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."site_weather_station_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "state_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "site_type" "text" NOT NULL,
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "zip" "text",
    "county" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sites_site_type_check" CHECK (("site_type" = ANY (ARRAY['surface_mine'::"text", 'underground_mine'::"text", 'prep_plant'::"text", 'loadout'::"text", 'reclamation'::"text", 'office'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."sites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_execution_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "skill_name" "text" NOT NULL,
    "suite" "text",
    "chain_name" "text",
    "chain_position" integer,
    "trigger_type" "text" NOT NULL,
    "agent" "text" DEFAULT 'jarvis_coo'::"text" NOT NULL,
    "mode" "text" NOT NULL,
    "duration_ms" integer,
    "tokens_used" integer,
    "status" "text" NOT NULL,
    "output_summary" "text",
    "error_message" "text",
    "context_window_usage" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."skill_execution_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "skill_name" "text" NOT NULL,
    "correction_type" "text" NOT NULL,
    "action_taken" "text" NOT NULL,
    "correction" "text" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "learned_rule" "text",
    "applied" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."skill_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skill_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "suite" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "triggers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "gate" "text" DEFAULT 'GREEN'::"text" NOT NULL,
    "chains_to" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "chains_from" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "character" "text",
    "avg_tokens" integer,
    "file_path" "text" NOT NULL,
    "content_hash" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "execution_count" integer DEFAULT 0 NOT NULL,
    "last_executed_at" timestamp with time zone,
    "success_rate" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."skill_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."smoke_test_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "checklist_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "test_name" "text" NOT NULL,
    "module" "text" NOT NULL,
    "test_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "duration_ms" integer,
    "error_message" "text",
    "run_by" "uuid",
    "run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "smoke_test_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'passed'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "smoke_test_runs_test_type_check" CHECK (("test_type" = ANY (ARRAY['manual'::"text", 'automated'::"text", 'integration'::"text"])))
);


ALTER TABLE "public"."smoke_test_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_regulatory_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_id" "uuid" NOT NULL,
    "issuing_agency_name" "text" NOT NULL,
    "issuing_agency_division" "text",
    "dmr_submission_system" "text" NOT NULL,
    "dmr_submission_url" "text",
    "dmr_due_day_of_month" integer,
    "dmr_due_months_after" integer DEFAULT 1,
    "below_detection_calc_rule" "text" DEFAULT 'zero'::"text" NOT NULL,
    "below_detection_dmr_rule" "text" DEFAULT 'zero'::"text" NOT NULL,
    "oral_notification_hours" integer DEFAULT 24,
    "written_notification_days" integer DEFAULT 5,
    "lab_certification_required" "text",
    "default_quantification_levels" "jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."state_regulatory_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stipulated_penalties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exceedance_id" "uuid",
    "enforcement_action_id" "uuid",
    "violation_type" "text" NOT NULL,
    "violation_date" "date" NOT NULL,
    "state_id" "uuid",
    "site_id" "uuid",
    "permit_id" "uuid",
    "daily_penalty_amount" numeric,
    "days_in_violation" integer,
    "total_penalty" numeric,
    "status" "text" DEFAULT 'calculated'::"text" NOT NULL,
    "payment_date" "date",
    "payment_reference" "text",
    "cd_paragraph_reference" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stipulated_penalties_status_check" CHECK (("status" = ANY (ARRAY['calculated'::"text", 'invoiced'::"text", 'paid'::"text", 'disputed'::"text", 'waived'::"text", 'credited'::"text"])))
);


ALTER TABLE "public"."stipulated_penalties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stream_monitoring_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "permit_id" "uuid",
    "location_code" "text" NOT NULL,
    "stream_name" "text" NOT NULL,
    "description" "text",
    "latitude" numeric,
    "longitude" numeric,
    "monitoring_type" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stream_monitoring_locations_monitoring_type_check" CHECK (("monitoring_type" = ANY (ARRAY['biological'::"text", 'chemical'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."stream_monitoring_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stream_monitoring_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "monitoring_date" "date" NOT NULL,
    "monitoring_season" "text",
    "vasci_score" numeric,
    "baseline_vasci_score" numeric,
    "organisms_collected" integer,
    "organisms_identified" integer,
    "results" "jsonb",
    "submitted_date" "date",
    "report_due_date" "date",
    "document_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stream_monitoring_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_health_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "db_size_mb" numeric,
    "table_counts" "jsonb",
    "storage_usage_mb" numeric,
    "active_users_24h" integer,
    "error_count_24h" integer,
    "avg_response_ms" numeric,
    "snapshot_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_health_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "subscription_tier" "text" DEFAULT 'pilot'::"text",
    "subscription_status" "text" DEFAULT 'active'::"text",
    "trial_ends_at" timestamp with time zone,
    "max_sites" integer,
    "max_users" integer,
    "max_permits" integer,
    "primary_contact_id" "uuid",
    "billing_email" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenants_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'trial'::"text", 'suspended'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tenants_subscription_tier_check" CHECK (("subscription_tier" = ANY (ARRAY['pilot'::"text", 'starter'::"text", 'professional'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tom_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "source_id" "text",
    "title" "text",
    "body" "text",
    "sender" "text",
    "recipient" "text",
    "participants" "text"[],
    "timestamp" timestamp with time zone NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "is_read" boolean DEFAULT false,
    "fts_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", ((((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("body", ''::"text")) || ' '::"text") || COALESCE("sender", ''::"text")) || ' '::"text") || COALESCE("recipient", ''::"text")))) STORED,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tom_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "is_certification" boolean DEFAULT false NOT NULL,
    "validity_months" integer,
    "renewal_window_days" integer DEFAULT 30,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_catalog_category_check" CHECK (("category" = ANY (ARRAY['safety'::"text", 'compliance'::"text", 'field_operations'::"text", 'equipment'::"text", 'regulatory'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."training_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "training_id" "uuid" NOT NULL,
    "completed_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expires_at" "date",
    "certificate_storage_path" "text",
    "certificate_file_name" "text",
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_completions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'revoked'::"text", 'pending_verification'::"text"])))
);


ALTER TABLE "public"."training_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "training_id" "uuid" NOT NULL,
    "required_for_roles" "text"[] DEFAULT '{field_sampler}'::"text"[] NOT NULL,
    "is_blocking" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."training_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parameter_id" "uuid",
    "from_unit" "text" NOT NULL,
    "to_unit" "text" NOT NULL,
    "conversion_factor" numeric NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."unit_conversions" OWNER TO "postgres";


COMMENT ON TABLE "public"."unit_conversions" IS 'Unit conversion factors for normalizing lab results to permit limit units during exceedance detection';



COMMENT ON COLUMN "public"."unit_conversions"."parameter_id" IS 'Parameter this conversion applies to (NULL = applies to all parameters)';



COMMENT ON COLUMN "public"."unit_conversions"."from_unit" IS 'Source unit (lab result unit)';



COMMENT ON COLUMN "public"."unit_conversions"."to_unit" IS 'Target unit (permit limit unit)';



COMMENT ON COLUMN "public"."unit_conversions"."conversion_factor" IS 'Multiply by this factor to convert from_unit → to_unit';



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "job_title" "text",
    "organization_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_role_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_role_assignments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_roadmap_sync_health" AS
 SELECT ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks") AS "total_tasks",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."linear_issue_id" IS NOT NULL)) AS "mirrored_tasks",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."linear_sync_status" = 'synced'::"text")) AS "synced_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."linear_sync_status" = 'pending'::"text")) AS "pending_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."linear_sync_status" = 'error'::"text")) AS "error_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."linear_sync_status" = 'skipped'::"text")) AS "skipped_count",
    ( SELECT "max"("roadmap_tasks"."linear_synced_at") AS "max"
           FROM "public"."roadmap_tasks") AS "last_synced_at",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_sync_events"
          WHERE ("roadmap_sync_events"."occurred_at" > ("now"() - '24:00:00'::interval))) AS "events_last_24h",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_sync_events"
          WHERE (("roadmap_sync_events"."occurred_at" > ("now"() - '24:00:00'::interval)) AND ("roadmap_sync_events"."action" = 'error'::"text"))) AS "errors_last_24h",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_sync_events"
          WHERE (("roadmap_sync_events"."occurred_at" > ("now"() - '24:00:00'::interval)) AND ("roadmap_sync_events"."direction" = 'linear_to_supabase'::"text"))) AS "reverse_syncs_24h",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_sync_events"
          WHERE (("roadmap_sync_events"."occurred_at" > ("now"() - '24:00:00'::interval)) AND ("roadmap_sync_events"."direction" = 'supabase_to_linear'::"text"))) AS "forward_syncs_24h",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE (("roadmap_tasks"."linear_sync_status" = 'pending'::"text") AND ("roadmap_tasks"."updated_at" < ("now"() - '01:00:00'::interval)))) AS "stale_pending_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."status" = 'blocked'::"text")) AS "blocked_task_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."status" = 'in_progress'::"text")) AS "in_progress_count",
    ( SELECT "count"(*) AS "count"
           FROM "public"."roadmap_tasks"
          WHERE ("roadmap_tasks"."status" = 'complete'::"text")) AS "complete_count";


ALTER VIEW "public"."v_roadmap_sync_health" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_roadmap_sync_health" IS 'Single row of aggregate roadmap + sync health stats. Intentionally anon/auth readable by SCC-OS frontend for /roadmap/sync-health; does not expose event row details.';



CREATE OR REPLACE VIEW "public"."v_roadmap_tasks_pending_linear_sync" AS
 SELECT "id",
    "organization_id",
    "task_id",
    COALESCE("task_description", "task_id") AS "title",
    "task_description" AS "description",
    "task_description",
    "status",
    "phase",
    "section",
    "owner_type" AS "owner",
    "owner_type",
    NULL::"text" AS "lane",
    "notes",
    NULL::"text" AS "blocked_by",
    "assigned_to",
    "depends_on",
    "unblocks",
    "completed_at",
    "completed_by",
    "linear_issue_id",
    "linear_issue_identifier",
    "linear_url",
    "linear_sync_status",
    "linear_sync_error",
    "linear_sync_attempt_count",
    "updated_at",
    "linear_synced_at"
   FROM "public"."roadmap_tasks"
  WHERE (("linear_sync_status" = ANY (ARRAY['pending'::"text", 'error'::"text"])) AND ("linear_sync_attempt_count" < 5))
  ORDER BY "linear_sync_attempt_count", "updated_at";


ALTER VIEW "public"."v_roadmap_tasks_pending_linear_sync" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_roadmap_tasks_pending_linear_sync" IS 'Tasks that need to be pushed to Linear. Used by the sync runner. Reset linear_sync_attempt_count to retry after 5 failures.';



CREATE TABLE IF NOT EXISTS "public"."vip_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "company" "text",
    "workspace" "text",
    "vip_tier" integer DEFAULT 2 NOT NULL,
    "urgency_boost" integer DEFAULT 20,
    "response_sla_minutes" integer DEFAULT 240,
    "auto_escalate" boolean DEFAULT false,
    "escalate_after_minutes" integer DEFAULT 60,
    "custom_greeting" "text",
    "relationship_notes" "text",
    "last_email_at" timestamp with time zone,
    "email_count_30d" integer DEFAULT 0,
    "avatar_url" "text",
    "is_muted" boolean DEFAULT false,
    "muted_until" timestamp with time zone,
    "user_id" "uuid" DEFAULT '3ccb8364-da19-482e-b3fa-6ee4ed40822b'::"uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "vip_contacts_vip_tier_check" CHECK ((("vip_tier" >= 1) AND ("vip_tier" <= 3))),
    CONSTRAINT "vip_contacts_workspace_check" CHECK (("workspace" = ANY (ARRAY['lewis-insurance'::"text", 'redex'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."vip_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weather_stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "station_id" "text" NOT NULL,
    "station_name" "text" NOT NULL,
    "station_type" "text" NOT NULL,
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "elevation_ft" numeric(7,1),
    "state_code" "text",
    "data_source" "text" NOT NULL,
    "api_endpoint" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "weather_stations_data_source_check" CHECK (("data_source" = ANY (ARRAY['ncei_cdo'::"text", 'nws_api'::"text", 'manual_gauge'::"text", 'iot_gauge'::"text"]))),
    CONSTRAINT "weather_stations_station_type_check" CHECK (("station_type" = ANY (ARRAY['noaa_asos'::"text", 'noaa_coop'::"text", 'noaa_ghcnd'::"text", 'site_gauge'::"text"])))
);


ALTER TABLE "public"."weather_stations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wet_test_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sampling_event_id" "uuid" NOT NULL,
    "outfall_id" "uuid" NOT NULL,
    "test_type" "text" NOT NULL,
    "test_species" "text" NOT NULL,
    "test_method" "text",
    "test_duration_hours" integer,
    "noaec_pct" numeric,
    "noec_pct" numeric,
    "lc50_pct" numeric,
    "ic25_pct" numeric,
    "tuc" numeric,
    "control_survival_pct" numeric,
    "is_valid_test" boolean DEFAULT true NOT NULL,
    "is_pass" boolean,
    "permit_endpoint_pct" numeric,
    "agency_notified" boolean DEFAULT false,
    "agency_notified_date" timestamp with time zone,
    "retest_required" boolean DEFAULT false,
    "retest_due_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wet_test_results_test_species_check" CHECK (("test_species" = ANY (ARRAY['ceriodaphnia_dubia'::"text", 'pimephales_promelas'::"text"]))),
    CONSTRAINT "wet_test_results_test_type_check" CHECK (("test_type" = ANY (ARRAY['acute'::"text", 'chronic'::"text"])))
);


ALTER TABLE "public"."wet_test_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_order_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "notes" "text",
    "photo_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_order_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'assigned'::"text", 'status_changed'::"text", 'priority_changed'::"text", 'note_added'::"text", 'photo_uploaded'::"text", 'reassigned'::"text", 'completed'::"text", 'verified'::"text", 'cancelled'::"text", 'reopened'::"text", 'sla_warning'::"text", 'sla_breach'::"text"])))
);


ALTER TABLE "public"."work_order_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_id" "uuid",
    "site_id" "uuid",
    "outfall_id" "uuid",
    "permit_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "category" "text",
    "assigned_to" "uuid",
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone,
    "due_date" "date",
    "sla_hours" integer,
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "before_photo_path" "text",
    "after_photo_path" "text",
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurrence_count" integer DEFAULT 0 NOT NULL,
    "previous_work_order_id" "uuid",
    "notes" "text",
    "decree_paragraphs" "text"[],
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_orders_category_check" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['equipment_repair'::"text", 'erosion_control'::"text", 'sediment_removal'::"text", 'outfall_maintenance'::"text", 'bmp_installation'::"text", 'signage'::"text", 'access_road'::"text", 'vegetation'::"text", 'structural'::"text", 'other'::"text"])))),
    CONSTRAINT "work_orders_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "work_orders_source_type_check" CHECK (("source_type" = ANY (ARRAY['field_deficiency'::"text", 'inspection'::"text", 'incident'::"text", 'exceedance'::"text", 'manual'::"text"]))),
    CONSTRAINT "work_orders_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'assigned'::"text", 'in_progress'::"text", 'completed'::"text", 'verified'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."work_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."access_issues"
    ADD CONSTRAINT "access_issues_field_visit_id_key" UNIQUE ("field_visit_id");



ALTER TABLE ONLY "public"."access_issues"
    ADD CONSTRAINT "access_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_owner_user_id_handle_key" UNIQUE ("owner_user_id", "handle");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archive_manifest"
    ADD CONSTRAINT "archive_manifest_batch_id_table_name_key" UNIQUE ("batch_id", "table_name");



ALTER TABLE ONLY "public"."archive_manifest"
    ADD CONSTRAINT "archive_manifest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_checklist_items"
    ADD CONSTRAINT "audit_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_checklists"
    ADD CONSTRAINT "audit_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_response_trust"
    ADD CONSTRAINT "auto_response_trust_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_response_trust"
    ADD CONSTRAINT "auto_response_trust_sender_email_key" UNIQUE ("sender_email");



ALTER TABLE ONLY "public"."auto_send_rules"
    ADD CONSTRAINT "auto_send_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_send_rules"
    ADD CONSTRAINT "auto_send_rules_user_id_reply_pattern_key" UNIQUE ("user_id", "reply_pattern");



ALTER TABLE ONLY "public"."bottle_kit_inventory"
    ADD CONSTRAINT "bottle_kit_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."build_jobs"
    ADD CONSTRAINT "build_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calibration_logs"
    ADD CONSTRAINT "calibration_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_audits"
    ADD CONSTRAINT "compliance_audits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_snapshots"
    ADD CONSTRAINT "compliance_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conditional_exemptions"
    ADD CONSTRAINT "conditional_exemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_decree_obligations"
    ADD CONSTRAINT "consent_decree_obligations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutover_batches"
    ADD CONSTRAINT "cutover_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_batch_id_row_number_key" UNIQUE ("batch_id", "row_number");



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cutover_matrix_uploads"
    ADD CONSTRAINT "cutover_matrix_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_readiness_checklists"
    ADD CONSTRAINT "daily_readiness_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_readiness_checklists"
    ADD CONSTRAINT "daily_readiness_checklists_user_id_checklist_date_key" UNIQUE ("user_id", "checklist_date");



ALTER TABLE ONLY "public"."data_corrections"
    ADD CONSTRAINT "data_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_integrity_checks"
    ADD CONSTRAINT "data_integrity_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "dc_doc_chunk_unique" UNIQUE ("document_id", "chunk_index");



ALTER TABLE ONLY "public"."deployment_stages"
    ADD CONSTRAINT "deployment_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digest_deliveries"
    ADD CONSTRAINT "digest_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digest_deliveries"
    ADD CONSTRAINT "digest_deliveries_user_id_digest_type_digest_date_key" UNIQUE ("user_id", "digest_type", "digest_date");



ALTER TABLE ONLY "public"."digest_queue"
    ADD CONSTRAINT "digest_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digest_queue"
    ADD CONSTRAINT "digest_queue_triage_id_key" UNIQUE ("triage_id");



ALTER TABLE ONLY "public"."discrepancy_reviews"
    ADD CONSTRAINT "discrepancy_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dmr_line_items"
    ADD CONSTRAINT "dmr_line_items_dmr_submission_id_outfall_id_parameter_id_key" UNIQUE ("dmr_submission_id", "outfall_id", "parameter_id");



ALTER TABLE ONLY "public"."dmr_line_items"
    ADD CONSTRAINT "dmr_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dmr_submissions"
    ADD CONSTRAINT "dmr_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_completeness"
    ADD CONSTRAINT "doc_completeness_unique" UNIQUE ("organization_id", "permit_id", "document_type");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_completeness"
    ADD CONSTRAINT "document_completeness_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_delegation_rules"
    ADD CONSTRAINT "email_delegation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_delegation_rules"
    ADD CONSTRAINT "email_delegation_rules_user_id_rule_name_key" UNIQUE ("user_id", "rule_name");



ALTER TABLE ONLY "public"."email_drafts"
    ADD CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_intel_items"
    ADD CONSTRAINT "email_intel_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_intel"
    ADD CONSTRAINT "email_intel_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_noise_rules"
    ADD CONSTRAINT "email_noise_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_sender_trust"
    ADD CONSTRAINT "email_sender_trust_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_sender_trust"
    ADD CONSTRAINT "email_sender_trust_sender_email_account_id_key" UNIQUE ("sender_email", "account_id");



ALTER TABLE ONLY "public"."email_sync_state"
    ADD CONSTRAINT "email_sync_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_triage_config"
    ADD CONSTRAINT "email_triage_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_triage_config"
    ADD CONSTRAINT "email_triage_config_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."email_triage"
    ADD CONSTRAINT "email_triage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_voice_profile"
    ADD CONSTRAINT "email_voice_profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_watch_senders"
    ADD CONSTRAINT "email_watch_senders_email_address_key" UNIQUE ("email_address");



ALTER TABLE ONLY "public"."email_watch_senders"
    ADD CONSTRAINT "email_watch_senders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_whitelist"
    ADD CONSTRAINT "email_whitelist_match_value_key" UNIQUE ("match_value");



ALTER TABLE ONLY "public"."email_whitelist"
    ADD CONSTRAINT "email_whitelist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_procedures"
    ADD CONSTRAINT "emergency_procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enforcement_actions"
    ADD CONSTRAINT "enforcement_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."epa_parameter_code_map"
    ADD CONSTRAINT "epa_code_map_unique" UNIQUE ("epa_code");



ALTER TABLE ONLY "public"."epa_parameter_code_map"
    ADD CONSTRAINT "epa_parameter_code_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_catalog"
    ADD CONSTRAINT "equipment_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_chain_steps"
    ADD CONSTRAINT "escalation_chain_steps_chain_id_step_number_key" UNIQUE ("chain_id", "step_number");



ALTER TABLE ONLY "public"."escalation_chain_steps"
    ADD CONSTRAINT "escalation_chain_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_chains"
    ADD CONSTRAINT "escalation_chains_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."escalation_chains"
    ADD CONSTRAINT "escalation_chains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_echo_dmrs"
    ADD CONSTRAINT "external_echo_dmrs_organization_id_npdes_id_outfall_paramet_key" UNIQUE ("organization_id", "npdes_id", "outfall", "parameter_code", "statistical_base", "monitoring_period_end");



ALTER TABLE ONLY "public"."external_echo_dmrs"
    ADD CONSTRAINT "external_echo_dmrs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_echo_facilities"
    ADD CONSTRAINT "external_echo_facilities_organization_id_npdes_id_key" UNIQUE ("organization_id", "npdes_id");



ALTER TABLE ONLY "public"."external_echo_facilities"
    ADD CONSTRAINT "external_echo_facilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_msha_inspections"
    ADD CONSTRAINT "external_msha_inspections_organization_id_mine_id_event_num_key" UNIQUE ("organization_id", "mine_id", "event_number");



ALTER TABLE ONLY "public"."external_msha_inspections"
    ADD CONSTRAINT "external_msha_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_sync_log"
    ADD CONSTRAINT "external_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_evidence_assets"
    ADD CONSTRAINT "field_evidence_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_measurements"
    ADD CONSTRAINT "field_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_outbound_sync_log"
    ADD CONSTRAINT "field_outbound_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_processing_queue"
    ADD CONSTRAINT "file_processing_queue_org_hash_bucket_key" UNIQUE ("organization_id", "file_hash", "storage_bucket");



ALTER TABLE ONLY "public"."file_processing_queue"
    ADD CONSTRAINT "file_processing_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fish_tissue_results"
    ADD CONSTRAINT "fish_tissue_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fts_monthly_totals"
    ADD CONSTRAINT "fts_monthly_totals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fts_monthly_totals"
    ADD CONSTRAINT "fts_monthly_totals_upload_id_state_monitoring_year_monitori_key" UNIQUE ("upload_id", "state", "monitoring_year", "monitoring_month");



ALTER TABLE ONLY "public"."fts_uploads"
    ADD CONSTRAINT "fts_uploads_organization_id_quarter_year_key" UNIQUE ("organization_id", "quarter", "year");



ALTER TABLE ONLY "public"."fts_uploads"
    ADD CONSTRAINT "fts_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fts_violations"
    ADD CONSTRAINT "fts_violations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."go_live_checklist_items"
    ADD CONSTRAINT "go_live_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."go_live_checklists"
    ADD CONSTRAINT "go_live_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."go_live_sign_offs"
    ADD CONSTRAINT "go_live_sign_offs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_escalation_config"
    ADD CONSTRAINT "governance_escalation_config_organization_id_issue_type_ste_key" UNIQUE ("organization_id", "issue_type", "step_number");



ALTER TABLE ONLY "public"."governance_escalation_config"
    ADD CONSTRAINT "governance_escalation_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_issue_events"
    ADD CONSTRAINT "governance_issue_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_reviews"
    ADD CONSTRAINT "governance_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."handoff_history"
    ADD CONSTRAINT "handoff_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."human_overrides"
    ADD CONSTRAINT "human_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_events"
    ADD CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_types"
    ADD CONSTRAINT "incident_types_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."incident_types"
    ADD CONSTRAINT "incident_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."innovation_actions"
    ADD CONSTRAINT "innovation_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."innovation_enrichment_tasks"
    ADD CONSTRAINT "innovation_enrichment_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."innovation_grade_runs"
    ADD CONSTRAINT "innovation_grade_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."innovation_ideas"
    ADD CONSTRAINT "innovation_ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."innovation_packs"
    ADD CONSTRAINT "innovation_packs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_user_id_provider_connection_name_key" UNIQUE ("user_id", "provider", "connection_name");



ALTER TABLE ONLY "public"."keyword_alert_rules"
    ADD CONSTRAINT "keyword_alert_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_targets"
    ADD CONSTRAINT "kpi_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_targets"
    ADD CONSTRAINT "kpi_targets_unique" UNIQUE ("organization_id", "kpi_key");



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_holds"
    ADD CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_program_roster"
    ADD CONSTRAINT "live_program_roster_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_logs"
    ADD CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."no_discharge_events"
    ADD CONSTRAINT "no_discharge_events_field_visit_id_key" UNIQUE ("field_visit_id");



ALTER TABLE ONLY "public"."no_discharge_events"
    ADD CONSTRAINT "no_discharge_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_module_event_type_key" UNIQUE ("user_id", "module", "event_type");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nov_records"
    ADD CONSTRAINT "nov_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npdes_id_overrides"
    ADD CONSTRAINT "npdes_id_overrides_organization_id_source_permit_id_key" UNIQUE ("organization_id", "source_permit_id");



ALTER TABLE ONLY "public"."npdes_id_overrides"
    ADD CONSTRAINT "npdes_id_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."npdes_permits"
    ADD CONSTRAINT "npdes_permits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."obligation_evidence"
    ADD CONSTRAINT "obligation_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outfall_aliases"
    ADD CONSTRAINT "outfall_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outfall_discharge_log"
    ADD CONSTRAINT "outfall_discharge_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outfall_limit_table_assignments"
    ADD CONSTRAINT "outfall_limit_table_assignments_outfall_id_limit_table_id_key" UNIQUE ("outfall_id", "limit_table_id");



ALTER TABLE ONLY "public"."outfall_limit_table_assignments"
    ADD CONSTRAINT "outfall_limit_table_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outfalls"
    ADD CONSTRAINT "outfalls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outlet_inspections"
    ADD CONSTRAINT "outlet_inspections_field_visit_id_key" UNIQUE ("field_visit_id");



ALTER TABLE ONLY "public"."outlet_inspections"
    ADD CONSTRAINT "outlet_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parameter_aliases"
    ADD CONSTRAINT "parameter_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parameter_aliases"
    ADD CONSTRAINT "parameter_aliases_unique" UNIQUE NULLS NOT DISTINCT ("alias", "state_code");



ALTER TABLE ONLY "public"."parameters"
    ADD CONSTRAINT "parameters_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."parameters"
    ADD CONSTRAINT "parameters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permit_amendments"
    ADD CONSTRAINT "permit_amendments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permit_limit_tables"
    ADD CONSTRAINT "permit_limit_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permit_limits"
    ADD CONSTRAINT "permit_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precipitation_exemptions"
    ADD CONSTRAINT "precipitation_exemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precipitation_readings"
    ADD CONSTRAINT "precipitation_readings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precipitation_readings"
    ADD CONSTRAINT "precipitation_readings_weather_station_id_reading_date_read_key" UNIQUE ("weather_station_id", "reading_date", "reading_time");



ALTER TABLE ONLY "public"."quarterly_reports"
    ADD CONSTRAINT "quarterly_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quarterly_reports"
    ADD CONSTRAINT "quarterly_reports_report_year_report_quarter_key" UNIQUE ("report_year", "report_quarter");



ALTER TABLE ONLY "public"."rca_findings"
    ADD CONSTRAINT "rca_findings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rca_templates"
    ADD CONSTRAINT "rca_templates_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."rca_templates"
    ADD CONSTRAINT "rca_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."readiness_checks"
    ADD CONSTRAINT "readiness_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."readiness_checks"
    ADD CONSTRAINT "readiness_checks_route_batch_id_requirement_id_key" UNIQUE ("route_batch_id", "requirement_id");



ALTER TABLE ONLY "public"."readiness_requirements"
    ADD CONSTRAINT "readiness_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receiving_waters"
    ADD CONSTRAINT "receiving_waters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."regulatory_contacts"
    ADD CONSTRAINT "regulatory_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."regulatory_deadlines"
    ADD CONSTRAINT "regulatory_deadlines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_definitions"
    ADD CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_definitions"
    ADD CONSTRAINT "report_definitions_report_key_key" UNIQUE ("report_key");



ALTER TABLE ONLY "public"."report_delivery_recipients"
    ADD CONSTRAINT "report_delivery_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_delivery_recipients"
    ADD CONSTRAINT "report_delivery_recipients_report_definition_id_email_key" UNIQUE ("report_definition_id", "email");



ALTER TABLE ONLY "public"."report_role_permissions"
    ADD CONSTRAINT "report_role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_role_permissions"
    ADD CONSTRAINT "report_role_permissions_report_definition_id_role_name_key" UNIQUE ("report_definition_id", "role_name");



ALTER TABLE ONLY "public"."report_runs"
    ADD CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retention_policies"
    ADD CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retention_policies"
    ADD CONSTRAINT "retention_unique" UNIQUE ("organization_id", "record_type");



ALTER TABLE ONLY "public"."roadmap_sync_events"
    ADD CONSTRAINT "roadmap_sync_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roadmap_tasks"
    ADD CONSTRAINT "roadmap_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sampling_calendar_adjustments"
    ADD CONSTRAINT "sampling_calendar_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sampling_events"
    ADD CONSTRAINT "sampling_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sampling_route_batches"
    ADD CONSTRAINT "sampling_route_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sampling_route_stops"
    ADD CONSTRAINT "sampling_route_stops_calendar_id_key" UNIQUE ("calendar_id");



ALTER TABLE ONLY "public"."sampling_route_stops"
    ADD CONSTRAINT "sampling_route_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sampling_schedules"
    ADD CONSTRAINT "sampling_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_reports"
    ADD CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_weather_station_assignments"
    ADD CONSTRAINT "site_weather_station_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_weather_station_assignments"
    ADD CONSTRAINT "site_weather_station_assignments_site_id_weather_station_id_key" UNIQUE ("site_id", "weather_station_id");



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_execution_log"
    ADD CONSTRAINT "skill_execution_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_feedback"
    ADD CONSTRAINT "skill_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_registry"
    ADD CONSTRAINT "skill_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skill_registry"
    ADD CONSTRAINT "skill_registry_suite_name_key" UNIQUE ("suite", "name");



ALTER TABLE ONLY "public"."smoke_test_runs"
    ADD CONSTRAINT "smoke_test_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_snapshots"
    ADD CONSTRAINT "snapshots_unique_date" UNIQUE ("organization_id", "snapshot_date", "snapshot_type");



ALTER TABLE ONLY "public"."state_regulatory_configs"
    ADD CONSTRAINT "state_regulatory_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_regulatory_configs"
    ADD CONSTRAINT "state_regulatory_configs_state_id_key" UNIQUE ("state_id");



ALTER TABLE ONLY "public"."states"
    ADD CONSTRAINT "states_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."states"
    ADD CONSTRAINT "states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stipulated_penalties"
    ADD CONSTRAINT "stipulated_penalties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stream_monitoring_locations"
    ADD CONSTRAINT "stream_monitoring_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stream_monitoring_results"
    ADD CONSTRAINT "stream_monitoring_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_health_logs"
    ADD CONSTRAINT "system_health_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."tom_memory"
    ADD CONSTRAINT "tom_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tom_memory"
    ADD CONSTRAINT "tom_memory_source_source_id_key" UNIQUE ("source", "source_id");



ALTER TABLE ONLY "public"."training_catalog"
    ADD CONSTRAINT "training_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_completions"
    ADD CONSTRAINT "training_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_requirements"
    ADD CONSTRAINT "training_requirements_organization_id_training_id_key" UNIQUE ("organization_id", "training_id");



ALTER TABLE ONLY "public"."training_requirements"
    ADD CONSTRAINT "training_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_conversions"
    ADD CONSTRAINT "unit_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_conversions"
    ADD CONSTRAINT "unit_conversions_unique" UNIQUE ("parameter_id", "from_unit", "to_unit");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_role_id_site_id_key" UNIQUE ("user_id", "role_id", "site_id");



ALTER TABLE ONLY "public"."vip_contacts"
    ADD CONSTRAINT "vip_contacts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."vip_contacts"
    ADD CONSTRAINT "vip_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weather_stations"
    ADD CONSTRAINT "weather_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wet_test_results"
    ADD CONSTRAINT "wet_test_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_order_events"
    ADD CONSTRAINT "work_order_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_slug_key" UNIQUE ("slug");



CREATE INDEX "agents_owner_workspace_idx" ON "public"."agents" USING "btree" ("owner_user_id", "workspace_id");



CREATE INDEX "idx_approval_history_record" ON "public"."approval_history" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_archive_manifest_batch" ON "public"."archive_manifest" USING "btree" ("batch_id", "table_name");



CREATE INDEX "idx_audit_log_created" ON "public"."audit_log" USING "btree" ("created_at");



CREATE INDEX "idx_audit_log_module" ON "public"."audit_log" USING "btree" ("module");



CREATE INDEX "idx_audit_log_org" ON "public"."audit_log" USING "btree" ("organization_id");



CREATE INDEX "idx_audit_log_query" ON "public"."audit_log" USING "btree" ("created_at" DESC, "module", "action");



CREATE INDEX "idx_audit_log_record" ON "public"."audit_log" USING "btree" ("record_id");



CREATE INDEX "idx_audit_log_search_rate_limit" ON "public"."audit_log" USING "btree" ("user_id", "action", "created_at") WHERE ("action" = 'compliance_search'::"text");



CREATE INDEX "idx_audit_log_table" ON "public"."audit_log" USING "btree" ("table_name");



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_audits_site" ON "public"."compliance_audits" USING "btree" ("site_id");



CREATE INDEX "idx_audits_status" ON "public"."compliance_audits" USING "btree" ("status");



CREATE INDEX "idx_audits_type" ON "public"."compliance_audits" USING "btree" ("audit_type");



CREATE INDEX "idx_bottle_kit_org" ON "public"."bottle_kit_inventory" USING "btree" ("organization_id");



CREATE INDEX "idx_build_jobs_idea_id" ON "public"."build_jobs" USING "btree" ("idea_id");



CREATE INDEX "idx_build_jobs_status" ON "public"."build_jobs" USING "btree" ("status");



CREATE INDEX "idx_ca_due_date" ON "public"."corrective_actions" USING "btree" ("due_date") WHERE ("status" <> 'closed'::"text");



CREATE INDEX "idx_ca_followup_assigned" ON "public"."corrective_actions" USING "btree" ("followup_assigned_to") WHERE ("followup_assigned_to" IS NOT NULL);



CREATE INDEX "idx_ca_org_status" ON "public"."corrective_actions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_ca_org_status_priority" ON "public"."corrective_actions" USING "btree" ("organization_id", "status", "priority");



CREATE INDEX "idx_ca_organization" ON "public"."corrective_actions" USING "btree" ("organization_id");



CREATE INDEX "idx_ca_source" ON "public"."corrective_actions" USING "btree" ("source_type", "source_id") WHERE ("source_id" IS NOT NULL);



CREATE INDEX "idx_ca_source_incident" ON "public"."corrective_actions" USING "btree" ("source_id") WHERE ("source_type" = 'incident'::"text");



CREATE INDEX "idx_ca_workflow_step" ON "public"."corrective_actions" USING "btree" ("workflow_step");



CREATE INDEX "idx_calibration_logs_due" ON "public"."calibration_logs" USING "btree" ("next_calibration_due") WHERE ("next_calibration_due" IS NOT NULL);



CREATE INDEX "idx_calibration_logs_equipment" ON "public"."calibration_logs" USING "btree" ("equipment_id", "calibrated_at" DESC);



CREATE INDEX "idx_cd_obligations_due" ON "public"."consent_decree_obligations" USING "btree" ("next_due_date");



CREATE INDEX "idx_cd_obligations_status" ON "public"."consent_decree_obligations" USING "btree" ("status");



CREATE INDEX "idx_checklist_items_assigned" ON "public"."audit_checklist_items" USING "btree" ("assigned_to") WHERE ("status" <> ALL (ARRAY['complete'::"text", 'na'::"text"]));



CREATE INDEX "idx_checklist_items_checklist" ON "public"."audit_checklist_items" USING "btree" ("checklist_id", "sort_order");



CREATE INDEX "idx_checklists_org_status" ON "public"."audit_checklists" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_compliance_audits_document_id" ON "public"."compliance_audits" USING "btree" ("document_id");



CREATE INDEX "idx_conditional_exemptions_permit" ON "public"."conditional_exemptions" USING "btree" ("permit_id");



CREATE INDEX "idx_consent_decree_obligations_evidence_document_id" ON "public"."consent_decree_obligations" USING "btree" ("evidence_document_id");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "gin" ("email_addresses");



CREATE INDEX "idx_contacts_user" ON "public"."contacts" USING "btree" ("user_id");



CREATE INDEX "idx_corrective_actions_approved_by" ON "public"."corrective_actions" USING "btree" ("approved_by_id");



CREATE INDEX "idx_corrective_actions_assigned_to" ON "public"."corrective_actions" USING "btree" ("followup_assigned_to") WHERE ("followup_assigned_to" IS NOT NULL);



CREATE INDEX "idx_corrective_actions_classification" ON "public"."corrective_actions" USING "btree" ("classification_level");



CREATE INDEX "idx_corrective_actions_closed_by" ON "public"."corrective_actions" USING "btree" ("closed_by");



CREATE INDEX "idx_corrective_actions_created_by" ON "public"."corrective_actions" USING "btree" ("created_by");



CREATE INDEX "idx_corrective_actions_permit" ON "public"."corrective_actions" USING "btree" ("npdes_permit_id");



CREATE INDEX "idx_corrective_actions_responsible" ON "public"."corrective_actions" USING "btree" ("responsible_person_id");



CREATE INDEX "idx_corrective_actions_site" ON "public"."corrective_actions" USING "btree" ("site_id");



CREATE INDEX "idx_corrective_actions_updated_by" ON "public"."corrective_actions" USING "btree" ("updated_by");



CREATE INDEX "idx_cutover_batches_org_status" ON "public"."cutover_batches" USING "btree" ("organization_id", "status", "effective_at" DESC);



CREATE INDEX "idx_cutover_matrix_rows_batch_status" ON "public"."cutover_matrix_rows" USING "btree" ("batch_id", "disposition", "resolution_status", "row_number");



CREATE INDEX "idx_cutover_matrix_uploads_batch" ON "public"."cutover_matrix_uploads" USING "btree" ("batch_id", "created_at" DESC);



CREATE INDEX "idx_daily_readiness_user_date" ON "public"."daily_readiness_checklists" USING "btree" ("user_id", "checklist_date" DESC);



CREATE INDEX "idx_data_corrections_entity" ON "public"."data_corrections" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_data_corrections_requested_by" ON "public"."data_corrections" USING "btree" ("requested_by");



CREATE INDEX "idx_data_corrections_reviewed_by" ON "public"."data_corrections" USING "btree" ("reviewed_by");



CREATE INDEX "idx_data_corrections_status" ON "public"."data_corrections" USING "btree" ("status", "organization_id");



CREATE INDEX "idx_data_imports_imported_by" ON "public"."data_imports" USING "btree" ("imported_by");



CREATE INDEX "idx_data_imports_rolled_back_by" ON "public"."data_imports" USING "btree" ("rolled_back_by");



CREATE INDEX "idx_data_imports_site" ON "public"."data_imports" USING "btree" ("site_id");



CREATE INDEX "idx_data_imports_status" ON "public"."data_imports" USING "btree" ("status");



CREATE INDEX "idx_dc_document_id" ON "public"."document_chunks" USING "btree" ("document_id");



CREATE INDEX "idx_dc_document_type" ON "public"."document_chunks" USING "btree" ("document_type");



CREATE INDEX "idx_dc_org_id" ON "public"."document_chunks" USING "btree" ("organization_id");



CREATE INDEX "idx_dc_permit_number" ON "public"."document_chunks" USING "btree" ("permit_number");



CREATE INDEX "idx_dc_state_code" ON "public"."document_chunks" USING "btree" ("state_code");



CREATE INDEX "idx_delegation_rules_active" ON "public"."email_delegation_rules" USING "btree" ("user_id", "priority") WHERE ("enabled" = true);



CREATE INDEX "idx_deployment_stages_checklist" ON "public"."deployment_stages" USING "btree" ("checklist_id");



CREATE INDEX "idx_digest_queue_unsent" ON "public"."digest_queue" USING "btree" ("user_id", "digest_window", "created_at") WHERE ("telegram_sent" = false);



CREATE INDEX "idx_digest_queue_window" ON "public"."digest_queue" USING "btree" ("user_id", "digest_window", "urgency_score" DESC);



CREATE INDEX "idx_discrepancy_reviews_escalated_to" ON "public"."discrepancy_reviews" USING "btree" ("escalated_to");



CREATE INDEX "idx_discrepancy_reviews_reviewed_by" ON "public"."discrepancy_reviews" USING "btree" ("reviewed_by");



CREATE INDEX "idx_dmr_line_items_exceedance" ON "public"."dmr_line_items" USING "btree" ("is_exceedance") WHERE ("is_exceedance" = true);



CREATE INDEX "idx_dmr_line_items_outfall" ON "public"."dmr_line_items" USING "btree" ("outfall_id");



CREATE INDEX "idx_dmr_line_items_submission" ON "public"."dmr_line_items" USING "btree" ("dmr_submission_id");



CREATE INDEX "idx_dmr_submissions_approved_by" ON "public"."dmr_submissions" USING "btree" ("approved_by");



CREATE INDEX "idx_dmr_submissions_document" ON "public"."dmr_submissions" USING "btree" ("document_id");



CREATE INDEX "idx_dmr_submissions_permit" ON "public"."dmr_submissions" USING "btree" ("permit_id");



CREATE INDEX "idx_dmr_submissions_status" ON "public"."dmr_submissions" USING "btree" ("status");



CREATE INDEX "idx_dmr_submissions_submitted_by" ON "public"."dmr_submissions" USING "btree" ("submitted_by");



CREATE INDEX "idx_doc_completeness_org" ON "public"."document_completeness" USING "btree" ("organization_id");



CREATE INDEX "idx_doc_completeness_permit" ON "public"."document_completeness" USING "btree" ("permit_id");



CREATE INDEX "idx_document_chunks_queue_entry_id" ON "public"."document_chunks" USING "btree" ("queue_entry_id");



CREATE INDEX "idx_document_chunks_site_id" ON "public"."document_chunks" USING "btree" ("site_id");



CREATE INDEX "idx_documents_metadata" ON "public"."documents" USING "gin" ("metadata");



CREATE INDEX "idx_documents_module" ON "public"."documents" USING "btree" ("module");



CREATE INDEX "idx_documents_org" ON "public"."documents" USING "btree" ("organization_id");



CREATE INDEX "idx_documents_site" ON "public"."documents" USING "btree" ("site_id");



CREATE INDEX "idx_documents_state" ON "public"."documents" USING "btree" ("state_id");



CREATE INDEX "idx_documents_type" ON "public"."documents" USING "btree" ("document_type");



CREATE INDEX "idx_documents_uploaded_by" ON "public"."documents" USING "btree" ("uploaded_by");



CREATE UNIQUE INDEX "idx_dr_dedup" ON "public"."discrepancy_reviews" USING "btree" ("organization_id", "source", "discrepancy_type", "npdes_id", "monitoring_period_end", "external_source_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text"]));



CREATE INDEX "idx_dr_detected" ON "public"."discrepancy_reviews" USING "btree" ("detected_at" DESC);



CREATE INDEX "idx_dr_npdes" ON "public"."discrepancy_reviews" USING "btree" ("npdes_id");



CREATE INDEX "idx_dr_org" ON "public"."discrepancy_reviews" USING "btree" ("organization_id");



CREATE INDEX "idx_dr_resolved_at" ON "public"."discrepancy_reviews" USING "btree" ("resolved_at") WHERE ("resolved_at" IS NOT NULL);



CREATE INDEX "idx_dr_reviewed_at" ON "public"."discrepancy_reviews" USING "btree" ("reviewed_at") WHERE ("reviewed_at" IS NOT NULL);



CREATE INDEX "idx_dr_severity" ON "public"."discrepancy_reviews" USING "btree" ("severity");



CREATE INDEX "idx_dr_source" ON "public"."discrepancy_reviews" USING "btree" ("source");



CREATE INDEX "idx_dr_status" ON "public"."discrepancy_reviews" USING "btree" ("status");



CREATE INDEX "idx_dr_type" ON "public"."discrepancy_reviews" USING "btree" ("discrepancy_type");



CREATE INDEX "idx_eed_facility" ON "public"."external_echo_dmrs" USING "btree" ("facility_id");



CREATE INDEX "idx_eed_npdes_id" ON "public"."external_echo_dmrs" USING "btree" ("npdes_id");



CREATE INDEX "idx_eed_org_id" ON "public"."external_echo_dmrs" USING "btree" ("organization_id");



CREATE INDEX "idx_eed_param_code" ON "public"."external_echo_dmrs" USING "btree" ("parameter_code");



CREATE INDEX "idx_eed_period" ON "public"."external_echo_dmrs" USING "btree" ("monitoring_period_end");



CREATE INDEX "idx_eed_violation" ON "public"."external_echo_dmrs" USING "btree" ("violation_code") WHERE ("violation_code" IS NOT NULL);



CREATE INDEX "idx_eef_compliance" ON "public"."external_echo_facilities" USING "btree" ("compliance_status");



CREATE INDEX "idx_eef_npdes_id" ON "public"."external_echo_facilities" USING "btree" ("npdes_id");



CREATE INDEX "idx_eef_org_id" ON "public"."external_echo_facilities" USING "btree" ("organization_id");



CREATE INDEX "idx_eef_state" ON "public"."external_echo_facilities" USING "btree" ("state_code");



CREATE INDEX "idx_email_drafts_created" ON "public"."email_drafts" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_email_drafts_email" ON "public"."email_drafts" USING "btree" ("email_id");



CREATE UNIQUE INDEX "idx_email_drafts_triage_unique" ON "public"."email_drafts" USING "btree" ("triage_id");



CREATE INDEX "idx_email_drafts_user_pending" ON "public"."email_drafts" USING "btree" ("user_id", "status") WHERE ("status" = 'pending_review'::"text");



CREATE INDEX "idx_email_drafts_user_status" ON "public"."email_drafts" USING "btree" ("user_id", "status");



CREATE INDEX "idx_email_intel_received" ON "public"."email_intel" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_email_intel_sender" ON "public"."email_intel" USING "btree" ("sender_email");



CREATE INDEX "idx_email_intel_urgency" ON "public"."email_intel" USING "btree" ("urgency");



CREATE INDEX "idx_emails_account" ON "public"."emails" USING "btree" ("account_id", "received_at" DESC);



CREATE INDEX "idx_emails_conversation" ON "public"."emails" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "idx_emails_graph_id" ON "public"."emails" USING "btree" ("graph_message_id") WHERE ("graph_message_id" IS NOT NULL);



CREATE INDEX "idx_emails_sender" ON "public"."emails" USING "btree" ("sender_email");



CREATE INDEX "idx_emails_thread" ON "public"."emails" USING "btree" ("thread_key") WHERE ("thread_key" IS NOT NULL);



CREATE INDEX "idx_emails_unread" ON "public"."emails" USING "btree" ("user_id", "is_read") WHERE ("is_read" = false);



CREATE INDEX "idx_emails_user_received" ON "public"."emails" USING "btree" ("user_id", "received_at" DESC);



CREATE INDEX "idx_emerg_contacts_org" ON "public"."emergency_contacts" USING "btree" ("organization_id") WHERE ("is_active" = true);



CREATE INDEX "idx_emerg_contacts_site" ON "public"."emergency_contacts" USING "btree" ("site_id") WHERE ("is_active" = true);



CREATE INDEX "idx_emerg_procedures_org_type" ON "public"."emergency_procedures" USING "btree" ("organization_id", "incident_type") WHERE ("is_active" = true);



CREATE INDEX "idx_emi_date" ON "public"."external_msha_inspections" USING "btree" ("inspection_date");



CREATE INDEX "idx_emi_mine_id" ON "public"."external_msha_inspections" USING "btree" ("mine_id");



CREATE INDEX "idx_emi_org_id" ON "public"."external_msha_inspections" USING "btree" ("organization_id");



CREATE INDEX "idx_enforcement_actions_document" ON "public"."enforcement_actions" USING "btree" ("document_id");



CREATE INDEX "idx_enforcement_actions_outfall" ON "public"."enforcement_actions" USING "btree" ("related_outfall_id");



CREATE INDEX "idx_enforcement_actions_permit" ON "public"."enforcement_actions" USING "btree" ("related_permit_id");



CREATE INDEX "idx_enforcement_org" ON "public"."enforcement_actions" USING "btree" ("organization_id");



CREATE INDEX "idx_enforcement_site" ON "public"."enforcement_actions" USING "btree" ("site_id");



CREATE INDEX "idx_enforcement_state" ON "public"."enforcement_actions" USING "btree" ("state_id");



CREATE INDEX "idx_enforcement_status" ON "public"."enforcement_actions" USING "btree" ("status");



CREATE INDEX "idx_enforcement_type" ON "public"."enforcement_actions" USING "btree" ("action_type");



CREATE INDEX "idx_enrichment_tasks_idea_status" ON "public"."innovation_enrichment_tasks" USING "btree" ("idea_id", "status");



CREATE INDEX "idx_enrichment_tasks_status" ON "public"."innovation_enrichment_tasks" USING "btree" ("status");



CREATE INDEX "idx_epa_code_map_code" ON "public"."epa_parameter_code_map" USING "btree" ("epa_code");



CREATE INDEX "idx_epa_code_map_param" ON "public"."epa_parameter_code_map" USING "btree" ("parameter_id");



CREATE INDEX "idx_equipment_assignments_active" ON "public"."equipment_assignments" USING "btree" ("equipment_id", "assigned_to") WHERE ("returned_at" IS NULL);



CREATE INDEX "idx_equipment_assignments_assigned_by" ON "public"."equipment_assignments" USING "btree" ("assigned_by");



CREATE INDEX "idx_equipment_assignments_assigned_to" ON "public"."equipment_assignments" USING "btree" ("assigned_to") WHERE ("returned_at" IS NULL);



CREATE INDEX "idx_equipment_catalog_org_type" ON "public"."equipment_catalog" USING "btree" ("organization_id", "equipment_type") WHERE ("is_active" = true);



CREATE INDEX "idx_escalation_chain_steps_owner" ON "public"."escalation_chain_steps" USING "btree" ("owner_user_id") WHERE ("owner_user_id" IS NOT NULL);



CREATE INDEX "idx_esl_org" ON "public"."external_sync_log" USING "btree" ("organization_id");



CREATE INDEX "idx_esl_source" ON "public"."external_sync_log" USING "btree" ("source");



CREATE INDEX "idx_esl_started" ON "public"."external_sync_log" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_esl_status" ON "public"."external_sync_log" USING "btree" ("status");



CREATE INDEX "idx_exceedances_acknowledged" ON "public"."exceedances" USING "btree" ("organization_id", "acknowledged_at") WHERE ("acknowledged_at" IS NOT NULL);



CREATE INDEX "idx_exceedances_acknowledged_by" ON "public"."exceedances" USING "btree" ("acknowledged_by");



CREATE INDEX "idx_exceedances_classification" ON "public"."exceedances" USING "btree" ("classification_level");



CREATE INDEX "idx_exceedances_corrective_action" ON "public"."exceedances" USING "btree" ("corrective_action_id");



CREATE INDEX "idx_exceedances_date" ON "public"."exceedances" USING "btree" ("sample_date");



CREATE INDEX "idx_exceedances_detected_at" ON "public"."exceedances" USING "btree" ("organization_id", "detected_at" DESC);



CREATE INDEX "idx_exceedances_exemption" ON "public"."exceedances" USING "btree" ("exemption_id");



CREATE INDEX "idx_exceedances_outfall" ON "public"."exceedances" USING "btree" ("outfall_id");



CREATE INDEX "idx_exceedances_parameter" ON "public"."exceedances" USING "btree" ("parameter_id");



CREATE INDEX "idx_exceedances_resolved_by" ON "public"."exceedances" USING "btree" ("resolved_by");



CREATE INDEX "idx_exceedances_severity" ON "public"."exceedances" USING "btree" ("severity");



CREATE INDEX "idx_exceedances_status" ON "public"."exceedances" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_exceedances_unique" ON "public"."exceedances" USING "btree" ("lab_result_id", "permit_limit_id");



CREATE INDEX "idx_external_sync_log_triggered_by" ON "public"."external_sync_log" USING "btree" ("triggered_by");



CREATE INDEX "idx_field_evidence_issue" ON "public"."field_evidence_assets" USING "btree" ("governance_issue_id", "created_at" DESC);



CREATE INDEX "idx_field_evidence_visit" ON "public"."field_evidence_assets" USING "btree" ("field_visit_id", "created_at" DESC);



CREATE INDEX "idx_field_measurements_visit" ON "public"."field_measurements" USING "btree" ("field_visit_id", "measured_at" DESC);



CREATE INDEX "idx_field_outbound_sync_log_org_synced" ON "public"."field_outbound_sync_log" USING "btree" ("organization_id", "synced_at" DESC);



CREATE INDEX "idx_field_outbound_sync_log_user" ON "public"."field_outbound_sync_log" USING "btree" ("user_id", "synced_at" DESC);



CREATE INDEX "idx_field_visits_assigned_to" ON "public"."field_visits" USING "btree" ("assigned_to", "scheduled_date" DESC);



CREATE INDEX "idx_field_visits_classification" ON "public"."field_visits" USING "btree" ("classification_level");



CREATE INDEX "idx_field_visits_org_date" ON "public"."field_visits" USING "btree" ("organization_id", "scheduled_date" DESC);



CREATE INDEX "idx_field_visits_outfall" ON "public"."field_visits" USING "btree" ("outfall_id", "scheduled_date" DESC);



CREATE INDEX "idx_field_visits_route_batch" ON "public"."field_visits" USING "btree" ("route_batch_id") WHERE ("route_batch_id" IS NOT NULL);



CREATE INDEX "idx_field_visits_status" ON "public"."field_visits" USING "btree" ("organization_id", "visit_status", "scheduled_date" DESC);



CREATE INDEX "idx_fish_tissue_site" ON "public"."fish_tissue_results" USING "btree" ("site_id");



CREATE INDEX "idx_follow_ups_contact" ON "public"."follow_ups" USING "btree" ("contact_email");



CREATE INDEX "idx_follow_ups_overdue" ON "public"."follow_ups" USING "btree" ("user_id", "status") WHERE ("status" = ANY (ARRAY['waiting'::"text", 'overdue'::"text"]));



CREATE INDEX "idx_follow_ups_thread" ON "public"."follow_ups" USING "btree" ("thread_key") WHERE ("thread_key" IS NOT NULL);



CREATE INDEX "idx_follow_ups_waiting" ON "public"."follow_ups" USING "btree" ("user_id", "expected_reply_by") WHERE ("status" = 'waiting'::"text");



CREATE INDEX "idx_fpq_category" ON "public"."file_processing_queue" USING "btree" ("file_category");



CREATE INDEX "idx_fpq_created_at" ON "public"."file_processing_queue" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_fpq_data_import" ON "public"."file_processing_queue" USING "btree" ("data_import_id");



CREATE INDEX "idx_fpq_document" ON "public"."file_processing_queue" USING "btree" ("document_id");



CREATE INDEX "idx_fpq_organization_id" ON "public"."file_processing_queue" USING "btree" ("organization_id");



CREATE INDEX "idx_fpq_state" ON "public"."file_processing_queue" USING "btree" ("state_code");



CREATE INDEX "idx_fpq_status" ON "public"."file_processing_queue" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['uploaded'::"text", 'queued'::"text", 'processing'::"text"]));



CREATE INDEX "idx_fpq_uploaded_by" ON "public"."file_processing_queue" USING "btree" ("uploaded_by");



CREATE INDEX "idx_fts_monthly_totals_lookup" ON "public"."fts_monthly_totals" USING "btree" ("organization_id", "monitoring_year", "monitoring_quarter");



CREATE INDEX "idx_fts_uploads_org" ON "public"."fts_uploads" USING "btree" ("organization_id");



CREATE INDEX "idx_fts_uploads_uploaded_by" ON "public"."fts_uploads" USING "btree" ("uploaded_by");



CREATE INDEX "idx_fts_violations_dnr" ON "public"."fts_violations" USING "btree" ("organization_id", "dnr_number");



CREATE INDEX "idx_fts_violations_org_year_month" ON "public"."fts_violations" USING "btree" ("organization_id", "monitoring_year", "monitoring_month");



CREATE INDEX "idx_fts_violations_state" ON "public"."fts_violations" USING "btree" ("organization_id", "state");



CREATE INDEX "idx_fts_violations_upload_id" ON "public"."fts_violations" USING "btree" ("upload_id");



CREATE INDEX "idx_generated_reports_created_at" ON "public"."generated_reports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_generated_reports_org_id" ON "public"."generated_reports" USING "btree" ("organization_id");



CREATE INDEX "idx_generated_reports_report_def" ON "public"."generated_reports" USING "btree" ("report_definition_id");



CREATE INDEX "idx_generated_reports_status" ON "public"."generated_reports" USING "btree" ("status");



CREATE INDEX "idx_go_live_checklists_org" ON "public"."go_live_checklists" USING "btree" ("organization_id");



CREATE INDEX "idx_go_live_checklists_status" ON "public"."go_live_checklists" USING "btree" ("status");



CREATE INDEX "idx_go_live_items_checklist" ON "public"."go_live_checklist_items" USING "btree" ("checklist_id");



CREATE INDEX "idx_go_live_items_module" ON "public"."go_live_checklist_items" USING "btree" ("module");



CREATE INDEX "idx_go_live_items_status" ON "public"."go_live_checklist_items" USING "btree" ("status");



CREATE INDEX "idx_governance_issue_events_issue" ON "public"."governance_issue_events" USING "btree" ("governance_issue_id", "created_at" DESC);



CREATE INDEX "idx_governance_issues_classification" ON "public"."governance_issues" USING "btree" ("classification_level");



CREATE INDEX "idx_governance_issues_org_status" ON "public"."governance_issues" USING "btree" ("organization_id", "current_status", "raised_at" DESC);



CREATE INDEX "idx_governance_issues_owner" ON "public"."governance_issues" USING "btree" ("current_owner_name", "current_status", "raised_at" DESC);



CREATE INDEX "idx_governance_issues_visit" ON "public"."governance_issues" USING "btree" ("field_visit_id");



CREATE INDEX "idx_governance_reviews_org" ON "public"."governance_reviews" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_handoff_history_created" ON "public"."handoff_history" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_handoff_history_handoff_id" ON "public"."handoff_history" USING "btree" ("handoff_id") WHERE ("handoff_id" IS NOT NULL);



CREATE INDEX "idx_handoff_history_org" ON "public"."handoff_history" USING "btree" ("organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_handoff_history_status" ON "public"."handoff_history" USING "btree" ("status") WHERE ("status" = 'pending_review'::"text");



CREATE INDEX "idx_handoff_history_user" ON "public"."handoff_history" USING "btree" ("user_id");



CREATE INDEX "idx_health_logs_org" ON "public"."system_health_logs" USING "btree" ("organization_id", "snapshot_at" DESC);



CREATE INDEX "idx_human_overrides_entity" ON "public"."human_overrides" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_incident_events_actor" ON "public"."incident_events" USING "btree" ("actor_user_id") WHERE ("actor_user_id" IS NOT NULL);



CREATE INDEX "idx_incident_events_incident" ON "public"."incident_events" USING "btree" ("incident_id", "created_at" DESC);



CREATE INDEX "idx_incidents_corrective_action" ON "public"."incidents" USING "btree" ("corrective_action_id") WHERE ("corrective_action_id" IS NOT NULL);



CREATE INDEX "idx_incidents_countdown" ON "public"."incidents" USING "btree" ("countdown_expires_at") WHERE (("countdown_expires_at" IS NOT NULL) AND ("status" <> ALL (ARRAY['closed'::"public"."incident_status", 'closed_no_action'::"public"."incident_status"])) AND ("countdown_paused" = false));



CREATE INDEX "idx_incidents_current_owner" ON "public"."incidents" USING "btree" ("current_owner_user_id") WHERE ("current_owner_user_id" IS NOT NULL);



CREATE INDEX "idx_incidents_field_visit" ON "public"."incidents" USING "btree" ("field_visit_id") WHERE ("field_visit_id" IS NOT NULL);



CREATE INDEX "idx_incidents_legacy" ON "public"."incidents" USING "btree" ("legacy_governance_issue_id") WHERE ("legacy_governance_issue_id" IS NOT NULL);



CREATE INDEX "idx_incidents_org_status" ON "public"."incidents" USING "btree" ("organization_id", "status", "severity") WHERE ("status" <> ALL (ARRAY['closed'::"public"."incident_status", 'closed_no_action'::"public"."incident_status"]));



CREATE INDEX "idx_incidents_reported_by" ON "public"."incidents" USING "btree" ("reported_by") WHERE ("reported_by" IS NOT NULL);



CREATE INDEX "idx_incidents_type" ON "public"."incidents" USING "btree" ("incident_type_id");



CREATE INDEX "idx_innovation_actions_created_at" ON "public"."innovation_actions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_innovation_actions_idea_id" ON "public"."innovation_actions" USING "btree" ("idea_id");



CREATE INDEX "idx_innovation_actions_pack_id" ON "public"."innovation_actions" USING "btree" ("pack_id");



CREATE INDEX "idx_innovation_grade_runs_idea_id" ON "public"."innovation_grade_runs" USING "btree" ("idea_id");



CREATE INDEX "idx_innovation_ideas_grade" ON "public"."innovation_ideas" USING "btree" ("grade");



CREATE INDEX "idx_innovation_ideas_pack_id" ON "public"."innovation_ideas" USING "btree" ("pack_id");



CREATE UNIQUE INDEX "idx_innovation_ideas_pack_ordinal" ON "public"."innovation_ideas" USING "btree" ("pack_id", "ordinal");



CREATE INDEX "idx_innovation_ideas_status" ON "public"."innovation_ideas" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_innovation_packs_run_date" ON "public"."innovation_packs" USING "btree" ("run_date");



CREATE INDEX "idx_innovation_packs_status" ON "public"."innovation_packs" USING "btree" ("status");



CREATE INDEX "idx_integrity_checks_org" ON "public"."data_integrity_checks" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_intel_items_intel" ON "public"."email_intel_items" USING "btree" ("intel_id");



CREATE INDEX "idx_intel_items_status" ON "public"."email_intel_items" USING "btree" ("item_type", "status");



CREATE INDEX "idx_intel_items_type" ON "public"."email_intel_items" USING "btree" ("item_type");



CREATE INDEX "idx_kpi_targets_org" ON "public"."kpi_targets" USING "btree" ("organization_id") WHERE ("is_active" = true);



CREATE INDEX "idx_lab_results_event_parameter" ON "public"."lab_results" USING "btree" ("sampling_event_id", "parameter_id");



COMMENT ON INDEX "public"."idx_lab_results_event_parameter" IS 'Compound index for queries filtering by event + parameter. Improves upsert conflict detection.';



CREATE INDEX "idx_lab_results_import_not_null" ON "public"."lab_results" USING "btree" ("import_id") WHERE ("import_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_lab_results_import_not_null" IS 'Partial index for import rollback and audit queries. Excludes null import_ids.';



CREATE INDEX "idx_lab_results_param_event" ON "public"."lab_results" USING "btree" ("parameter_id", "sampling_event_id");



CREATE INDEX "idx_lab_results_parameter" ON "public"."lab_results" USING "btree" ("parameter_id");



CREATE INDEX "idx_lab_results_sampling_event" ON "public"."lab_results" USING "btree" ("sampling_event_id");



CREATE UNIQUE INDEX "idx_lab_results_unique_result" ON "public"."lab_results" USING "btree" ("sampling_event_id", "parameter_id");



COMMENT ON INDEX "public"."idx_lab_results_unique_result" IS 'Unique index for batch upsert conflict detection. Prevents duplicate results per event+parameter.';



CREATE INDEX "idx_legal_holds_active" ON "public"."legal_holds" USING "btree" ("entity_type", "entity_id") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "idx_legal_holds_unique_active" ON "public"."legal_holds" USING "btree" ("entity_type", "entity_id") WHERE ("is_active" = true);



CREATE INDEX "idx_live_program_roster_org_batch" ON "public"."live_program_roster" USING "btree" ("organization_id", "cutover_batch_id", "state_code");



CREATE INDEX "idx_live_program_roster_org_site" ON "public"."live_program_roster" USING "btree" ("organization_id", "site_id");



CREATE INDEX "idx_maintenance_logs_equipment" ON "public"."maintenance_logs" USING "btree" ("equipment_id", "performed_at" DESC);



CREATE INDEX "idx_maintenance_logs_performed_by" ON "public"."maintenance_logs" USING "btree" ("performed_by") WHERE ("performed_by" IS NOT NULL);



CREATE INDEX "idx_noise_rules_account" ON "public"."email_noise_rules" USING "btree" ("account_id") WHERE ("enabled" = true);



CREATE INDEX "idx_noise_rules_type_enabled" ON "public"."email_noise_rules" USING "btree" ("rule_type", "enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_notifications_module" ON "public"."notifications" USING "btree" ("module");



CREATE INDEX "idx_notifications_org_event" ON "public"."notifications" USING "btree" ("organization_id", "event_type", "created_at" DESC);



CREATE INDEX "idx_notifications_recipient_unread" ON "public"."notifications" USING "btree" ("recipient_id", "created_at" DESC) WHERE (("in_app_read_at" IS NULL) AND ("dismissed_at" IS NULL));



CREATE INDEX "idx_notifications_status" ON "public"."notifications" USING "btree" ("status");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_nov_response_due" ON "public"."nov_records" USING "btree" ("response_due_date") WHERE ("response_status" = ANY (ARRAY['pending'::"text", 'drafting'::"text"]));



CREATE INDEX "idx_npdes_id_overrides_created_by" ON "public"."npdes_id_overrides" USING "btree" ("created_by");



CREATE INDEX "idx_npdes_overrides_org_state" ON "public"."npdes_id_overrides" USING "btree" ("organization_id", "state_code");



CREATE INDEX "idx_npdes_overrides_source" ON "public"."npdes_id_overrides" USING "btree" ("organization_id", "source_permit_id");



CREATE INDEX "idx_npdes_permits_document" ON "public"."npdes_permits" USING "btree" ("document_id");



CREATE UNIQUE INDEX "idx_npdes_permits_number" ON "public"."npdes_permits" USING "btree" ("permit_number") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_npdes_permits_org" ON "public"."npdes_permits" USING "btree" ("organization_id");



CREATE INDEX "idx_npdes_permits_site" ON "public"."npdes_permits" USING "btree" ("site_id");



CREATE INDEX "idx_npdes_permits_state" ON "public"."npdes_permits" USING "btree" ("state_id");



CREATE INDEX "idx_npdes_permits_status" ON "public"."npdes_permits" USING "btree" ("status");



CREATE INDEX "idx_obligation_evidence_obligation" ON "public"."obligation_evidence" USING "btree" ("obligation_id");



CREATE INDEX "idx_obligation_evidence_org" ON "public"."obligation_evidence" USING "btree" ("organization_id");



CREATE INDEX "idx_organizations_hq_state" ON "public"."organizations" USING "btree" ("headquarters_state");



CREATE INDEX "idx_organizations_parent" ON "public"."organizations" USING "btree" ("parent_id");



CREATE INDEX "idx_organizations_tenant" ON "public"."organizations" USING "btree" ("tenant_id");



CREATE INDEX "idx_outfall_aliases_lookup" ON "public"."outfall_aliases" USING "btree" ("organization_id", "permit_id", "lower"("alias"));



CREATE INDEX "idx_outfall_aliases_outfall_id" ON "public"."outfall_aliases" USING "btree" ("outfall_id");



CREATE UNIQUE INDEX "idx_outfall_aliases_unique_universal" ON "public"."outfall_aliases" USING "btree" ("lower"("alias"), "organization_id") WHERE ("permit_id" IS NULL);



COMMENT ON INDEX "public"."idx_outfall_aliases_unique_universal" IS 'Ensures unique (alias, organization) when permit_id is NULL (universal aliases).';



CREATE UNIQUE INDEX "idx_outfall_aliases_unique_with_permit" ON "public"."outfall_aliases" USING "btree" ("lower"("alias"), "organization_id", "permit_id") WHERE ("permit_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_outfall_aliases_unique_with_permit" IS 'Ensures unique (alias, organization, permit) combinations. Case-insensitive via lower().';



CREATE INDEX "idx_outfall_discharge_log" ON "public"."outfall_discharge_log" USING "btree" ("outfall_id", "discharge_start");



CREATE INDEX "idx_outfalls_permit" ON "public"."outfalls" USING "btree" ("permit_id");



CREATE INDEX "idx_outfalls_receiving_water" ON "public"."outfalls" USING "btree" ("receiving_water_id");



CREATE INDEX "idx_outfalls_site" ON "public"."outfalls" USING "btree" ("site_id");



CREATE INDEX "idx_parameter_aliases_lookup" ON "public"."parameter_aliases" USING "btree" ("lower"("alias"), "state_code");



CREATE INDEX "idx_parameter_aliases_parameter_id" ON "public"."parameter_aliases" USING "btree" ("parameter_id");



CREATE INDEX "idx_parameters_epa_code" ON "public"."parameters" USING "btree" ("epa_parameter_code");



CREATE INDEX "idx_parameters_storet_code" ON "public"."parameters" USING "btree" ("storet_code");



CREATE INDEX "idx_permit_amendments" ON "public"."permit_amendments" USING "btree" ("permit_id");



CREATE INDEX "idx_permit_limit_tables_permit_id" ON "public"."permit_limit_tables" USING "btree" ("permit_id");



CREATE INDEX "idx_permit_limits_active" ON "public"."permit_limits" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_permit_limits_import_batch" ON "public"."permit_limits" USING "btree" ("import_batch_id") WHERE ("import_batch_id" IS NOT NULL);



CREATE INDEX "idx_permit_limits_outfall" ON "public"."permit_limits" USING "btree" ("outfall_id");



CREATE INDEX "idx_permit_limits_parameter" ON "public"."permit_limits" USING "btree" ("parameter_id");



CREATE INDEX "idx_permit_limits_permit" ON "public"."permit_limits" USING "btree" ("permit_id");



CREATE INDEX "idx_permit_limits_permit_outfall" ON "public"."permit_limits" USING "btree" ("permit_id", "outfall_id");



CREATE INDEX "idx_permit_limits_review_status" ON "public"."permit_limits" USING "btree" ("review_status") WHERE ("review_status" <> 'verified'::"text");



CREATE INDEX "idx_permit_limits_reviewed_by" ON "public"."permit_limits" USING "btree" ("reviewed_by");



CREATE INDEX "idx_permit_limits_table" ON "public"."permit_limits" USING "btree" ("limit_table_id");



CREATE UNIQUE INDEX "idx_permit_limits_upsert_key" ON "public"."permit_limits" USING "btree" ("outfall_id", "parameter_id", COALESCE("statistical_base", 'default'::"text"), COALESCE("monitoring_frequency", 'default'::"text"));



COMMENT ON INDEX "public"."idx_permit_limits_upsert_key" IS 'Unique constraint for permit limit upsert: outfall + parameter + statistical_base + frequency. Uses COALESCE for NULL handling.';



CREATE INDEX "idx_precip_events_org_date_status" ON "public"."precipitation_events" USING "btree" ("organization_id", "event_start" DESC, "status");



CREATE INDEX "idx_precip_events_station_id" ON "public"."precipitation_events" USING "btree" ("weather_station_id", "event_start" DESC);



CREATE INDEX "idx_precip_events_status" ON "public"."precipitation_events" USING "btree" ("status") WHERE ("status" = 'alert_generated'::"text");



CREATE INDEX "idx_precip_exemptions_claimed_by" ON "public"."precipitation_exemptions" USING "btree" ("claimed_by");



CREATE INDEX "idx_precip_exemptions_event_id" ON "public"."precipitation_exemptions" USING "btree" ("precipitation_event_id");



CREATE INDEX "idx_precip_exemptions_org_status" ON "public"."precipitation_exemptions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_precip_readings_date" ON "public"."precipitation_readings" USING "btree" ("reading_date" DESC);



CREATE INDEX "idx_precip_readings_station_date" ON "public"."precipitation_readings" USING "btree" ("weather_station_id", "reading_date");



CREATE INDEX "idx_precipitation_events_site" ON "public"."precipitation_events" USING "btree" ("site_id", "event_start");



CREATE INDEX "idx_quarterly_reports_approved_by" ON "public"."quarterly_reports" USING "btree" ("approved_by");



CREATE INDEX "idx_quarterly_reports_document" ON "public"."quarterly_reports" USING "btree" ("document_id");



CREATE INDEX "idx_quarterly_reports_prepared_by" ON "public"."quarterly_reports" USING "btree" ("prepared_by");



CREATE INDEX "idx_rca_findings_ca" ON "public"."rca_findings" USING "btree" ("corrective_action_id");



CREATE INDEX "idx_rca_findings_org" ON "public"."rca_findings" USING "btree" ("organization_id");



CREATE INDEX "idx_rca_findings_template" ON "public"."rca_findings" USING "btree" ("template_id") WHERE ("template_id" IS NOT NULL);



CREATE INDEX "idx_rca_templates_org_category" ON "public"."rca_templates" USING "btree" ("organization_id", "category") WHERE ("is_active" = true);



CREATE INDEX "idx_readiness_checks_batch" ON "public"."readiness_checks" USING "btree" ("route_batch_id");



CREATE INDEX "idx_readiness_checks_requirement" ON "public"."readiness_checks" USING "btree" ("requirement_id");



CREATE INDEX "idx_readiness_requirements_org_active" ON "public"."readiness_requirements" USING "btree" ("organization_id") WHERE ("is_active" = true);



CREATE INDEX "idx_receiving_waters_state" ON "public"."receiving_waters" USING "btree" ("state_id");



CREATE INDEX "idx_regulatory_contacts_state_id" ON "public"."regulatory_contacts" USING "btree" ("state_id");



CREATE INDEX "idx_regulatory_deadlines_permit_id" ON "public"."regulatory_deadlines" USING "btree" ("permit_id");



CREATE INDEX "idx_regulatory_deadlines_state_id" ON "public"."regulatory_deadlines" USING "btree" ("state_id");



CREATE INDEX "idx_report_delivery_active" ON "public"."report_delivery_recipients" USING "btree" ("report_definition_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_report_runs_report" ON "public"."report_runs" USING "btree" ("scheduled_report_id", "created_at" DESC);



CREATE INDEX "idx_report_templates_org_id" ON "public"."report_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_report_templates_report_def" ON "public"."report_templates" USING "btree" ("report_definition_id");



CREATE INDEX "idx_retention_org" ON "public"."retention_policies" USING "btree" ("organization_id");



CREATE INDEX "idx_roadmap_tasks_status" ON "public"."roadmap_tasks" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_roadmap_tasks_task_id" ON "public"."roadmap_tasks" USING "btree" ("organization_id", "task_id");



CREATE INDEX "idx_roadmap_tasks_unblocks" ON "public"."roadmap_tasks" USING "gin" ("unblocks");



CREATE INDEX "idx_sampling_calendar_adjustments_calendar" ON "public"."sampling_calendar_adjustments" USING "btree" ("calendar_id", "created_at" DESC);



CREATE INDEX "idx_sampling_calendar_adjustments_org" ON "public"."sampling_calendar_adjustments" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_sampling_calendar_date" ON "public"."sampling_calendar" USING "btree" ("scheduled_date");



CREATE INDEX "idx_sampling_calendar_event" ON "public"."sampling_calendar" USING "btree" ("sampling_event_id");



CREATE INDEX "idx_sampling_calendar_org_date" ON "public"."sampling_calendar" USING "btree" ("organization_id", "scheduled_date", "status", "dispatch_status");



CREATE INDEX "idx_sampling_calendar_outfall" ON "public"."sampling_calendar" USING "btree" ("outfall_id", "scheduled_date");



CREATE INDEX "idx_sampling_calendar_parameter" ON "public"."sampling_calendar" USING "btree" ("parameter_id");



CREATE INDEX "idx_sampling_calendar_route_batch" ON "public"."sampling_calendar" USING "btree" ("current_route_batch_id");



CREATE INDEX "idx_sampling_calendar_schedule" ON "public"."sampling_calendar" USING "btree" ("schedule_id");



CREATE INDEX "idx_sampling_calendar_status" ON "public"."sampling_calendar" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['scheduled'::"text", 'overdue'::"text"]));



CREATE INDEX "idx_sampling_calendar_visit" ON "public"."sampling_calendar" USING "btree" ("current_field_visit_id");



CREATE INDEX "idx_sampling_calendar_zone" ON "public"."sampling_calendar" USING "btree" ("organization_id", "route_zone", "scheduled_date");



CREATE INDEX "idx_sampling_events_date" ON "public"."sampling_events" USING "btree" ("sample_date");



CREATE INDEX "idx_sampling_events_outfall" ON "public"."sampling_events" USING "btree" ("outfall_id");



CREATE INDEX "idx_sampling_events_outfall_date" ON "public"."sampling_events" USING "btree" ("outfall_id", "sample_date");



COMMENT ON INDEX "public"."idx_sampling_events_outfall_date" IS 'Compound index for outfall-scoped date range queries.';



CREATE INDEX "idx_sampling_events_precip" ON "public"."sampling_events" USING "btree" ("precipitation_event_id");



CREATE INDEX "idx_sampling_events_sampled_by" ON "public"."sampling_events" USING "btree" ("sampled_by");



CREATE INDEX "idx_sampling_events_site" ON "public"."sampling_events" USING "btree" ("site_id");



CREATE INDEX "idx_sampling_events_site_date" ON "public"."sampling_events" USING "btree" ("site_id", "sample_date");



CREATE UNIQUE INDEX "idx_sampling_events_unique_event" ON "public"."sampling_events" USING "btree" ("outfall_id", "sample_date", "sample_time");



CREATE INDEX "idx_sampling_route_batches_assigned" ON "public"."sampling_route_batches" USING "btree" ("assigned_to", "route_date" DESC);



CREATE INDEX "idx_sampling_route_batches_org_date" ON "public"."sampling_route_batches" USING "btree" ("organization_id", "route_date" DESC, "route_zone");



CREATE INDEX "idx_sampling_route_stops_batch" ON "public"."sampling_route_stops" USING "btree" ("route_batch_id", "stop_sequence");



CREATE INDEX "idx_sampling_route_stops_status" ON "public"."sampling_route_stops" USING "btree" ("route_batch_id", "stop_status");



CREATE INDEX "idx_sampling_schedules_default_assigned" ON "public"."sampling_schedules" USING "btree" ("default_assigned_to");



CREATE INDEX "idx_sampling_schedules_org_active" ON "public"."sampling_schedules" USING "btree" ("organization_id", "is_active", "frequency_code");



CREATE INDEX "idx_sampling_schedules_outfall" ON "public"."sampling_schedules" USING "btree" ("outfall_id");



CREATE INDEX "idx_sampling_schedules_parameter" ON "public"."sampling_schedules" USING "btree" ("parameter_id");



CREATE INDEX "idx_sampling_schedules_permit" ON "public"."sampling_schedules" USING "btree" ("permit_id");



CREATE INDEX "idx_scheduled_reports_active" ON "public"."scheduled_reports" USING "btree" ("is_active", "next_run_at") WHERE ("is_active" = true);



CREATE INDEX "idx_scheduled_reports_org" ON "public"."scheduled_reports" USING "btree" ("organization_id") WHERE ("is_active" = true);



CREATE INDEX "idx_scheduled_reports_org_id" ON "public"."scheduled_reports" USING "btree" ("organization_id");



CREATE INDEX "idx_sign_offs_checklist" ON "public"."go_live_sign_offs" USING "btree" ("checklist_id");



CREATE INDEX "idx_sites_org" ON "public"."sites" USING "btree" ("organization_id");



CREATE INDEX "idx_sites_state" ON "public"."sites" USING "btree" ("state_id");



CREATE INDEX "idx_skill_exec_agent" ON "public"."skill_execution_log" USING "btree" ("agent");



CREATE INDEX "idx_skill_exec_created" ON "public"."skill_execution_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_skill_exec_name" ON "public"."skill_execution_log" USING "btree" ("skill_name");



CREATE INDEX "idx_skill_feedback_name" ON "public"."skill_feedback" USING "btree" ("skill_name");



CREATE INDEX "idx_skill_registry_name" ON "public"."skill_registry" USING "btree" ("name");



CREATE INDEX "idx_skill_registry_suite" ON "public"."skill_registry" USING "btree" ("suite");



CREATE INDEX "idx_smoke_tests_checklist" ON "public"."smoke_test_runs" USING "btree" ("checklist_id");



CREATE INDEX "idx_smoke_tests_status" ON "public"."smoke_test_runs" USING "btree" ("status");



CREATE INDEX "idx_snapshots_org_date" ON "public"."compliance_snapshots" USING "btree" ("organization_id", "snapshot_date" DESC);



CREATE INDEX "idx_snapshots_org_type_date" ON "public"."compliance_snapshots" USING "btree" ("organization_id", "snapshot_type", "snapshot_date" DESC);



CREATE INDEX "idx_stip_penalties_enforcement" ON "public"."stipulated_penalties" USING "btree" ("enforcement_action_id");



CREATE INDEX "idx_stip_penalties_exceedance" ON "public"."stipulated_penalties" USING "btree" ("exceedance_id");



CREATE INDEX "idx_stip_penalties_permit" ON "public"."stipulated_penalties" USING "btree" ("permit_id");



CREATE INDEX "idx_stip_penalties_site" ON "public"."stipulated_penalties" USING "btree" ("site_id");



CREATE INDEX "idx_stip_penalties_state" ON "public"."stipulated_penalties" USING "btree" ("state_id");



CREATE INDEX "idx_stipulated_penalties_status" ON "public"."stipulated_penalties" USING "btree" ("status");



CREATE INDEX "idx_swsa_site_primary" ON "public"."site_weather_station_assignments" USING "btree" ("site_id", "is_primary");



CREATE INDEX "idx_swsa_station" ON "public"."site_weather_station_assignments" USING "btree" ("weather_station_id");



CREATE INDEX "idx_tenants_slug" ON "public"."tenants" USING "btree" ("slug");



CREATE INDEX "idx_tom_memory_fts" ON "public"."tom_memory" USING "gin" ("fts_vector");



CREATE INDEX "idx_tom_memory_sender" ON "public"."tom_memory" USING "btree" ("sender");



CREATE INDEX "idx_tom_memory_source" ON "public"."tom_memory" USING "btree" ("source");



CREATE INDEX "idx_tom_memory_timestamp" ON "public"."tom_memory" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_training_catalog_org" ON "public"."training_catalog" USING "btree" ("organization_id") WHERE ("is_active" = true);



CREATE INDEX "idx_training_completions_expiring" ON "public"."training_completions" USING "btree" ("expires_at") WHERE (("status" = 'active'::"text") AND ("expires_at" IS NOT NULL));



CREATE INDEX "idx_training_completions_training" ON "public"."training_completions" USING "btree" ("training_id");



CREATE INDEX "idx_training_completions_user" ON "public"."training_completions" USING "btree" ("user_id", "training_id", "status");



CREATE INDEX "idx_training_completions_verified_by" ON "public"."training_completions" USING "btree" ("verified_by") WHERE ("verified_by" IS NOT NULL);



CREATE INDEX "idx_triage_account" ON "public"."email_triage" USING "btree" ("account_id", "action");



CREATE INDEX "idx_triage_draft_status" ON "public"."email_triage" USING "btree" ("user_id", "draft_status") WHERE ("draft_status" = 'ready'::"text");



CREATE INDEX "idx_triage_email" ON "public"."email_triage" USING "btree" ("email_id");



CREATE UNIQUE INDEX "idx_triage_email_unique" ON "public"."email_triage" USING "btree" ("email_id");



CREATE INDEX "idx_triage_thread" ON "public"."email_triage" USING "btree" ("thread_key") WHERE ("thread_key" IS NOT NULL);



CREATE INDEX "idx_triage_user_date" ON "public"."email_triage" USING "btree" ("user_id", "received_at" DESC);



CREATE INDEX "idx_triage_user_pending" ON "public"."email_triage" USING "btree" ("user_id", "action") WHERE ("action" = 'pending'::"text");



CREATE INDEX "idx_triage_user_tier" ON "public"."email_triage" USING "btree" ("user_id", "tier");



CREATE INDEX "idx_unit_conversions_lookup" ON "public"."unit_conversions" USING "btree" ("parameter_id", "from_unit", "to_unit");



CREATE INDEX "idx_user_profiles_org" ON "public"."user_profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_user_profiles_org_id" ON "public"."user_profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_user_role_assignments_granted_by" ON "public"."user_role_assignments" USING "btree" ("granted_by");



CREATE INDEX "idx_user_roles_site" ON "public"."user_role_assignments" USING "btree" ("site_id");



CREATE INDEX "idx_user_roles_user" ON "public"."user_role_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_violations_date" ON "public"."compliance_violations" USING "btree" ("violation_date" DESC);



CREATE INDEX "idx_violations_org_status" ON "public"."compliance_violations" USING "btree" ("organization_id", "status") WHERE ("status" <> 'closed'::"text");



CREATE INDEX "idx_vip_tier" ON "public"."vip_contacts" USING "btree" ("vip_tier");



CREATE INDEX "idx_vip_workspace" ON "public"."vip_contacts" USING "btree" ("workspace");



CREATE UNIQUE INDEX "idx_voice_profile_unique" ON "public"."email_voice_profile" USING "btree" ("user_id", "profile_type", COALESCE("match_value", '__null__'::"text"));



CREATE INDEX "idx_weather_stations_state" ON "public"."weather_stations" USING "btree" ("state_code") WHERE ("is_active" = true);



CREATE INDEX "idx_weather_stations_tenant_active" ON "public"."weather_stations" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_wet_test_results_outfall" ON "public"."wet_test_results" USING "btree" ("outfall_id");



CREATE INDEX "idx_work_order_events_wo" ON "public"."work_order_events" USING "btree" ("work_order_id");



CREATE INDEX "idx_work_orders_assigned" ON "public"."work_orders" USING "btree" ("assigned_to") WHERE ("status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text"]));



CREATE INDEX "idx_work_orders_assigned_to" ON "public"."work_orders" USING "btree" ("assigned_to");



CREATE INDEX "idx_work_orders_due_date" ON "public"."work_orders" USING "btree" ("due_date");



CREATE INDEX "idx_work_orders_org" ON "public"."work_orders" USING "btree" ("organization_id");



CREATE INDEX "idx_work_orders_org_status" ON "public"."work_orders" USING "btree" ("organization_id", "status") WHERE ("status" <> ALL (ARRAY['completed'::"text", 'verified'::"text", 'cancelled'::"text"]));



CREATE INDEX "idx_work_orders_site" ON "public"."work_orders" USING "btree" ("site_id");



CREATE INDEX "idx_work_orders_source" ON "public"."work_orders" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_work_orders_status" ON "public"."work_orders" USING "btree" ("status");



CREATE INDEX "roadmap_sync_events_direction_action_idx" ON "public"."roadmap_sync_events" USING "btree" ("direction", "action", "occurred_at" DESC);



CREATE INDEX "roadmap_sync_events_occurred_idx" ON "public"."roadmap_sync_events" USING "btree" ("occurred_at" DESC);



CREATE INDEX "roadmap_sync_events_task_idx" ON "public"."roadmap_sync_events" USING "btree" ("task_id", "occurred_at" DESC);



CREATE INDEX "roadmap_tasks_linear_issue_id_idx" ON "public"."roadmap_tasks" USING "btree" ("linear_issue_id") WHERE ("linear_issue_id" IS NOT NULL);



CREATE INDEX "roadmap_tasks_linear_sync_queue_idx" ON "public"."roadmap_tasks" USING "btree" ("updated_at") WHERE ("linear_sync_status" = ANY (ARRAY['pending'::"text", 'error'::"text"]));



CREATE UNIQUE INDEX "uq_field_visits_sampling_calendar_active" ON "public"."field_visits" USING "btree" ("sampling_calendar_id") WHERE (("sampling_calendar_id" IS NOT NULL) AND ("visit_status" <> 'cancelled'::"text"));



CREATE UNIQUE INDEX "uq_governance_issues_access_issue" ON "public"."governance_issues" USING "btree" ("access_issue_id") WHERE ("access_issue_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_governance_issues_visit_type" ON "public"."governance_issues" USING "btree" ("field_visit_id", "issue_type") WHERE ("field_visit_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_sampling_calendar_schedule_date" ON "public"."sampling_calendar" USING "btree" ("schedule_id", "scheduled_date");



CREATE UNIQUE INDEX "uq_sampling_schedules_scope" ON "public"."sampling_schedules" USING "btree" ("organization_id", "permit_id", "outfall_id", "parameter_id", "frequency_code", "sample_type", "source");



CREATE UNIQUE INDEX "uq_swsa_site_primary" ON "public"."site_weather_station_assignments" USING "btree" ("site_id") WHERE ("is_primary" = true);



CREATE UNIQUE INDEX "uq_weather_stations_tenant_station_id" ON "public"."weather_stations" USING "btree" ("tenant_id", "station_id");



CREATE RULE "audit_log_no_delete" AS
    ON DELETE TO "public"."audit_log" DO INSTEAD NOTHING;



CREATE RULE "audit_log_no_update" AS
    ON UPDATE TO "public"."audit_log" DO INSTEAD NOTHING;



CREATE OR REPLACE TRIGGER "cd_obligations_updated_at" BEFORE UPDATE ON "public"."consent_decree_obligations" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "compliance_audits_updated_at" BEFORE UPDATE ON "public"."compliance_audits" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "dmr_submissions_updated_at" BEFORE UPDATE ON "public"."dmr_submissions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "enforcement_actions_updated_at" BEFORE UPDATE ON "public"."enforcement_actions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "exceedances_updated_at" BEFORE UPDATE ON "public"."exceedances" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handoff_history_updated" BEFORE UPDATE ON "public"."handoff_history" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "lab_results_updated_at" BEFORE UPDATE ON "public"."lab_results" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "notification_preferences_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "npdes_permits_updated_at" BEFORE UPDATE ON "public"."npdes_permits" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "outfalls_updated_at" BEFORE UPDATE ON "public"."outfalls" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "permit_limits_updated_at" BEFORE UPDATE ON "public"."permit_limits" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "prevent_exemption_audit_delete_trigger" BEFORE DELETE ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_exemption_audit_delete"();



CREATE OR REPLACE TRIGGER "quarterly_reports_updated_at" BEFORE UPDATE ON "public"."quarterly_reports" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "roadmap-tasks-to-linear" AFTER INSERT OR UPDATE ON "public"."roadmap_tasks" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://zymenlnwyzpnohljwifx.functions.supabase.co/sync-roadmap-linear', 'POST', '{"Content-type":"application/json","Authorization":"Bearer 0e9988c21b5ddb1789b1c3d246f86a436307acbdcf98ca338754d23e8a174f23"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "roadmap_tasks_mark_linear_pending" BEFORE UPDATE ON "public"."roadmap_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."fn_roadmap_tasks_mark_linear_pending"();



CREATE OR REPLACE TRIGGER "roadmap_tasks_updated" BEFORE UPDATE ON "public"."roadmap_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "sampling_events_updated_at" BEFORE UPDATE ON "public"."sampling_events" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_precipitation_events_updated_at" BEFORE UPDATE ON "public"."precipitation_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."compliance_audits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."conditional_exemptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."consent_decree_obligations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."dmr_line_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."dmr_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."enforcement_actions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."exceedances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."fish_tissue_results" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."lab_results" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."npdes_permits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."outfalls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."permit_amendments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."permit_limit_tables" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."permit_limits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."precipitation_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."quarterly_reports" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."regulatory_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."sampling_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."sampling_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."sampling_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."sites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."state_regulatory_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."stipulated_penalties" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."stream_monitoring_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."stream_monitoring_results" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."wet_test_results" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at_build_jobs" BEFORE UPDATE ON "public"."build_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_innovation_enrichment_tasks" BEFORE UPDATE ON "public"."innovation_enrichment_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_innovation_ideas" BEFORE UPDATE ON "public"."innovation_ideas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_innovation_packs" BEFORE UPDATE ON "public"."innovation_packs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_precipitation_exemptions" BEFORE UPDATE ON "public"."precipitation_exemptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_weather_stations_updated_at" BEFORE UPDATE ON "public"."weather_stations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_work_orders_updated_at" BEFORE UPDATE ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sites_updated_at" BEFORE UPDATE ON "public"."sites" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "trg_access_issues_lock_completed" BEFORE INSERT OR DELETE OR UPDATE ON "public"."access_issues" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_field_visit_editable"();



CREATE OR REPLACE TRIGGER "trg_access_issues_updated_at" BEFORE UPDATE ON "public"."access_issues" FOR EACH ROW EXECUTE FUNCTION "public"."update_field_ops_timestamp"();



CREATE OR REPLACE TRIGGER "trg_audit_checklist_updated" BEFORE UPDATE ON "public"."audit_checklists" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_audit_permit_limits_extraction" AFTER INSERT ON "public"."permit_limits" FOR EACH ROW WHEN (("new"."extraction_source" IS NOT NULL)) EXECUTE FUNCTION "public"."log_permit_limit_review_change"();



COMMENT ON TRIGGER "trg_audit_permit_limits_extraction" ON "public"."permit_limits" IS 'Fires on INSERT when AI extraction source is set. Records initial import for audit trail.';



CREATE OR REPLACE TRIGGER "trg_audit_permit_limits_review" AFTER UPDATE OF "review_status", "reviewed_by", "reviewed_at" ON "public"."permit_limits" FOR EACH ROW WHEN ((("old"."review_status" IS DISTINCT FROM "new"."review_status") OR ("old"."reviewed_by" IS DISTINCT FROM "new"."reviewed_by") OR ("old"."reviewed_at" IS DISTINCT FROM "new"."reviewed_at"))) EXECUTE FUNCTION "public"."log_permit_limit_review_change"();



COMMENT ON TRIGGER "trg_audit_permit_limits_review" ON "public"."permit_limits" IS 'Fires when review_status, reviewed_by, or reviewed_at changes. Required for compliance.';



CREATE OR REPLACE TRIGGER "trg_auto_classify_governance_issue" BEFORE INSERT OR UPDATE ON "public"."governance_issues" FOR EACH ROW EXECUTE FUNCTION "public"."auto_classify_governance_issue"();



CREATE OR REPLACE TRIGGER "trg_ca_notify_assignment" AFTER INSERT OR UPDATE OF "followup_assigned_to" ON "public"."corrective_actions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_ca_assignment"();



CREATE OR REPLACE TRIGGER "trg_ca_notify_signature" AFTER UPDATE OF "responsible_person_signed_at", "approved_by_signed_at" ON "public"."corrective_actions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_ca_signature"();



CREATE OR REPLACE TRIGGER "trg_ca_notify_step" AFTER UPDATE OF "workflow_step" ON "public"."corrective_actions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_ca_step_advanced"();



CREATE OR REPLACE TRIGGER "trg_ca_signature_audit" AFTER UPDATE ON "public"."corrective_actions" FOR EACH ROW WHEN ((("new"."responsible_person_signed_at" IS DISTINCT FROM "old"."responsible_person_signed_at") OR ("new"."approved_by_signed_at" IS DISTINCT FROM "old"."approved_by_signed_at"))) EXECUTE FUNCTION "public"."log_ca_signature_change"();



CREATE OR REPLACE TRIGGER "trg_ca_updated_at" BEFORE UPDATE ON "public"."corrective_actions" FOR EACH ROW EXECUTE FUNCTION "public"."update_ca_timestamp"();



CREATE OR REPLACE TRIGGER "trg_checklist_item_progress" AFTER INSERT OR DELETE OR UPDATE OF "status" ON "public"."audit_checklist_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_audit_checklist_progress"();



CREATE OR REPLACE TRIGGER "trg_checklist_item_updated" BEFORE UPDATE ON "public"."audit_checklist_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_compliance_snapshots_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."compliance_snapshots" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_compliance_violations_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."compliance_violations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_cutover_batches_updated" BEFORE UPDATE ON "public"."cutover_batches" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_cutover_matrix_rows_updated" BEFORE UPDATE ON "public"."cutover_matrix_rows" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_cutover_matrix_uploads_updated" BEFORE UPDATE ON "public"."cutover_matrix_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_deployment_stages_updated" BEFORE UPDATE ON "public"."deployment_stages" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_detect_exceedance" AFTER INSERT OR UPDATE OF "result_value" ON "public"."lab_results" FOR EACH ROW EXECUTE FUNCTION "public"."detect_exceedance"();



COMMENT ON TRIGGER "trg_detect_exceedance" ON "public"."lab_results" IS 'Fires after lab_result insert/update to detect permit limit exceedances';



CREATE OR REPLACE TRIGGER "trg_discrepancy_reviews_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."discrepancy_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_dmr_notify_status" AFTER UPDATE OF "status" ON "public"."dmr_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_dmr_status_change"();



CREATE OR REPLACE TRIGGER "trg_dmr_submission_updated" BEFORE UPDATE ON "public"."dmr_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_dmr_submission_timestamp"();



CREATE OR REPLACE TRIGGER "trg_doc_completeness_updated" BEFORE UPDATE ON "public"."document_completeness" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_emerg_contact_updated" BEFORE UPDATE ON "public"."emergency_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_emerg_procedure_updated" BEFORE UPDATE ON "public"."emergency_procedures" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_enforcement_actions_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."enforcement_actions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_enforcement_creates_ca" AFTER INSERT ON "public"."enforcement_actions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_ca_from_enforcement"();



CREATE OR REPLACE TRIGGER "trg_enforcement_updated" BEFORE UPDATE ON "public"."enforcement_actions" FOR EACH ROW EXECUTE FUNCTION "public"."update_work_order_timestamp"();



CREATE OR REPLACE TRIGGER "trg_exceedance_creates_ca" AFTER INSERT ON "public"."exceedances" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_ca_from_exceedance"();



CREATE OR REPLACE TRIGGER "trg_expire_training_on_insert" AFTER INSERT ON "public"."training_completions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."auto_expire_training_completions"();



CREATE OR REPLACE TRIGGER "trg_external_echo_dmrs_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."external_echo_dmrs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_external_echo_facilities_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."external_echo_facilities" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_external_msha_inspections_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."external_msha_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_external_sync_log_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."external_sync_log" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_field_evidence_assets_lock_completed" BEFORE INSERT OR DELETE OR UPDATE ON "public"."field_evidence_assets" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_field_visit_editable"();



CREATE OR REPLACE TRIGGER "trg_field_measurements_lock_completed" BEFORE INSERT OR DELETE OR UPDATE ON "public"."field_measurements" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_field_visit_editable"();



CREATE OR REPLACE TRIGGER "trg_field_visits_audit_insert" AFTER INSERT ON "public"."field_visits" FOR EACH ROW EXECUTE FUNCTION "public"."audit_field_visit_change"();



CREATE OR REPLACE TRIGGER "trg_field_visits_audit_update" AFTER UPDATE ON "public"."field_visits" FOR EACH ROW EXECUTE FUNCTION "public"."audit_field_visit_change"();



CREATE OR REPLACE TRIGGER "trg_field_visits_enforce_completion" BEFORE UPDATE ON "public"."field_visits" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_field_visit_completion"();



CREATE OR REPLACE TRIGGER "trg_field_visits_sync_sampling_calendar" AFTER INSERT OR DELETE OR UPDATE ON "public"."field_visits" FOR EACH ROW EXECUTE FUNCTION "public"."sync_sampling_calendar_from_field_visit"();



CREATE OR REPLACE TRIGGER "trg_field_visits_updated_at" BEFORE UPDATE ON "public"."field_visits" FOR EACH ROW EXECUTE FUNCTION "public"."update_field_ops_timestamp"();



CREATE OR REPLACE TRIGGER "trg_field_visits_validate_relationships" BEFORE INSERT OR UPDATE ON "public"."field_visits" FOR EACH ROW EXECUTE FUNCTION "public"."validate_field_visit_relationships"();



CREATE OR REPLACE TRIGGER "trg_fts_monthly_totals_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."fts_monthly_totals" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_fts_uploads_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."fts_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_fts_violations_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."fts_violations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_go_live_checklist_items_updated" BEFORE UPDATE ON "public"."go_live_checklist_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_go_live_checklists_updated" BEFORE UPDATE ON "public"."go_live_checklists" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_go_live_item_progress" AFTER INSERT OR DELETE OR UPDATE ON "public"."go_live_checklist_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_go_live_checklist_progress"();



CREATE OR REPLACE TRIGGER "trg_governance_issue_events_audit" AFTER INSERT ON "public"."governance_issue_events" FOR EACH ROW EXECUTE FUNCTION "public"."audit_governance_issue_event"();



CREATE OR REPLACE TRIGGER "trg_governance_issues_audit_insert" AFTER INSERT ON "public"."governance_issues" FOR EACH ROW EXECUTE FUNCTION "public"."audit_governance_issue_change"();



CREATE OR REPLACE TRIGGER "trg_governance_issues_audit_update" AFTER UPDATE ON "public"."governance_issues" FOR EACH ROW EXECUTE FUNCTION "public"."audit_governance_issue_change"();



CREATE OR REPLACE TRIGGER "trg_governance_issues_updated_at" BEFORE UPDATE ON "public"."governance_issues" FOR EACH ROW EXECUTE FUNCTION "public"."update_field_ops_timestamp"();



CREATE OR REPLACE TRIGGER "trg_governance_review_updated" BEFORE UPDATE ON "public"."governance_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_incident_creates_ca" AFTER INSERT OR UPDATE OF "auto_ca_triggered" ON "public"."incidents" FOR EACH ROW WHEN (("new"."auto_ca_triggered" = true)) EXECUTE FUNCTION "public"."auto_create_ca_from_incident"();



CREATE OR REPLACE TRIGGER "trg_kpi_target_updated" BEFORE UPDATE ON "public"."kpi_targets" FOR EACH ROW EXECUTE FUNCTION "public"."update_scheduled_report_timestamp"();



CREATE OR REPLACE TRIGGER "trg_legal_hold_notify" AFTER INSERT OR UPDATE OF "is_active" ON "public"."legal_holds" FOR EACH ROW EXECUTE FUNCTION "public"."notify_legal_hold_change"();



CREATE OR REPLACE TRIGGER "trg_legal_hold_updated" BEFORE UPDATE ON "public"."legal_holds" FOR EACH ROW EXECUTE FUNCTION "public"."update_work_order_timestamp"();



CREATE OR REPLACE TRIGGER "trg_live_program_roster_updated" BEFORE UPDATE ON "public"."live_program_roster" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_no_discharge_events_lock_completed" BEFORE INSERT OR DELETE OR UPDATE ON "public"."no_discharge_events" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_field_visit_editable"();



CREATE OR REPLACE TRIGGER "trg_no_discharge_events_updated_at" BEFORE UPDATE ON "public"."no_discharge_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_field_ops_timestamp"();



CREATE OR REPLACE TRIGGER "trg_nov_records_cutover_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "public"."nov_records" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_cutover_write_freeze"();



CREATE OR REPLACE TRIGGER "trg_nov_updated" BEFORE UPDATE ON "public"."nov_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_work_order_timestamp"();



CREATE OR REPLACE TRIGGER "trg_obligation_evidence_updated" BEFORE UPDATE ON "public"."obligation_evidence" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_outlet_inspections_lock_completed" BEFORE INSERT OR DELETE OR UPDATE ON "public"."outlet_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_field_visit_editable"();



CREATE OR REPLACE TRIGGER "trg_outlet_inspections_updated_at" BEFORE UPDATE ON "public"."outlet_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."update_field_ops_timestamp"();



CREATE OR REPLACE TRIGGER "trg_prevent_rain_event_audit_delete" BEFORE DELETE ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_rain_event_audit_delete"();



CREATE OR REPLACE TRIGGER "trg_retention_updated" BEFORE UPDATE ON "public"."retention_policies" FOR EACH ROW EXECUTE FUNCTION "public"."update_generic_timestamp"();



CREATE OR REPLACE TRIGGER "trg_sampling_calendar_sync_route_stops" AFTER UPDATE ON "public"."sampling_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."sync_sampling_route_stop_from_calendar"();



CREATE OR REPLACE TRIGGER "trg_sampling_calendar_updated_at" BEFORE UPDATE ON "public"."sampling_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."update_field_ops_timestamp"();



CREATE OR REPLACE TRIGGER "trg_sampling_route_batches_updated_at" BEFORE UPDATE ON "public"."sampling_route_batches" FOR EACH ROW EXECUTE FUNCTION "public"."sync_sampling_route_batch_timestamp"();



CREATE OR REPLACE TRIGGER "trg_sampling_route_stops_updated_at" BEFORE UPDATE ON "public"."sampling_route_stops" FOR EACH ROW EXECUTE FUNCTION "public"."sync_sampling_route_batch_timestamp"();



CREATE OR REPLACE TRIGGER "trg_sampling_schedules_updated_at" BEFORE UPDATE ON "public"."sampling_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_field_ops_timestamp"();



CREATE OR REPLACE TRIGGER "trg_scheduled_report_updated" BEFORE UPDATE ON "public"."scheduled_reports" FOR EACH ROW EXECUTE FUNCTION "public"."update_scheduled_report_timestamp"();



CREATE OR REPLACE TRIGGER "trg_set_incident_number" BEFORE INSERT ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_incident_number"();



CREATE OR REPLACE TRIGGER "trg_violation_updated" BEFORE UPDATE ON "public"."compliance_violations" FOR EACH ROW EXECUTE FUNCTION "public"."update_work_order_timestamp"();



CREATE OR REPLACE TRIGGER "trg_work_order_assigned" AFTER INSERT OR UPDATE OF "assigned_to" ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_work_order_assignment"();



CREATE OR REPLACE TRIGGER "trg_work_order_updated" BEFORE UPDATE ON "public"."work_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_work_order_timestamp"();



CREATE OR REPLACE TRIGGER "user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



ALTER TABLE ONLY "public"."access_issues"
    ADD CONSTRAINT "access_issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."access_issues"
    ADD CONSTRAINT "access_issues_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."archive_manifest"
    ADD CONSTRAINT "archive_manifest_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."cutover_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archive_manifest"
    ADD CONSTRAINT "archive_manifest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_checklist_items"
    ADD CONSTRAINT "audit_checklist_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_checklist_items"
    ADD CONSTRAINT "audit_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."audit_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_checklist_items"
    ADD CONSTRAINT "audit_checklist_items_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_checklists"
    ADD CONSTRAINT "audit_checklists_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_checklists"
    ADD CONSTRAINT "audit_checklists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_checklists"
    ADD CONSTRAINT "audit_checklists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_checklists"
    ADD CONSTRAINT "audit_checklists_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_checklists"
    ADD CONSTRAINT "audit_checklists_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."bottle_kit_inventory"
    ADD CONSTRAINT "bottle_kit_inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_jobs"
    ADD CONSTRAINT "build_jobs_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."innovation_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_jobs"
    ADD CONSTRAINT "build_jobs_queued_by_fkey" FOREIGN KEY ("queued_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."calibration_logs"
    ADD CONSTRAINT "calibration_logs_calibrated_by_fkey" FOREIGN KEY ("calibrated_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calibration_logs"
    ADD CONSTRAINT "calibration_logs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment_catalog"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compliance_audits"
    ADD CONSTRAINT "compliance_audits_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."compliance_audits"
    ADD CONSTRAINT "compliance_audits_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."compliance_snapshots"
    ADD CONSTRAINT "compliance_snapshots_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_snapshots"
    ADD CONSTRAINT "compliance_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_corrective_action_id_fkey" FOREIGN KEY ("corrective_action_id") REFERENCES "public"."corrective_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_exceedance_id_fkey" FOREIGN KEY ("exceedance_id") REFERENCES "public"."exceedances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compliance_violations"
    ADD CONSTRAINT "compliance_violations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conditional_exemptions"
    ADD CONSTRAINT "conditional_exemptions_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."consent_decree_obligations"
    ADD CONSTRAINT "consent_decree_obligations_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_followup_assigned_to_fkey" FOREIGN KEY ("followup_assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_npdes_permit_id_fkey" FOREIGN KEY ("npdes_permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."corrective_actions"
    ADD CONSTRAINT "corrective_actions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."cutover_batches"
    ADD CONSTRAINT "cutover_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutover_batches"
    ADD CONSTRAINT "cutover_batches_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutover_batches"
    ADD CONSTRAINT "cutover_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."cutover_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_resolved_outfall_id_fkey" FOREIGN KEY ("resolved_outfall_id") REFERENCES "public"."outfalls"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_resolved_permit_id_fkey" FOREIGN KEY ("resolved_permit_id") REFERENCES "public"."npdes_permits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_resolved_site_id_fkey" FOREIGN KEY ("resolved_site_id") REFERENCES "public"."sites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutover_matrix_rows"
    ADD CONSTRAINT "cutover_matrix_rows_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."cutover_matrix_uploads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cutover_matrix_uploads"
    ADD CONSTRAINT "cutover_matrix_uploads_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."cutover_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cutover_matrix_uploads"
    ADD CONSTRAINT "cutover_matrix_uploads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cutover_matrix_uploads"
    ADD CONSTRAINT "cutover_matrix_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_readiness_checklists"
    ADD CONSTRAINT "daily_readiness_checklists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_readiness_checklists"
    ADD CONSTRAINT "daily_readiness_checklists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_corrections"
    ADD CONSTRAINT "data_corrections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."data_corrections"
    ADD CONSTRAINT "data_corrections_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."data_corrections"
    ADD CONSTRAINT "data_corrections_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_rolled_back_by_fkey" FOREIGN KEY ("rolled_back_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."data_imports"
    ADD CONSTRAINT "data_imports_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."data_integrity_checks"
    ADD CONSTRAINT "data_integrity_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_integrity_checks"
    ADD CONSTRAINT "data_integrity_checks_run_by_fkey" FOREIGN KEY ("run_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deployment_stages"
    ADD CONSTRAINT "deployment_stages_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."go_live_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deployment_stages"
    ADD CONSTRAINT "deployment_stages_deployed_by_fkey" FOREIGN KEY ("deployed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deployment_stages"
    ADD CONSTRAINT "deployment_stages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."digest_queue"
    ADD CONSTRAINT "digest_queue_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."digest_queue"
    ADD CONSTRAINT "digest_queue_triage_id_fkey" FOREIGN KEY ("triage_id") REFERENCES "public"."email_triage"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discrepancy_reviews"
    ADD CONSTRAINT "discrepancy_reviews_escalated_to_fkey" FOREIGN KEY ("escalated_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."discrepancy_reviews"
    ADD CONSTRAINT "discrepancy_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."discrepancy_reviews"
    ADD CONSTRAINT "discrepancy_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."dmr_line_items"
    ADD CONSTRAINT "dmr_line_items_dmr_submission_id_fkey" FOREIGN KEY ("dmr_submission_id") REFERENCES "public"."dmr_submissions"("id");



ALTER TABLE ONLY "public"."dmr_line_items"
    ADD CONSTRAINT "dmr_line_items_exemption_id_fkey" FOREIGN KEY ("exemption_id") REFERENCES "public"."conditional_exemptions"("id");



ALTER TABLE ONLY "public"."dmr_line_items"
    ADD CONSTRAINT "dmr_line_items_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."dmr_line_items"
    ADD CONSTRAINT "dmr_line_items_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id");



ALTER TABLE ONLY "public"."dmr_submissions"
    ADD CONSTRAINT "dmr_submissions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."dmr_submissions"
    ADD CONSTRAINT "dmr_submissions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."dmr_submissions"
    ADD CONSTRAINT "dmr_submissions_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."dmr_submissions"
    ADD CONSTRAINT "dmr_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_queue_entry_id_fkey" FOREIGN KEY ("queue_entry_id") REFERENCES "public"."file_processing_queue"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code");



ALTER TABLE ONLY "public"."document_completeness"
    ADD CONSTRAINT "document_completeness_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_completeness"
    ADD CONSTRAINT "document_completeness_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_completeness"
    ADD CONSTRAINT "document_completeness_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."email_drafts"
    ADD CONSTRAINT "email_drafts_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_drafts"
    ADD CONSTRAINT "email_drafts_triage_id_fkey" FOREIGN KEY ("triage_id") REFERENCES "public"."email_triage"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_intel"
    ADD CONSTRAINT "email_intel_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id");



ALTER TABLE ONLY "public"."email_intel_items"
    ADD CONSTRAINT "email_intel_items_intel_id_fkey" FOREIGN KEY ("intel_id") REFERENCES "public"."email_intel"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_sync_state"
    ADD CONSTRAINT "email_sync_state_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id");



ALTER TABLE ONLY "public"."email_triage"
    ADD CONSTRAINT "email_triage_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."email_triage"
    ADD CONSTRAINT "email_triage_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_triage"
    ADD CONSTRAINT "email_triage_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_contacts"
    ADD CONSTRAINT "emergency_contacts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."emergency_procedures"
    ADD CONSTRAINT "emergency_procedures_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."emergency_procedures"
    ADD CONSTRAINT "emergency_procedures_last_reviewed_by_fkey" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."emergency_procedures"
    ADD CONSTRAINT "emergency_procedures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emergency_procedures"
    ADD CONSTRAINT "emergency_procedures_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enforcement_actions"
    ADD CONSTRAINT "enforcement_actions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."enforcement_actions"
    ADD CONSTRAINT "enforcement_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."enforcement_actions"
    ADD CONSTRAINT "enforcement_actions_related_outfall_id_fkey" FOREIGN KEY ("related_outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."enforcement_actions"
    ADD CONSTRAINT "enforcement_actions_related_permit_id_fkey" FOREIGN KEY ("related_permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."enforcement_actions"
    ADD CONSTRAINT "enforcement_actions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."enforcement_actions"
    ADD CONSTRAINT "enforcement_actions_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."epa_parameter_code_map"
    ADD CONSTRAINT "epa_parameter_code_map_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_assignments"
    ADD CONSTRAINT "equipment_assignments_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment_catalog"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_catalog"
    ADD CONSTRAINT "equipment_catalog_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escalation_chain_steps"
    ADD CONSTRAINT "escalation_chain_steps_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "public"."escalation_chains"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escalation_chain_steps"
    ADD CONSTRAINT "escalation_chain_steps_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."escalation_chains"
    ADD CONSTRAINT "escalation_chains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_corrective_action_id_fkey" FOREIGN KEY ("corrective_action_id") REFERENCES "public"."corrective_actions"("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_exemption_id_fkey" FOREIGN KEY ("exemption_id") REFERENCES "public"."conditional_exemptions"("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_lab_result_id_fkey" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_results"("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_permit_limit_id_fkey" FOREIGN KEY ("permit_limit_id") REFERENCES "public"."permit_limits"("id");



ALTER TABLE ONLY "public"."exceedances"
    ADD CONSTRAINT "exceedances_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."external_echo_dmrs"
    ADD CONSTRAINT "external_echo_dmrs_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."external_echo_facilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_echo_dmrs"
    ADD CONSTRAINT "external_echo_dmrs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."external_echo_facilities"
    ADD CONSTRAINT "external_echo_facilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."external_echo_facilities"
    ADD CONSTRAINT "external_echo_facilities_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code");



ALTER TABLE ONLY "public"."external_msha_inspections"
    ADD CONSTRAINT "external_msha_inspections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."external_sync_log"
    ADD CONSTRAINT "external_sync_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."external_sync_log"
    ADD CONSTRAINT "external_sync_log_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."field_evidence_assets"
    ADD CONSTRAINT "field_evidence_assets_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_evidence_assets"
    ADD CONSTRAINT "field_evidence_assets_governance_issue_id_fkey" FOREIGN KEY ("governance_issue_id") REFERENCES "public"."governance_issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."field_evidence_assets"
    ADD CONSTRAINT "field_evidence_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_evidence_assets"
    ADD CONSTRAINT "field_evidence_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."field_measurements"
    ADD CONSTRAINT "field_measurements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."field_measurements"
    ADD CONSTRAINT "field_measurements_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_outbound_sync_log"
    ADD CONSTRAINT "field_outbound_sync_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_outbound_sync_log"
    ADD CONSTRAINT "field_outbound_sync_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_linked_sampling_event_id_fkey" FOREIGN KEY ("linked_sampling_event_id") REFERENCES "public"."sampling_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_route_batch_id_fkey" FOREIGN KEY ("route_batch_id") REFERENCES "public"."sampling_route_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_sampling_calendar_id_fkey" FOREIGN KEY ("sampling_calendar_id") REFERENCES "public"."sampling_calendar"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_processing_queue"
    ADD CONSTRAINT "file_processing_queue_data_import_id_fkey" FOREIGN KEY ("data_import_id") REFERENCES "public"."data_imports"("id");



ALTER TABLE ONLY "public"."file_processing_queue"
    ADD CONSTRAINT "file_processing_queue_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."file_processing_queue"
    ADD CONSTRAINT "file_processing_queue_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."file_processing_queue"
    ADD CONSTRAINT "file_processing_queue_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."fish_tissue_results"
    ADD CONSTRAINT "fish_tissue_results_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."fish_tissue_results"
    ADD CONSTRAINT "fish_tissue_results_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id");



ALTER TABLE ONLY "public"."fish_tissue_results"
    ADD CONSTRAINT "fish_tissue_results_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."fish_tissue_results"
    ADD CONSTRAINT "fish_tissue_results_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."incident_types"
    ADD CONSTRAINT "fk_incident_types_compliance_chain" FOREIGN KEY ("compliance_chain_id") REFERENCES "public"."escalation_chains"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incident_types"
    ADD CONSTRAINT "fk_incident_types_operational_chain" FOREIGN KEY ("operational_chain_id") REFERENCES "public"."escalation_chains"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."innovation_packs"
    ADD CONSTRAINT "fk_innovation_packs_winner" FOREIGN KEY ("winner_idea_id") REFERENCES "public"."innovation_ideas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_events"
    ADD CONSTRAINT "fk_sampling_events_precipitation_event" FOREIGN KEY ("precipitation_event_id") REFERENCES "public"."precipitation_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_follow_up_draft_id_fkey" FOREIGN KEY ("follow_up_draft_id") REFERENCES "public"."email_drafts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_resolution_email_id_fkey" FOREIGN KEY ("resolution_email_id") REFERENCES "public"."emails"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_source_email_id_fkey" FOREIGN KEY ("source_email_id") REFERENCES "public"."emails"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_source_triage_id_fkey" FOREIGN KEY ("source_triage_id") REFERENCES "public"."email_triage"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fts_monthly_totals"
    ADD CONSTRAINT "fts_monthly_totals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."fts_monthly_totals"
    ADD CONSTRAINT "fts_monthly_totals_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."fts_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fts_uploads"
    ADD CONSTRAINT "fts_uploads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."fts_uploads"
    ADD CONSTRAINT "fts_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fts_violations"
    ADD CONSTRAINT "fts_violations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."fts_violations"
    ADD CONSTRAINT "fts_violations_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."fts_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_report_definition_id_fkey" FOREIGN KEY ("report_definition_id") REFERENCES "public"."report_definitions"("id");



ALTER TABLE ONLY "public"."go_live_checklist_items"
    ADD CONSTRAINT "go_live_checklist_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."go_live_checklist_items"
    ADD CONSTRAINT "go_live_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."go_live_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."go_live_checklist_items"
    ADD CONSTRAINT "go_live_checklist_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."go_live_checklist_items"
    ADD CONSTRAINT "go_live_checklist_items_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."go_live_checklists"
    ADD CONSTRAINT "go_live_checklists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."go_live_checklists"
    ADD CONSTRAINT "go_live_checklists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."go_live_sign_offs"
    ADD CONSTRAINT "go_live_sign_offs_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."go_live_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."go_live_sign_offs"
    ADD CONSTRAINT "go_live_sign_offs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."go_live_sign_offs"
    ADD CONSTRAINT "go_live_sign_offs_signed_by_fkey" FOREIGN KEY ("signed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."governance_escalation_config"
    ADD CONSTRAINT "governance_escalation_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_escalation_config"
    ADD CONSTRAINT "governance_escalation_config_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_issue_events"
    ADD CONSTRAINT "governance_issue_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_issue_events"
    ADD CONSTRAINT "governance_issue_events_governance_issue_id_fkey" FOREIGN KEY ("governance_issue_id") REFERENCES "public"."governance_issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_access_issue_id_fkey" FOREIGN KEY ("access_issue_id") REFERENCES "public"."access_issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_current_owner_user_id_fkey" FOREIGN KEY ("current_owner_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_related_outfall_id_fkey" FOREIGN KEY ("related_outfall_id") REFERENCES "public"."outfalls"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_issues"
    ADD CONSTRAINT "governance_issues_related_permit_id_fkey" FOREIGN KEY ("related_permit_id") REFERENCES "public"."npdes_permits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_reviews"
    ADD CONSTRAINT "governance_reviews_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_reviews"
    ADD CONSTRAINT "governance_reviews_conducted_by_fkey" FOREIGN KEY ("conducted_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_reviews"
    ADD CONSTRAINT "governance_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_reviews"
    ADD CONSTRAINT "governance_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_reviews"
    ADD CONSTRAINT "governance_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."handoff_history"
    ADD CONSTRAINT "handoff_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."handoff_history"
    ADD CONSTRAINT "handoff_history_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."handoff_history"
    ADD CONSTRAINT "handoff_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."human_overrides"
    ADD CONSTRAINT "human_overrides_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."human_overrides"
    ADD CONSTRAINT "human_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."human_overrides"
    ADD CONSTRAINT "human_overrides_overridden_by_fkey" FOREIGN KEY ("overridden_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."incident_events"
    ADD CONSTRAINT "incident_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incident_events"
    ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_types"
    ADD CONSTRAINT "incident_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_corrective_action_id_fkey" FOREIGN KEY ("corrective_action_id") REFERENCES "public"."corrective_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_current_owner_user_id_fkey" FOREIGN KEY ("current_owner_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_incident_type_id_fkey" FOREIGN KEY ("incident_type_id") REFERENCES "public"."incident_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_legacy_governance_issue_id_fkey" FOREIGN KEY ("legacy_governance_issue_id") REFERENCES "public"."governance_issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."innovation_actions"
    ADD CONSTRAINT "innovation_actions_acted_by_fkey" FOREIGN KEY ("acted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."innovation_actions"
    ADD CONSTRAINT "innovation_actions_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."innovation_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."innovation_actions"
    ADD CONSTRAINT "innovation_actions_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."innovation_packs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."innovation_enrichment_tasks"
    ADD CONSTRAINT "innovation_enrichment_tasks_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."innovation_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."innovation_enrichment_tasks"
    ADD CONSTRAINT "innovation_enrichment_tasks_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."innovation_packs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."innovation_grade_runs"
    ADD CONSTRAINT "innovation_grade_runs_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."innovation_ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."innovation_ideas"
    ADD CONSTRAINT "innovation_ideas_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."innovation_ideas"
    ADD CONSTRAINT "innovation_ideas_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."innovation_packs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."innovation_packs"
    ADD CONSTRAINT "innovation_packs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."integration_connections"
    ADD CONSTRAINT "integration_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kpi_targets"
    ADD CONSTRAINT "kpi_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_targets"
    ADD CONSTRAINT "kpi_targets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."data_imports"("id");



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id");



ALTER TABLE ONLY "public"."lab_results"
    ADD CONSTRAINT "lab_results_sampling_event_id_fkey" FOREIGN KEY ("sampling_event_id") REFERENCES "public"."sampling_events"("id");



ALTER TABLE ONLY "public"."legal_holds"
    ADD CONSTRAINT "legal_holds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legal_holds"
    ADD CONSTRAINT "legal_holds_placed_by_fkey" FOREIGN KEY ("placed_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."legal_holds"
    ADD CONSTRAINT "legal_holds_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."live_program_roster"
    ADD CONSTRAINT "live_program_roster_cutover_batch_id_fkey" FOREIGN KEY ("cutover_batch_id") REFERENCES "public"."cutover_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_program_roster"
    ADD CONSTRAINT "live_program_roster_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_program_roster"
    ADD CONSTRAINT "live_program_roster_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."live_program_roster"
    ADD CONSTRAINT "live_program_roster_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."live_program_roster"
    ADD CONSTRAINT "live_program_roster_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_program_roster"
    ADD CONSTRAINT "live_program_roster_source_row_id_fkey" FOREIGN KEY ("source_row_id") REFERENCES "public"."cutover_matrix_rows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_logs"
    ADD CONSTRAINT "maintenance_logs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment_catalog"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."maintenance_logs"
    ADD CONSTRAINT "maintenance_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."no_discharge_events"
    ADD CONSTRAINT "no_discharge_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."no_discharge_events"
    ADD CONSTRAINT "no_discharge_events_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nov_records"
    ADD CONSTRAINT "nov_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nov_records"
    ADD CONSTRAINT "nov_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nov_records"
    ADD CONSTRAINT "nov_records_violation_id_fkey" FOREIGN KEY ("violation_id") REFERENCES "public"."compliance_violations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."npdes_id_overrides"
    ADD CONSTRAINT "npdes_id_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."npdes_id_overrides"
    ADD CONSTRAINT "npdes_id_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."npdes_permits"
    ADD CONSTRAINT "npdes_permits_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."npdes_permits"
    ADD CONSTRAINT "npdes_permits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."npdes_permits"
    ADD CONSTRAINT "npdes_permits_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."npdes_permits"
    ADD CONSTRAINT "npdes_permits_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."obligation_evidence"
    ADD CONSTRAINT "obligation_evidence_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "public"."consent_decree_obligations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obligation_evidence"
    ADD CONSTRAINT "obligation_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."obligation_evidence"
    ADD CONSTRAINT "obligation_evidence_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."obligation_evidence"
    ADD CONSTRAINT "obligation_evidence_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_headquarters_state_fkey" FOREIGN KEY ("headquarters_state") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."outfall_aliases"
    ADD CONSTRAINT "outfall_aliases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outfall_aliases"
    ADD CONSTRAINT "outfall_aliases_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outfall_aliases"
    ADD CONSTRAINT "outfall_aliases_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outfall_discharge_log"
    ADD CONSTRAINT "outfall_discharge_log_observed_by_fkey" FOREIGN KEY ("observed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."outfall_discharge_log"
    ADD CONSTRAINT "outfall_discharge_log_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."outfall_limit_table_assignments"
    ADD CONSTRAINT "outfall_limit_table_assignments_limit_table_id_fkey" FOREIGN KEY ("limit_table_id") REFERENCES "public"."permit_limit_tables"("id");



ALTER TABLE ONLY "public"."outfall_limit_table_assignments"
    ADD CONSTRAINT "outfall_limit_table_assignments_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."outfalls"
    ADD CONSTRAINT "outfalls_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."outfalls"
    ADD CONSTRAINT "outfalls_receiving_water_id_fkey" FOREIGN KEY ("receiving_water_id") REFERENCES "public"."receiving_waters"("id");



ALTER TABLE ONLY "public"."outfalls"
    ADD CONSTRAINT "outfalls_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."outlet_inspections"
    ADD CONSTRAINT "outlet_inspections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."outlet_inspections"
    ADD CONSTRAINT "outlet_inspections_field_visit_id_fkey" FOREIGN KEY ("field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parameter_aliases"
    ADD CONSTRAINT "parameter_aliases_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."permit_amendments"
    ADD CONSTRAINT "permit_amendments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."permit_amendments"
    ADD CONSTRAINT "permit_amendments_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."permit_limit_tables"
    ADD CONSTRAINT "permit_limit_tables_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."permit_limits"
    ADD CONSTRAINT "permit_limits_limit_table_id_fkey" FOREIGN KEY ("limit_table_id") REFERENCES "public"."permit_limit_tables"("id");



ALTER TABLE ONLY "public"."permit_limits"
    ADD CONSTRAINT "permit_limits_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."permit_limits"
    ADD CONSTRAINT "permit_limits_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id");



ALTER TABLE ONLY "public"."permit_limits"
    ADD CONSTRAINT "permit_limits_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."permit_limits"
    ADD CONSTRAINT "permit_limits_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_dismissed_by_fkey" FOREIGN KEY ("dismissed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_exemption_approved_by_fkey" FOREIGN KEY ("exemption_approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_precipitation_reading_id_fkey" FOREIGN KEY ("precipitation_reading_id") REFERENCES "public"."precipitation_readings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."precipitation_events"
    ADD CONSTRAINT "precipitation_events_weather_station_id_fkey" FOREIGN KEY ("weather_station_id") REFERENCES "public"."weather_stations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."precipitation_exemptions"
    ADD CONSTRAINT "precipitation_exemptions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."precipitation_exemptions"
    ADD CONSTRAINT "precipitation_exemptions_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."precipitation_exemptions"
    ADD CONSTRAINT "precipitation_exemptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."precipitation_exemptions"
    ADD CONSTRAINT "precipitation_exemptions_precipitation_event_id_fkey" FOREIGN KEY ("precipitation_event_id") REFERENCES "public"."precipitation_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."precipitation_readings"
    ADD CONSTRAINT "precipitation_readings_weather_station_id_fkey" FOREIGN KEY ("weather_station_id") REFERENCES "public"."weather_stations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quarterly_reports"
    ADD CONSTRAINT "quarterly_reports_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."quarterly_reports"
    ADD CONSTRAINT "quarterly_reports_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."quarterly_reports"
    ADD CONSTRAINT "quarterly_reports_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."rca_findings"
    ADD CONSTRAINT "rca_findings_analyzed_by_fkey" FOREIGN KEY ("analyzed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rca_findings"
    ADD CONSTRAINT "rca_findings_corrective_action_id_fkey" FOREIGN KEY ("corrective_action_id") REFERENCES "public"."corrective_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rca_findings"
    ADD CONSTRAINT "rca_findings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rca_findings"
    ADD CONSTRAINT "rca_findings_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."rca_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rca_templates"
    ADD CONSTRAINT "rca_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."readiness_checks"
    ADD CONSTRAINT "readiness_checks_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."readiness_checks"
    ADD CONSTRAINT "readiness_checks_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "public"."readiness_requirements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."readiness_checks"
    ADD CONSTRAINT "readiness_checks_route_batch_id_fkey" FOREIGN KEY ("route_batch_id") REFERENCES "public"."sampling_route_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."readiness_requirements"
    ADD CONSTRAINT "readiness_requirements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receiving_waters"
    ADD CONSTRAINT "receiving_waters_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."regulatory_contacts"
    ADD CONSTRAINT "regulatory_contacts_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."regulatory_deadlines"
    ADD CONSTRAINT "regulatory_deadlines_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."regulatory_deadlines"
    ADD CONSTRAINT "regulatory_deadlines_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."report_delivery_recipients"
    ADD CONSTRAINT "report_delivery_recipients_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."report_delivery_recipients"
    ADD CONSTRAINT "report_delivery_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_delivery_recipients"
    ADD CONSTRAINT "report_delivery_recipients_report_definition_id_fkey" FOREIGN KEY ("report_definition_id") REFERENCES "public"."report_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_delivery_recipients"
    ADD CONSTRAINT "report_delivery_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."report_role_permissions"
    ADD CONSTRAINT "report_role_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."report_role_permissions"
    ADD CONSTRAINT "report_role_permissions_report_definition_id_fkey" FOREIGN KEY ("report_definition_id") REFERENCES "public"."report_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_role_permissions"
    ADD CONSTRAINT "report_role_permissions_role_name_fkey" FOREIGN KEY ("role_name") REFERENCES "public"."roles"("name") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."report_runs"
    ADD CONSTRAINT "report_runs_scheduled_report_id_fkey" FOREIGN KEY ("scheduled_report_id") REFERENCES "public"."scheduled_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_runs"
    ADD CONSTRAINT "report_runs_triggered_by_user_fkey" FOREIGN KEY ("triggered_by_user") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_templates"
    ADD CONSTRAINT "report_templates_report_definition_id_fkey" FOREIGN KEY ("report_definition_id") REFERENCES "public"."report_definitions"("id");



ALTER TABLE ONLY "public"."retention_policies"
    ADD CONSTRAINT "retention_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roadmap_tasks"
    ADD CONSTRAINT "roadmap_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."roadmap_tasks"
    ADD CONSTRAINT "roadmap_tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."roadmap_tasks"
    ADD CONSTRAINT "roadmap_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."roadmap_tasks"
    ADD CONSTRAINT "roadmap_tasks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sampling_calendar_adjustments"
    ADD CONSTRAINT "sampling_calendar_adjustments_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."sampling_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sampling_calendar_adjustments"
    ADD CONSTRAINT "sampling_calendar_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sampling_calendar_adjustments"
    ADD CONSTRAINT "sampling_calendar_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_current_field_visit_id_fkey" FOREIGN KEY ("current_field_visit_id") REFERENCES "public"."field_visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_current_route_batch_id_fkey" FOREIGN KEY ("current_route_batch_id") REFERENCES "public"."sampling_route_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_default_assigned_to_fkey" FOREIGN KEY ("default_assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id");



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_sampling_event_id_fkey" FOREIGN KEY ("sampling_event_id") REFERENCES "public"."sampling_events"("id");



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."sampling_schedules"("id");



ALTER TABLE ONLY "public"."sampling_calendar"
    ADD CONSTRAINT "sampling_calendar_source_calendar_id_fkey" FOREIGN KEY ("source_calendar_id") REFERENCES "public"."sampling_calendar"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_events"
    ADD CONSTRAINT "sampling_events_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."sampling_events"
    ADD CONSTRAINT "sampling_events_precipitation_event_id_fkey" FOREIGN KEY ("precipitation_event_id") REFERENCES "public"."precipitation_events"("id");



ALTER TABLE ONLY "public"."sampling_events"
    ADD CONSTRAINT "sampling_events_sampled_by_fkey" FOREIGN KEY ("sampled_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."sampling_events"
    ADD CONSTRAINT "sampling_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."sampling_route_batches"
    ADD CONSTRAINT "sampling_route_batches_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_route_batches"
    ADD CONSTRAINT "sampling_route_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sampling_route_batches"
    ADD CONSTRAINT "sampling_route_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sampling_route_batches"
    ADD CONSTRAINT "sampling_route_batches_readiness_override_by_fkey" FOREIGN KEY ("readiness_override_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_route_stops"
    ADD CONSTRAINT "sampling_route_stops_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."sampling_calendar"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sampling_route_stops"
    ADD CONSTRAINT "sampling_route_stops_route_batch_id_fkey" FOREIGN KEY ("route_batch_id") REFERENCES "public"."sampling_route_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sampling_schedules"
    ADD CONSTRAINT "sampling_schedules_default_assigned_to_fkey" FOREIGN KEY ("default_assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sampling_schedules"
    ADD CONSTRAINT "sampling_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sampling_schedules"
    ADD CONSTRAINT "sampling_schedules_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."sampling_schedules"
    ADD CONSTRAINT "sampling_schedules_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id");



ALTER TABLE ONLY "public"."sampling_schedules"
    ADD CONSTRAINT "sampling_schedules_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."scheduled_reports"
    ADD CONSTRAINT "scheduled_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."scheduled_reports"
    ADD CONSTRAINT "scheduled_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_reports"
    ADD CONSTRAINT "scheduled_reports_report_definition_id_fkey" FOREIGN KEY ("report_definition_id") REFERENCES "public"."report_definitions"("id");



ALTER TABLE ONLY "public"."site_weather_station_assignments"
    ADD CONSTRAINT "site_weather_station_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_weather_station_assignments"
    ADD CONSTRAINT "site_weather_station_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_weather_station_assignments"
    ADD CONSTRAINT "site_weather_station_assignments_weather_station_id_fkey" FOREIGN KEY ("weather_station_id") REFERENCES "public"."weather_stations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."smoke_test_runs"
    ADD CONSTRAINT "smoke_test_runs_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."go_live_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smoke_test_runs"
    ADD CONSTRAINT "smoke_test_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."smoke_test_runs"
    ADD CONSTRAINT "smoke_test_runs_run_by_fkey" FOREIGN KEY ("run_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."state_regulatory_configs"
    ADD CONSTRAINT "state_regulatory_configs_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."stipulated_penalties"
    ADD CONSTRAINT "stipulated_penalties_enforcement_action_id_fkey" FOREIGN KEY ("enforcement_action_id") REFERENCES "public"."enforcement_actions"("id");



ALTER TABLE ONLY "public"."stipulated_penalties"
    ADD CONSTRAINT "stipulated_penalties_exceedance_id_fkey" FOREIGN KEY ("exceedance_id") REFERENCES "public"."exceedances"("id");



ALTER TABLE ONLY "public"."stipulated_penalties"
    ADD CONSTRAINT "stipulated_penalties_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."stipulated_penalties"
    ADD CONSTRAINT "stipulated_penalties_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."stipulated_penalties"
    ADD CONSTRAINT "stipulated_penalties_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id");



ALTER TABLE ONLY "public"."stream_monitoring_locations"
    ADD CONSTRAINT "stream_monitoring_locations_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."stream_monitoring_locations"
    ADD CONSTRAINT "stream_monitoring_locations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."stream_monitoring_results"
    ADD CONSTRAINT "stream_monitoring_results_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");



ALTER TABLE ONLY "public"."stream_monitoring_results"
    ADD CONSTRAINT "stream_monitoring_results_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."stream_monitoring_locations"("id");



ALTER TABLE ONLY "public"."system_health_logs"
    ADD CONSTRAINT "system_health_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_catalog"
    ADD CONSTRAINT "training_catalog_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_completions"
    ADD CONSTRAINT "training_completions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_completions"
    ADD CONSTRAINT "training_completions_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "public"."training_catalog"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_completions"
    ADD CONSTRAINT "training_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_completions"
    ADD CONSTRAINT "training_completions_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_requirements"
    ADD CONSTRAINT "training_requirements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_requirements"
    ADD CONSTRAINT "training_requirements_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "public"."training_catalog"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_conversions"
    ADD CONSTRAINT "unit_conversions_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weather_stations"
    ADD CONSTRAINT "weather_stations_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "public"."states"("code");



ALTER TABLE ONLY "public"."weather_stations"
    ADD CONSTRAINT "weather_stations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wet_test_results"
    ADD CONSTRAINT "wet_test_results_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."wet_test_results"
    ADD CONSTRAINT "wet_test_results_sampling_event_id_fkey" FOREIGN KEY ("sampling_event_id") REFERENCES "public"."sampling_events"("id");



ALTER TABLE ONLY "public"."work_order_events"
    ADD CONSTRAINT "work_order_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."work_order_events"
    ADD CONSTRAINT "work_order_events_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_outfall_id_fkey" FOREIGN KEY ("outfall_id") REFERENCES "public"."outfalls"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_permit_id_fkey" FOREIGN KEY ("permit_id") REFERENCES "public"."npdes_permits"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_previous_work_order_id_fkey" FOREIGN KEY ("previous_work_order_id") REFERENCES "public"."work_orders"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."work_orders"
    ADD CONSTRAINT "work_orders_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."user_profiles"("id");



CREATE POLICY "Admin and env mgr can create scheduled reports" ON "public"."scheduled_reports" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'environmental_manager'::"text"])))))));



CREATE POLICY "Admin and env mgr can update scheduled reports" ON "public"."scheduled_reports" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'environmental_manager'::"text"])))))));



CREATE POLICY "Admin can add any recipient" ON "public"."report_delivery_recipients" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admin can delete any recipient" ON "public"."report_delivery_recipients" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admin can delete report role permissions" ON "public"."report_role_permissions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text")))));



CREATE POLICY "Admin can delete role assignments" ON "public"."user_role_assignments" FOR DELETE TO "authenticated" USING ((("user_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."organization_id" = "public"."get_user_org_id"()))) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'executive'::"text"])))))));



CREATE POLICY "Admin can delete scheduled reports" ON "public"."scheduled_reports" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admin can insert report role permissions" ON "public"."report_role_permissions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text")))));



CREATE POLICY "Admin can insert role assignments" ON "public"."user_role_assignments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."organization_id" = "public"."get_user_org_id"()))) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'executive'::"text"])))))));



CREATE POLICY "Admin can update any recipient" ON "public"."report_delivery_recipients" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admin can update org user profiles" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'executive'::"text"])))))));



CREATE POLICY "Admin can update report definitions" ON "public"."report_definitions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text")))));



CREATE POLICY "Admin can update role assignments" ON "public"."user_role_assignments" FOR UPDATE TO "authenticated" USING ((("user_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."organization_id" = "public"."get_user_org_id"()))) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'executive'::"text"])))))));



CREATE POLICY "Admin delete chain steps" ON "public"."escalation_chain_steps" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."escalation_chains" "ec"
  WHERE (("ec"."id" = "escalation_chain_steps"."chain_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Admin delete equipment catalog" ON "public"."equipment_catalog" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin delete escalation chains" ON "public"."escalation_chains" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin delete fts monthly totals" ON "public"."fts_monthly_totals" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admin delete fts uploads" ON "public"."fts_uploads" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admin delete fts violations" ON "public"."fts_violations" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admin delete incident types" ON "public"."incident_types" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin delete rca templates" ON "public"."rca_templates" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin delete readiness requirements" ON "public"."readiness_requirements" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin delete training catalog" ON "public"."training_catalog" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin delete training requirements" ON "public"."training_requirements" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin insert rca templates" ON "public"."rca_templates" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin insert readiness requirements" ON "public"."readiness_requirements" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin manage chain steps" ON "public"."escalation_chain_steps" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."escalation_chains" "ec"
  WHERE (("ec"."id" = "escalation_chain_steps"."chain_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Admin manage equipment catalog" ON "public"."equipment_catalog" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin manage escalation chains" ON "public"."escalation_chains" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin manage incident types" ON "public"."incident_types" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin manage training catalog" ON "public"."training_catalog" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin manage training requirements" ON "public"."training_requirements" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin update chain steps" ON "public"."escalation_chain_steps" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."escalation_chains" "ec"
  WHERE (("ec"."id" = "escalation_chain_steps"."chain_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Admin update equipment catalog" ON "public"."equipment_catalog" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin update escalation chains" ON "public"."escalation_chains" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin update incident types" ON "public"."incident_types" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin update rca templates" ON "public"."rca_templates" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin update readiness requirements" ON "public"."readiness_requirements" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin update training catalog" ON "public"."training_catalog" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admin update training requirements" ON "public"."training_requirements" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Admins can delete overrides" ON "public"."npdes_id_overrides" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admins delete corrective actions" ON "public"."corrective_actions" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "Admins delete field visits" ON "public"."field_visits" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "Admins delete work orders" ON "public"."work_orders" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = 'admin'::"text"))))));



CREATE POLICY "All authenticated can view report definitions" ON "public"."report_definitions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "All authenticated can view report role permissions" ON "public"."report_role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Assigned users or managers update field visits" ON "public"."field_visits" FOR UPDATE TO "authenticated" USING ("public"."can_access_field_visit"("id")) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Authenticated can insert generated reports" ON "public"."generated_reports" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Authenticated users can delete email_sync_state" ON "public"."email_sync_state" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete email_watch_senders" ON "public"."email_watch_senders" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can insert build jobs" ON "public"."build_jobs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert email_intel" ON "public"."email_intel" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert email_intel_items" ON "public"."email_intel_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert email_sync_state" ON "public"."email_sync_state" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert email_watch_senders" ON "public"."email_watch_senders" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert enrichment tasks" ON "public"."innovation_enrichment_tasks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert grade runs" ON "public"."innovation_grade_runs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert innovation actions" ON "public"."innovation_actions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "acted_by"));



CREATE POLICY "Authenticated users can insert innovation ideas" ON "public"."innovation_ideas" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert innovation packs" ON "public"."innovation_packs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert obligations" ON "public"."consent_decree_obligations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert own org audit log" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Authenticated users can read EPA code map" ON "public"."epa_parameter_code_map" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read parameter aliases" ON "public"."parameter_aliases" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read parameters" ON "public"."parameters" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read receiving_waters" ON "public"."receiving_waters" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read regulatory_contacts" ON "public"."regulatory_contacts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read regulatory_deadlines" ON "public"."regulatory_deadlines" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read state_regulatory_configs" ON "public"."state_regulatory_configs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read states" ON "public"."states" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read unit conversions" ON "public"."unit_conversions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update build jobs" ON "public"."build_jobs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update email_intel" ON "public"."email_intel" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update email_intel_items" ON "public"."email_intel_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update email_sync_state" ON "public"."email_sync_state" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update email_watch_senders" ON "public"."email_watch_senders" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update enrichment tasks" ON "public"."innovation_enrichment_tasks" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update innovation ideas" ON "public"."innovation_ideas" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can update innovation packs" ON "public"."innovation_packs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can view build jobs" ON "public"."build_jobs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view email_intel" ON "public"."email_intel" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view email_intel_items" ON "public"."email_intel_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view email_sync_state" ON "public"."email_sync_state" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view email_watch_senders" ON "public"."email_watch_senders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view enrichment tasks" ON "public"."innovation_enrichment_tasks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view grade runs" ON "public"."innovation_grade_runs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view innovation actions" ON "public"."innovation_actions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view innovation ideas" ON "public"."innovation_ideas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view innovation packs" ON "public"."innovation_packs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authorized roles can insert obligations" ON "public"."consent_decree_obligations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'executive'::"text", 'environmental_manager'::"text"]))))));



CREATE POLICY "Authorized users create corrections" ON "public"."data_corrections" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("requested_by" = "auth"."uid"())));



CREATE POLICY "Authorized users insert fts monthly totals" ON "public"."fts_monthly_totals" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'environmental_manager'::"text", 'executive'::"text"])))))));



CREATE POLICY "Authorized users insert fts uploads" ON "public"."fts_uploads" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'environmental_manager'::"text", 'executive'::"text"])))))));



CREATE POLICY "Authorized users insert fts violations" ON "public"."fts_violations" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'environmental_manager'::"text", 'executive'::"text"])))))));



CREATE POLICY "Authorized users insert roadmap tasks" ON "public"."roadmap_tasks" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Authorized users manage roadmap tasks" ON "public"."roadmap_tasks" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Authorized users update fts monthly totals" ON "public"."fts_monthly_totals" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Authorized users update fts uploads" ON "public"."fts_uploads" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Authorized users update fts violations" ON "public"."fts_violations" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Managers and admins can insert overrides" ON "public"."npdes_id_overrides" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['environmental_manager'::"text", 'admin'::"text", 'executive'::"text"])))))));



CREATE POLICY "Managers and admins can update overrides" ON "public"."npdes_id_overrides" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['environmental_manager'::"text", 'admin'::"text", 'executive'::"text"])))))));



CREATE POLICY "Managers can delete exceedances" ON "public"."exceedances" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Managers can update exceedances" ON "public"."exceedances" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Managers create corrective actions" ON "public"."corrective_actions" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['environmental_manager'::"text", 'admin'::"text", 'executive'::"text"])))))));



CREATE POLICY "Managers create field visits" ON "public"."field_visits" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['site_manager'::"text", 'environmental_manager'::"text", 'executive'::"text", 'admin'::"text"])));



CREATE POLICY "Managers create outfall aliases" ON "public"."outfall_aliases" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['admin'::"text", 'environmental_manager'::"text", 'site_manager'::"text"]))))) AND (EXISTS ( SELECT 1
   FROM (("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "np" ON (("np"."id" = "o"."permit_id")))
     JOIN "public"."sites" "s" ON (("s"."id" = "np"."site_id")))
  WHERE (("o"."id" = "outfall_aliases"."outfall_id") AND ("s"."organization_id" = "public"."get_user_org_id"()))))));



CREATE POLICY "Managers create work orders" ON "public"."work_orders" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Managers insert sampling calendar adjustments" ON "public"."sampling_calendar_adjustments" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("created_by" = "auth"."uid"()) AND "public"."can_manage_sampling_records"()));



CREATE POLICY "Managers manage route batches" ON "public"."sampling_route_batches" TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"())) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"()));



CREATE POLICY "Managers manage route stops" ON "public"."sampling_route_stops" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sampling_route_batches" "rb"
  WHERE (("rb"."id" = "sampling_route_stops"."route_batch_id") AND ("rb"."organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."sampling_route_batches" "rb"
  WHERE (("rb"."id" = "sampling_route_stops"."route_batch_id") AND ("rb"."organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"()))));



CREATE POLICY "Managers manage sampling calendar" ON "public"."sampling_calendar" TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"())) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"()));



CREATE POLICY "Managers manage sampling schedules" ON "public"."sampling_schedules" TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"())) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"()));



CREATE POLICY "Managers update governance issues" ON "public"."governance_issues" FOR UPDATE TO "authenticated" USING (("public"."can_access_governance_issue"("id") AND (("current_owner_user_id" = "auth"."uid"()) OR "public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'executive'::"text", 'admin'::"text"])))) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "No delete on generated reports" ON "public"."generated_reports" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "No delete on report definitions" ON "public"."report_definitions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "No insert on report definitions" ON "public"."report_definitions" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "No update on generated reports" ON "public"."generated_reports" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "Org insert calibration logs" ON "public"."calibration_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."equipment_catalog" "ec"
  WHERE (("ec"."id" = "calibration_logs"."equipment_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org insert equipment assignments" ON "public"."equipment_assignments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."equipment_catalog" "ec"
  WHERE (("ec"."id" = "equipment_assignments"."equipment_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org insert incident events" ON "public"."incident_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."incidents" "i"
  WHERE (("i"."id" = "incident_events"."incident_id") AND ("i"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org insert incidents" ON "public"."incidents" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org insert maintenance logs" ON "public"."maintenance_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."equipment_catalog" "ec"
  WHERE (("ec"."id" = "maintenance_logs"."equipment_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org insert training completions" ON "public"."training_completions" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org manage bottle kit inventory" ON "public"."bottle_kit_inventory" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members can view overrides" ON "public"."npdes_id_overrides" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members delete rca findings" ON "public"."rca_findings" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members insert rca findings" ON "public"."rca_findings" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members insert readiness checks" ON "public"."readiness_checks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."sampling_route_batches" "srb"
  WHERE (("srb"."id" = "readiness_checks"."route_batch_id") AND ("srb"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org members read bottle kit inventory" ON "public"."bottle_kit_inventory" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read calibration logs" ON "public"."calibration_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."equipment_catalog" "ec"
  WHERE (("ec"."id" = "calibration_logs"."equipment_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org members read chain steps" ON "public"."escalation_chain_steps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."escalation_chains" "ec"
  WHERE (("ec"."id" = "escalation_chain_steps"."chain_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org members read equipment assignments" ON "public"."equipment_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."equipment_catalog" "ec"
  WHERE (("ec"."id" = "equipment_assignments"."equipment_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org members read equipment catalog" ON "public"."equipment_catalog" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read escalation chains" ON "public"."escalation_chains" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read incident events" ON "public"."incident_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."incidents" "i"
  WHERE (("i"."id" = "incident_events"."incident_id") AND ("i"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org members read incident types" ON "public"."incident_types" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read incidents" ON "public"."incidents" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read maintenance logs" ON "public"."maintenance_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."equipment_catalog" "ec"
  WHERE (("ec"."id" = "maintenance_logs"."equipment_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org members read rca findings" ON "public"."rca_findings" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read rca templates" ON "public"."rca_templates" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read readiness checks" ON "public"."readiness_checks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sampling_route_batches" "srb"
  WHERE (("srb"."id" = "readiness_checks"."route_batch_id") AND ("srb"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org members read readiness requirements" ON "public"."readiness_requirements" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read training catalog" ON "public"."training_catalog" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members read training requirements" ON "public"."training_requirements" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org members update rca findings" ON "public"."rca_findings" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org update bottle kit inventory" ON "public"."bottle_kit_inventory" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org update equipment assignments" ON "public"."equipment_assignments" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."equipment_catalog" "ec"
  WHERE (("ec"."id" = "equipment_assignments"."equipment_id") AND ("ec"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Org update incidents" ON "public"."incidents" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org update training completions" ON "public"."training_completions" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org-scoped insert" ON "public"."handoff_history" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("organization_id" = "public"."get_user_org_id"())));



CREATE POLICY "Org-scoped notification insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org-scoped read" ON "public"."handoff_history" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Org-scoped update" ON "public"."handoff_history" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Reviewer can approve or reject corrections" ON "public"."data_corrections" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("requested_by" <> "auth"."uid"())));



CREATE POLICY "Service role can manage ECHO DMRs" ON "public"."external_echo_dmrs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage ECHO facilities" ON "public"."external_echo_facilities" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage MSHA inspections" ON "public"."external_msha_inspections" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage audit logs" ON "public"."audit_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage chunks" ON "public"."document_chunks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage discrepancies" ON "public"."discrepancy_reviews" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage exceedances" ON "public"."exceedances" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage overrides" ON "public"."npdes_id_overrides" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage sync logs" ON "public"."external_sync_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."corrective_actions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access access issues" ON "public"."access_issues" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access field evidence" ON "public"."field_evidence_assets" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access field measurements" ON "public"."field_measurements" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access field visits" ON "public"."field_visits" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access governance issue events" ON "public"."governance_issue_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access governance issues" ON "public"."governance_issues" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access no discharge events" ON "public"."no_discharge_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on work_order_events" ON "public"."work_order_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on work_orders" ON "public"."work_orders" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access outlet inspections" ON "public"."outlet_inspections" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access route batches" ON "public"."sampling_route_batches" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access route stops" ON "public"."sampling_route_stops" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access sampling calendar" ON "public"."sampling_calendar" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access sampling calendar adjustments" ON "public"."sampling_calendar_adjustments" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access sampling schedules" ON "public"."sampling_schedules" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages EPA code map" ON "public"."epa_parameter_code_map" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages email sender trust" ON "public"."email_sender_trust" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages fts monthly totals" ON "public"."fts_monthly_totals" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages fts uploads" ON "public"."fts_uploads" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages fts violations" ON "public"."fts_violations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages outfall aliases" ON "public"."outfall_aliases" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages parameter aliases" ON "public"."parameter_aliases" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages skill execution log" ON "public"."skill_execution_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages skill feedback" ON "public"."skill_feedback" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages skill registry" ON "public"."skill_registry" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "System can insert exceedances" ON "public"."exceedances" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can delete own org data_corrections" ON "public"."data_corrections" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can delete own org discrepancy_reviews" ON "public"."discrepancy_reviews" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can delete own org dmr_submissions" ON "public"."dmr_submissions" FOR DELETE TO "authenticated" USING (("permit_id" IN ( SELECT "np"."id"
   FROM "public"."npdes_permits" "np"
  WHERE (("np"."organization_id" = "public"."get_user_org_id"()) OR ("np"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("np"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can delete own org lab_results" ON "public"."lab_results" FOR DELETE TO "authenticated" USING (("sampling_event_id" IN ( SELECT "se"."id"
   FROM ("public"."sampling_events" "se"
     JOIN "public"."sites" "s" ON (("s"."id" = "se"."site_id")))
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can delete own org report templates" ON "public"."report_templates" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can delete own org sampling_events" ON "public"."sampling_events" FOR DELETE TO "authenticated" USING (("site_id" IN ( SELECT "s"."id"
   FROM "public"."sites" "s"
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can delete own subscriptions" ON "public"."report_delivery_recipients" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("source" = 'self_subscribe'::"text") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can insert org exceedances" ON "public"."exceedances" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can insert own org discrepancy_reviews" ON "public"."discrepancy_reviews" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can insert own org lab_results" ON "public"."lab_results" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."sampling_events" "se"
     JOIN "public"."outfalls" "o" ON (("se"."outfall_id" = "o"."id")))
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
     JOIN "public"."user_profiles" "up" ON (("up"."organization_id" = "p"."organization_id")))
  WHERE (("se"."id" = "lab_results"."sampling_event_id") AND ("up"."id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own org report templates" ON "public"."report_templates" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can insert own org sampling_events" ON "public"."sampling_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
     JOIN "public"."user_profiles" "up" ON (("up"."organization_id" = "p"."organization_id")))
  WHERE (("o"."id" = "sampling_events"."outfall_id") AND ("up"."id" = "auth"."uid"())))));



CREATE POLICY "Users can insert queue entries" ON "public"."file_processing_queue" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND (("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL))));



CREATE POLICY "Users can manage own notification preferences" ON "public"."notification_preferences" TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read consent decree obligations" ON "public"."consent_decree_obligations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can read org DMR submissions" ON "public"."dmr_submissions" FOR SELECT TO "authenticated" USING (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE (("npdes_permits"."organization_id" = "public"."get_user_org_id"()) OR ("npdes_permits"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("npdes_permits"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can read org audits" ON "public"."compliance_audits" FOR SELECT TO "authenticated" USING ((("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE (("sites"."organization_id" = "public"."get_user_org_id"()) OR ("sites"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("sites"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))) OR ("site_id" IS NULL)));



CREATE POLICY "Users can read org documents" ON "public"."documents" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL)));



CREATE POLICY "Users can read org enforcement actions" ON "public"."enforcement_actions" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("organization_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
           FROM "public"."organizations" "organizations_1"
          WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))));



CREATE POLICY "Users can read org exceedances" ON "public"."exceedances" FOR SELECT TO "authenticated" USING (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."sites" "s" ON (("o"."site_id" = "s"."id")))
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can read org lab results" ON "public"."lab_results" FOR SELECT TO "authenticated" USING (("sampling_event_id" IN ( SELECT "se"."id"
   FROM ("public"."sampling_events" "se"
     JOIN "public"."sites" "s" ON (("se"."site_id" = "s"."id")))
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can read org outfalls" ON "public"."outfalls" FOR SELECT TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE (("sites"."organization_id" = "public"."get_user_org_id"()) OR ("sites"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("sites"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can read org permit limits" ON "public"."permit_limits" FOR SELECT TO "authenticated" USING (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE (("npdes_permits"."organization_id" = "public"."get_user_org_id"()) OR ("npdes_permits"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("npdes_permits"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can read org permits" ON "public"."npdes_permits" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("organization_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
           FROM "public"."organizations" "organizations_1"
          WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))));



CREATE POLICY "Users can read org role assignments" ON "public"."user_role_assignments" FOR SELECT TO "authenticated" USING (("user_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users can read org sampling events" ON "public"."sampling_events" FOR SELECT TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE (("sites"."organization_id" = "public"."get_user_org_id"()) OR ("sites"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("sites"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can read org sites" ON "public"."sites" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("organization_id" IN ( SELECT "organizations"."id"
   FROM "public"."organizations"
  WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
           FROM "public"."organizations" "organizations_1"
          WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))));



CREATE POLICY "Users can read own notification preferences" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read quarterly reports" ON "public"."quarterly_reports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can self subscribe" ON "public"."report_delivery_recipients" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("source" = 'self_subscribe'::"text") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can update own org discrepancies" ON "public"."discrepancy_reviews" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can update own org lab_results" ON "public"."lab_results" FOR UPDATE TO "authenticated" USING (("sampling_event_id" IN ( SELECT "se"."id"
   FROM ("public"."sampling_events" "se"
     JOIN "public"."sites" "s" ON (("s"."id" = "se"."site_id")))
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"()))))))))) WITH CHECK (("sampling_event_id" IN ( SELECT "se"."id"
   FROM ("public"."sampling_events" "se"
     JOIN "public"."sites" "s" ON (("s"."id" = "se"."site_id")))
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can update own org queue entries" ON "public"."file_processing_queue" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can update own org report templates" ON "public"."report_templates" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can update own org sampling_events" ON "public"."sampling_events" FOR UPDATE TO "authenticated" USING (("site_id" IN ( SELECT "s"."id"
   FROM "public"."sites" "s"
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"()))))))))) WITH CHECK (("site_id" IN ( SELECT "s"."id"
   FROM "public"."sites" "s"
  WHERE (("s"."organization_id" = "public"."get_user_org_id"()) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = "public"."get_user_org_id"()))) OR ("s"."organization_id" IN ( SELECT "organizations"."id"
           FROM "public"."organizations"
          WHERE ("organizations"."parent_id" = ( SELECT "organizations_1"."parent_id"
                   FROM "public"."organizations" "organizations_1"
                  WHERE ("organizations_1"."id" = "public"."get_user_org_id"())))))))));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own subscriptions" ON "public"."report_delivery_recipients" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("source" = 'self_subscribe'::"text") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can view org profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can view own org ECHO DMRs" ON "public"."external_echo_dmrs" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can view own org ECHO facilities" ON "public"."external_echo_facilities" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can view own org MSHA inspections" ON "public"."external_msha_inspections" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can view own org audit logs" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL)));



CREATE POLICY "Users can view own org chunks" ON "public"."document_chunks" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can view own org discrepancies" ON "public"."discrepancy_reviews" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can view own org queue entries" ON "public"."file_processing_queue" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL)));



CREATE POLICY "Users can view own org sync logs" ON "public"."external_sync_log" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users can view own organization" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((("id" = "public"."get_user_org_id"()) OR ("parent_id" = "public"."get_user_org_id"()) OR ("id" = "public"."get_user_parent_org_id"())));



CREATE POLICY "Users can view own role assignments" ON "public"."user_role_assignments" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own tenant" ON "public"."tenants" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "organizations"."tenant_id"
   FROM "public"."organizations"
  WHERE ("organizations"."id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users create governance issues in own org" ON "public"."governance_issues" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Users create work order events" ON "public"."work_order_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_events"."work_order_id") AND ("wo"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Users delete field evidence for accessible records" ON "public"."field_evidence_assets" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (("uploaded_by" = "auth"."uid"()) OR "public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'executive'::"text", 'admin'::"text"]))));



CREATE POLICY "Users delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Users delete own preferences" ON "public"."notification_preferences" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert field evidence for accessible records" ON "public"."field_evidence_assets" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("uploaded_by" = "auth"."uid"()) AND ((("field_visit_id" IS NOT NULL) AND "public"."can_access_field_visit"("field_visit_id")) OR (("governance_issue_id" IS NOT NULL) AND "public"."can_access_governance_issue"("governance_issue_id")))));



CREATE POLICY "Users insert governance issue events" ON "public"."governance_issue_events" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_governance_issue"("governance_issue_id") AND ("actor_user_id" = "auth"."uid"())));



CREATE POLICY "Users insert own approval_history" ON "public"."approval_history" FOR INSERT TO "authenticated" WITH CHECK (("performed_by" = "auth"."uid"()));



CREATE POLICY "Users insert own checklists" ON "public"."daily_readiness_checklists" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("organization_id" = "public"."get_user_org_id"())));



CREATE POLICY "Users insert own org conditional_exemptions" ON "public"."conditional_exemptions" FOR INSERT TO "authenticated" WITH CHECK (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org data_imports" ON "public"."data_imports" FOR INSERT TO "authenticated" WITH CHECK (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org dmr_line_items" ON "public"."dmr_line_items" FOR INSERT TO "authenticated" WITH CHECK (("dmr_submission_id" IN ( SELECT "ds"."id"
   FROM ("public"."dmr_submissions" "ds"
     JOIN "public"."npdes_permits" "p" ON (("ds"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org fish_tissue_results" ON "public"."fish_tissue_results" FOR INSERT TO "authenticated" WITH CHECK (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org outfall_discharge_log" ON "public"."outfall_discharge_log" FOR INSERT TO "authenticated" WITH CHECK (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org outfall_limit_table_assignments" ON "public"."outfall_limit_table_assignments" FOR INSERT TO "authenticated" WITH CHECK (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org permit_amendments" ON "public"."permit_amendments" FOR INSERT TO "authenticated" WITH CHECK (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org permit_limit_tables" ON "public"."permit_limit_tables" FOR INSERT TO "authenticated" WITH CHECK (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org precipitation_events" ON "public"."precipitation_events" FOR INSERT TO "authenticated" WITH CHECK (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org sampling_calendar" ON "public"."sampling_calendar" FOR INSERT TO "authenticated" WITH CHECK (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org sampling_schedules" ON "public"."sampling_schedules" FOR INSERT TO "authenticated" WITH CHECK (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org stream_monitoring_locations" ON "public"."stream_monitoring_locations" FOR INSERT TO "authenticated" WITH CHECK (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org stream_monitoring_results" ON "public"."stream_monitoring_results" FOR INSERT TO "authenticated" WITH CHECK (("location_id" IN ( SELECT "sml"."id"
   FROM ("public"."stream_monitoring_locations" "sml"
     JOIN "public"."sites" "s" ON (("sml"."site_id" = "s"."id")))
  WHERE ("s"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users insert own org wet_test_results" ON "public"."wet_test_results" FOR INSERT TO "authenticated" WITH CHECK (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users manage access issues for accessible visits" ON "public"."access_issues" TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id")) WITH CHECK ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users manage field measurements for accessible visits" ON "public"."field_measurements" TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id")) WITH CHECK ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users manage no discharge events for accessible visits" ON "public"."no_discharge_events" TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id")) WITH CHECK ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users manage outlet inspections for accessible visits" ON "public"."outlet_inspections" TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id")) WITH CHECK ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users manage own preferences" ON "public"."notification_preferences" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own checklists" ON "public"."daily_readiness_checklists" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Users read own training completions" ON "public"."training_completions" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users update assigned or managed corrective actions" ON "public"."corrective_actions" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND (("followup_assigned_to" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['site_manager'::"text", 'environmental_manager'::"text", 'admin'::"text", 'executive'::"text"])))))))) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("recipient_id" = "auth"."uid"())) WITH CHECK (("recipient_id" = "auth"."uid"()));



CREATE POLICY "Users update own org data_imports" ON "public"."data_imports" FOR UPDATE TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"())))) WITH CHECK (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users update own org dmr_line_items" ON "public"."dmr_line_items" FOR UPDATE TO "authenticated" USING (("dmr_submission_id" IN ( SELECT "ds"."id"
   FROM ("public"."dmr_submissions" "ds"
     JOIN "public"."npdes_permits" "p" ON (("ds"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"())))) WITH CHECK (("dmr_submission_id" IN ( SELECT "ds"."id"
   FROM ("public"."dmr_submissions" "ds"
     JOIN "public"."npdes_permits" "p" ON (("ds"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users update own org precipitation_events" ON "public"."precipitation_events" FOR UPDATE TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"())))) WITH CHECK (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users update own org sampling_calendar" ON "public"."sampling_calendar" FOR UPDATE TO "authenticated" USING (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"())))) WITH CHECK (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users update own org sampling_schedules" ON "public"."sampling_schedules" FOR UPDATE TO "authenticated" USING (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"())))) WITH CHECK (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users update own org work orders" ON "public"."work_orders" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND (("assigned_to" = "auth"."uid"()) OR ("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."name" = ANY (ARRAY['site_manager'::"text", 'environmental_manager'::"text", 'admin'::"text", 'executive'::"text"]))))))));



CREATE POLICY "Users view access issues for accessible visits" ON "public"."access_issues" FOR SELECT TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users view accessible field visits" ON "public"."field_visits" FOR SELECT TO "authenticated" USING ("public"."can_access_field_visit"("id"));



CREATE POLICY "Users view accessible governance issues" ON "public"."governance_issues" FOR SELECT TO "authenticated" USING ("public"."can_access_governance_issue"("id"));



CREATE POLICY "Users view accessible sampling calendar" ON "public"."sampling_calendar" FOR SELECT TO "authenticated" USING ("public"."can_access_sampling_calendar_item"("id"));



CREATE POLICY "Users view accessible sampling schedules" ON "public"."sampling_schedules" FOR SELECT TO "authenticated" USING ("public"."can_access_sampling_schedule"("id"));



CREATE POLICY "Users view field evidence for accessible records" ON "public"."field_evidence_assets" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ((("field_visit_id" IS NOT NULL) AND "public"."can_access_field_visit"("field_visit_id")) OR (("governance_issue_id" IS NOT NULL) AND "public"."can_access_governance_issue"("governance_issue_id")) OR "public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'executive'::"text", 'admin'::"text"]))));



CREATE POLICY "Users view field measurements for accessible visits" ON "public"."field_measurements" FOR SELECT TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users view governance issue events" ON "public"."governance_issue_events" FOR SELECT TO "authenticated" USING ("public"."can_access_governance_issue"("governance_issue_id"));



CREATE POLICY "Users view no discharge events for accessible visits" ON "public"."no_discharge_events" FOR SELECT TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users view outlet inspections for accessible visits" ON "public"."outlet_inspections" FOR SELECT TO "authenticated" USING ("public"."can_access_field_visit"("field_visit_id"));



CREATE POLICY "Users view own approval_history" ON "public"."approval_history" FOR SELECT TO "authenticated" USING (("performed_by" = "auth"."uid"()));



CREATE POLICY "Users view own org conditional_exemptions" ON "public"."conditional_exemptions" FOR SELECT TO "authenticated" USING (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org corrections" ON "public"."data_corrections" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org corrective actions" ON "public"."corrective_actions" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org data_imports" ON "public"."data_imports" FOR SELECT TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org delivery recipients" ON "public"."report_delivery_recipients" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org dmr_line_items" ON "public"."dmr_line_items" FOR SELECT TO "authenticated" USING (("dmr_submission_id" IN ( SELECT "ds"."id"
   FROM ("public"."dmr_submissions" "ds"
     JOIN "public"."npdes_permits" "p" ON (("ds"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org fish_tissue_results" ON "public"."fish_tissue_results" FOR SELECT TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org fts monthly totals" ON "public"."fts_monthly_totals" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org fts uploads" ON "public"."fts_uploads" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org fts violations" ON "public"."fts_violations" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org generated reports" ON "public"."generated_reports" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org outfall aliases" ON "public"."outfall_aliases" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org outfall_discharge_log" ON "public"."outfall_discharge_log" FOR SELECT TO "authenticated" USING (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org outfall_limit_table_assignments" ON "public"."outfall_limit_table_assignments" FOR SELECT TO "authenticated" USING (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org permit_amendments" ON "public"."permit_amendments" FOR SELECT TO "authenticated" USING (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org permit_limit_tables" ON "public"."permit_limit_tables" FOR SELECT TO "authenticated" USING (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org precipitation_events" ON "public"."precipitation_events" FOR SELECT TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org report templates" ON "public"."report_templates" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org roadmap tasks" ON "public"."roadmap_tasks" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org sampling_calendar" ON "public"."sampling_calendar" FOR SELECT TO "authenticated" USING (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org sampling_schedules" ON "public"."sampling_schedules" FOR SELECT TO "authenticated" USING (("permit_id" IN ( SELECT "npdes_permits"."id"
   FROM "public"."npdes_permits"
  WHERE ("npdes_permits"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org scheduled reports" ON "public"."scheduled_reports" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view own org stipulated_penalties" ON "public"."stipulated_penalties" FOR SELECT TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org stream_monitoring_locations" ON "public"."stream_monitoring_locations" FOR SELECT TO "authenticated" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org stream_monitoring_results" ON "public"."stream_monitoring_results" FOR SELECT TO "authenticated" USING (("location_id" IN ( SELECT "sml"."id"
   FROM ("public"."stream_monitoring_locations" "sml"
     JOIN "public"."sites" "s" ON (("sml"."site_id" = "s"."id")))
  WHERE ("s"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org wet_test_results" ON "public"."wet_test_results" FOR SELECT TO "authenticated" USING (("outfall_id" IN ( SELECT "o"."id"
   FROM ("public"."outfalls" "o"
     JOIN "public"."npdes_permits" "p" ON (("o"."permit_id" = "p"."id")))
  WHERE ("p"."organization_id" = "public"."get_user_org_id"()))));



CREATE POLICY "Users view own org work order events" ON "public"."work_order_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_events"."work_order_id") AND ("wo"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "Users view own org work orders" ON "public"."work_orders" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "Users view route batches in own org" ON "public"."sampling_route_batches" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("public"."can_manage_sampling_records"() OR ("assigned_to" = "auth"."uid"()))));



CREATE POLICY "Users view route stops in own org" ON "public"."sampling_route_stops" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sampling_route_batches" "rb"
  WHERE (("rb"."id" = "sampling_route_stops"."route_batch_id") AND ("rb"."organization_id" = "public"."get_user_org_id"()) AND ("public"."can_manage_sampling_records"() OR ("rb"."assigned_to" = "auth"."uid"()))))));



CREATE POLICY "Users view sampling calendar adjustments" ON "public"."sampling_calendar_adjustments" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."can_manage_sampling_records"()));



ALTER TABLE "public"."access_issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents_all" ON "public"."agents" USING (true) WITH CHECK (true);



ALTER TABLE "public"."approval_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."archive_manifest" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "archive_manifest_delete" ON "public"."archive_manifest" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "archive_manifest_insert" ON "public"."archive_manifest" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "archive_manifest_select" ON "public"."archive_manifest" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "archive_manifest_update" ON "public"."archive_manifest" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"]))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



ALTER TABLE "public"."audit_checklist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_checklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auto_response_trust" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "auto_send_all" ON "public"."auto_send_rules" USING (true) WITH CHECK (true);



ALTER TABLE "public"."auto_send_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bottle_kit_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."build_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calibration_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklist_items_delete" ON "public"."audit_checklist_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."audit_checklists" "ac"
  WHERE (("ac"."id" = "audit_checklist_items"."checklist_id") AND ("ac"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "checklist_items_insert" ON "public"."audit_checklist_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."audit_checklists" "ac"
  WHERE (("ac"."id" = "audit_checklist_items"."checklist_id") AND ("ac"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "checklist_items_read" ON "public"."audit_checklist_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."audit_checklists" "ac"
  WHERE (("ac"."id" = "audit_checklist_items"."checklist_id") AND ("ac"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "checklist_items_update" ON "public"."audit_checklist_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."audit_checklists" "ac"
  WHERE (("ac"."id" = "audit_checklist_items"."checklist_id") AND ("ac"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "checklists_org_delete" ON "public"."audit_checklists" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "checklists_org_insert" ON "public"."audit_checklists" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "checklists_org_read" ON "public"."audit_checklists" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "checklists_org_update" ON "public"."audit_checklists" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."compliance_audits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compliance_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compliance_violations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conditional_exemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "config_all" ON "public"."email_triage_config" USING (true) WITH CHECK (true);



CREATE POLICY "connections_all" ON "public"."integration_connections" USING (true) WITH CHECK (true);



ALTER TABLE "public"."consent_decree_obligations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_all" ON "public"."contacts" USING (true) WITH CHECK (true);



ALTER TABLE "public"."corrective_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cutover_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cutover_batches_delete" ON "public"."cutover_batches" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_batches_insert" ON "public"."cutover_batches" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_batches_select" ON "public"."cutover_batches" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_batches_update" ON "public"."cutover_batches" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"]))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



ALTER TABLE "public"."cutover_matrix_rows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cutover_matrix_rows_delete" ON "public"."cutover_matrix_rows" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_matrix_rows_insert" ON "public"."cutover_matrix_rows" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_matrix_rows_select" ON "public"."cutover_matrix_rows" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_matrix_rows_update" ON "public"."cutover_matrix_rows" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"]))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



ALTER TABLE "public"."cutover_matrix_uploads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cutover_matrix_uploads_delete" ON "public"."cutover_matrix_uploads" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_matrix_uploads_insert" ON "public"."cutover_matrix_uploads" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_matrix_uploads_select" ON "public"."cutover_matrix_uploads" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "cutover_matrix_uploads_update" ON "public"."cutover_matrix_uploads" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"]))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



ALTER TABLE "public"."daily_readiness_checklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_integrity_checks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delegation_all" ON "public"."email_delegation_rules" USING (true) WITH CHECK (true);



ALTER TABLE "public"."deployment_stages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deployment_stages_delete" ON "public"."deployment_stages" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "deployment_stages_insert" ON "public"."deployment_stages" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "deployment_stages_select" ON "public"."deployment_stages" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "deployment_stages_update" ON "public"."deployment_stages" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."digest_deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "digest_deliveries_all" ON "public"."digest_deliveries" USING (true) WITH CHECK (true);



ALTER TABLE "public"."digest_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "digest_queue_all" ON "public"."digest_queue" USING (true) WITH CHECK (true);



ALTER TABLE "public"."discrepancy_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dmr_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dmr_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doc_completeness_org_insert" ON "public"."document_completeness" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "doc_completeness_org_read" ON "public"."document_completeness" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "doc_completeness_org_update" ON "public"."document_completeness" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."document_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_completeness" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drafts_all" ON "public"."email_drafts" USING (true) WITH CHECK (true);



ALTER TABLE "public"."email_delegation_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_intel" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_intel_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_noise_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_sender_trust" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_triage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_triage_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_voice_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_watch_senders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_whitelist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emails" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "emails_all" ON "public"."emails" USING (true) WITH CHECK (true);



CREATE POLICY "emerg_contacts_org_delete" ON "public"."emergency_contacts" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "emerg_contacts_org_insert" ON "public"."emergency_contacts" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "emerg_contacts_org_read" ON "public"."emergency_contacts" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "emerg_contacts_org_update" ON "public"."emergency_contacts" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "emerg_procedures_org_insert" ON "public"."emergency_procedures" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "emerg_procedures_org_read" ON "public"."emergency_procedures" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "emerg_procedures_org_update" ON "public"."emergency_procedures" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."emergency_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emergency_procedures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enforcement_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "enforcement_org_insert" ON "public"."enforcement_actions" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "enforcement_org_read" ON "public"."enforcement_actions" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "enforcement_org_update" ON "public"."enforcement_actions" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."epa_parameter_code_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escalation_chain_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escalation_chains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exceedances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_echo_dmrs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_echo_facilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_msha_inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_sync_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."field_evidence_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."field_measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."field_outbound_sync_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "field_outbound_sync_log_insert" ON "public"."field_outbound_sync_log" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "field_outbound_sync_log_select" ON "public"."field_outbound_sync_log" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."field_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."file_processing_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fish_tissue_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follow_ups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follow_ups_all" ON "public"."follow_ups" USING (true) WITH CHECK (true);



ALTER TABLE "public"."fts_monthly_totals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fts_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fts_violations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."go_live_checklist_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "go_live_checklist_items_delete" ON "public"."go_live_checklist_items" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "go_live_checklist_items_insert" ON "public"."go_live_checklist_items" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "go_live_checklist_items_select" ON "public"."go_live_checklist_items" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "go_live_checklist_items_update" ON "public"."go_live_checklist_items" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."go_live_checklists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "go_live_checklists_delete" ON "public"."go_live_checklists" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "go_live_checklists_insert" ON "public"."go_live_checklists" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "go_live_checklists_select" ON "public"."go_live_checklists" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "go_live_checklists_update" ON "public"."go_live_checklists" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."go_live_sign_offs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "go_live_sign_offs_insert" ON "public"."go_live_sign_offs" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "go_live_sign_offs_select" ON "public"."go_live_sign_offs" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "gov_reviews_org_insert" ON "public"."governance_reviews" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "gov_reviews_org_read" ON "public"."governance_reviews" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "gov_reviews_org_update" ON "public"."governance_reviews" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."governance_escalation_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "governance_escalation_config_delete" ON "public"."governance_escalation_config" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "governance_escalation_config_insert" ON "public"."governance_escalation_config" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "governance_escalation_config_select" ON "public"."governance_escalation_config" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "governance_escalation_config_update" ON "public"."governance_escalation_config" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."governance_issue_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_issues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."handoff_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "health_logs_org_insert" ON "public"."system_health_logs" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "health_logs_org_read" ON "public"."system_health_logs" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."human_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."innovation_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."innovation_enrichment_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."innovation_grade_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."innovation_ideas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."innovation_packs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integrity_checks_org_insert" ON "public"."data_integrity_checks" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "integrity_checks_org_read" ON "public"."data_integrity_checks" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "integrity_checks_org_update" ON "public"."data_integrity_checks" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."keyword_alert_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "keyword_alerts_all" ON "public"."keyword_alert_rules" USING (true) WITH CHECK (true);



ALTER TABLE "public"."kpi_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_targets_org_insert" ON "public"."kpi_targets" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "kpi_targets_org_read" ON "public"."kpi_targets" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "kpi_targets_org_update" ON "public"."kpi_targets" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."lab_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_holds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legal_holds_org_insert" ON "public"."legal_holds" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "legal_holds_org_read" ON "public"."legal_holds" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "legal_holds_org_update" ON "public"."legal_holds" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."live_program_roster" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "live_program_roster_delete" ON "public"."live_program_roster" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "live_program_roster_insert" ON "public"."live_program_roster" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "live_program_roster_select" ON "public"."live_program_roster" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "live_program_roster_update" ON "public"."live_program_roster" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"]))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



ALTER TABLE "public"."maintenance_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."no_discharge_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "noise_rules_all" ON "public"."email_noise_rules" USING (true) WITH CHECK (true);



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nov_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nov_records_org_insert" ON "public"."nov_records" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "nov_records_org_read" ON "public"."nov_records" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "nov_records_org_update" ON "public"."nov_records" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."npdes_id_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."npdes_permits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."obligation_evidence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "obligation_evidence_org_insert" ON "public"."obligation_evidence" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "obligation_evidence_org_read" ON "public"."obligation_evidence" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "obligation_evidence_org_update" ON "public"."obligation_evidence" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outfall_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outfall_discharge_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outfall_limit_table_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outfalls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outlet_inspections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "overrides_org_insert" ON "public"."human_overrides" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "overrides_org_read" ON "public"."human_overrides" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."parameter_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parameters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permit_amendments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permit_limit_tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permit_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precip_events_insert" ON "public"."precipitation_events" FOR INSERT WITH CHECK ((((EXISTS ( SELECT 1
   FROM "public"."sites" "s"
  WHERE (("s"."id" = "precipitation_events"."site_id") AND ("s"."organization_id" = "public"."get_user_org_id"())))) OR ("organization_id" = "public"."get_user_org_id"())) AND "public"."current_user_has_any_role"(ARRAY['wv_supervisor'::"text", 'environmental_manager'::"text", 'site_manager'::"text", 'admin'::"text"])));



CREATE POLICY "precip_events_select" ON "public"."precipitation_events" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."sites" "s"
  WHERE (("s"."id" = "precipitation_events"."site_id") AND ("s"."organization_id" = "public"."get_user_org_id"())))) OR ("organization_id" = "public"."get_user_org_id"())));



CREATE POLICY "precip_events_update" ON "public"."precipitation_events" FOR UPDATE USING ((((EXISTS ( SELECT 1
   FROM "public"."sites" "s"
  WHERE (("s"."id" = "precipitation_events"."site_id") AND ("s"."organization_id" = "public"."get_user_org_id"())))) OR ("organization_id" = "public"."get_user_org_id"())) AND "public"."current_user_has_any_role"(ARRAY['wv_supervisor'::"text", 'environmental_manager'::"text", 'site_manager'::"text", 'admin'::"text"])));



CREATE POLICY "precip_readings_insert" ON "public"."precipitation_readings" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."weather_stations" "ws"
  WHERE (("ws"."id" = "precipitation_readings"."weather_station_id") AND ("ws"."tenant_id" IN ( SELECT "organizations"."tenant_id"
           FROM "public"."organizations"
          WHERE ("organizations"."id" = "public"."get_user_org_id"())))))) AND "public"."current_user_has_any_role"(ARRAY['wv_supervisor'::"text", 'environmental_manager'::"text", 'field_sampler'::"text", 'float_sampler'::"text", 'admin'::"text"])));



CREATE POLICY "precip_readings_select" ON "public"."precipitation_readings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."weather_stations" "ws"
  WHERE (("ws"."id" = "precipitation_readings"."weather_station_id") AND ("ws"."tenant_id" IN ( SELECT "organizations"."tenant_id"
           FROM "public"."organizations"
          WHERE ("organizations"."id" = "public"."get_user_org_id"())))))));



ALTER TABLE "public"."precipitation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."precipitation_exemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "precipitation_exemptions_delete" ON "public"."precipitation_exemptions" FOR DELETE TO "authenticated" USING (("public"."current_user_has_any_role"(ARRAY['admin'::"text"]) AND (("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL))));



CREATE POLICY "precipitation_exemptions_insert" ON "public"."precipitation_exemptions" FOR INSERT TO "authenticated" WITH CHECK (("public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'site_manager'::"text", 'admin'::"text"]) AND (("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL))));



CREATE POLICY "precipitation_exemptions_select" ON "public"."precipitation_exemptions" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL)));



CREATE POLICY "precipitation_exemptions_update" ON "public"."precipitation_exemptions" FOR UPDATE TO "authenticated" USING (("public"."current_user_has_any_role"(ARRAY['executive'::"text", 'environmental_manager'::"text", 'admin'::"text"]) AND (("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL)))) WITH CHECK (("public"."current_user_has_any_role"(ARRAY['executive'::"text", 'environmental_manager'::"text", 'admin'::"text"]) AND (("organization_id" = "public"."get_user_org_id"()) OR ("organization_id" IS NULL))));



ALTER TABLE "public"."precipitation_readings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quarterly_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rca_findings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rca_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."readiness_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."readiness_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receiving_waters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."regulatory_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."regulatory_deadlines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_delivery_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "report_runs_insert" ON "public"."report_runs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."scheduled_reports" "sr"
  WHERE (("sr"."id" = "report_runs"."scheduled_report_id") AND ("sr"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "report_runs_read" ON "public"."report_runs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."scheduled_reports" "sr"
  WHERE (("sr"."id" = "report_runs"."scheduled_report_id") AND ("sr"."organization_id" = "public"."get_user_org_id"())))));



ALTER TABLE "public"."report_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retention_org_insert" ON "public"."retention_policies" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "retention_org_read" ON "public"."retention_policies" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "retention_org_update" ON "public"."retention_policies" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."retention_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roadmap_sync_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roadmap_sync_events_service_role_all" ON "public"."roadmap_sync_events" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."roadmap_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sampling_calendar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sampling_calendar_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sampling_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sampling_route_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sampling_route_stops" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sampling_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sched_reports_org_delete" ON "public"."scheduled_reports" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "sched_reports_org_insert" ON "public"."scheduled_reports" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "sched_reports_org_read" ON "public"."scheduled_reports" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "sched_reports_org_update" ON "public"."scheduled_reports" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."scheduled_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_weather_station_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skill_execution_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skill_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skill_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."smoke_test_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "smoke_test_runs_insert" ON "public"."smoke_test_runs" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "smoke_test_runs_select" ON "public"."smoke_test_runs" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "smoke_test_runs_update" ON "public"."smoke_test_runs" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "snapshots_org_insert" ON "public"."compliance_snapshots" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "snapshots_org_read" ON "public"."compliance_snapshots" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."state_regulatory_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stipulated_penalties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stream_monitoring_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stream_monitoring_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "swsa_delete" ON "public"."site_weather_station_assignments" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."sites" "s"
  WHERE (("s"."id" = "site_weather_station_assignments"."site_id") AND ("s"."organization_id" = "public"."get_user_org_id"())))) AND "public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'admin'::"text"])));



CREATE POLICY "swsa_insert" ON "public"."site_weather_station_assignments" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."sites" "s"
  WHERE (("s"."id" = "site_weather_station_assignments"."site_id") AND ("s"."organization_id" = "public"."get_user_org_id"())))) AND "public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'admin'::"text"])));



CREATE POLICY "swsa_select" ON "public"."site_weather_station_assignments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."sites" "s"
  WHERE (("s"."id" = "site_weather_station_assignments"."site_id") AND ("s"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "swsa_update" ON "public"."site_weather_station_assignments" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."sites" "s"
  WHERE (("s"."id" = "site_weather_station_assignments"."site_id") AND ("s"."organization_id" = "public"."get_user_org_id"())))) AND "public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'admin'::"text"])));



ALTER TABLE "public"."system_health_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_requirements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "triage_all" ON "public"."email_triage" USING (true) WITH CHECK (true);



CREATE POLICY "trust_all" ON "public"."auto_response_trust" USING (true) WITH CHECK (true);



ALTER TABLE "public"."unit_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_role_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "violations_org_insert" ON "public"."compliance_violations" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "violations_org_read" ON "public"."compliance_violations" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "violations_org_update" ON "public"."compliance_violations" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "vip_all" ON "public"."vip_contacts" USING (true) WITH CHECK (true);



ALTER TABLE "public"."vip_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "voice_all" ON "public"."email_voice_profile" USING (true) WITH CHECK (true);



ALTER TABLE "public"."weather_stations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weather_stations_delete" ON "public"."weather_stations" FOR DELETE USING ((("tenant_id" IN ( SELECT "organizations"."tenant_id"
   FROM "public"."organizations"
  WHERE ("organizations"."id" = "public"."get_user_org_id"()))) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "weather_stations_insert" ON "public"."weather_stations" FOR INSERT WITH CHECK ((("tenant_id" IN ( SELECT "organizations"."tenant_id"
   FROM "public"."organizations"
  WHERE ("organizations"."id" = "public"."get_user_org_id"()))) AND "public"."current_user_has_any_role"(ARRAY['admin'::"text"])));



CREATE POLICY "weather_stations_select" ON "public"."weather_stations" FOR SELECT USING (("tenant_id" IN ( SELECT "organizations"."tenant_id"
   FROM "public"."organizations"
  WHERE ("organizations"."id" = "public"."get_user_org_id"()))));



CREATE POLICY "weather_stations_update" ON "public"."weather_stations" FOR UPDATE USING ((("tenant_id" IN ( SELECT "organizations"."tenant_id"
   FROM "public"."organizations"
  WHERE ("organizations"."id" = "public"."get_user_org_id"()))) AND "public"."current_user_has_any_role"(ARRAY['environmental_manager'::"text", 'admin'::"text"]))) WITH CHECK (("tenant_id" IN ( SELECT "organizations"."tenant_id"
   FROM "public"."organizations"
  WHERE ("organizations"."id" = "public"."get_user_org_id"()))));



ALTER TABLE "public"."wet_test_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whitelist_all" ON "public"."email_whitelist" USING (true) WITH CHECK (true);



ALTER TABLE "public"."work_order_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_order_events_insert" ON "public"."work_order_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_events"."work_order_id") AND ("wo"."organization_id" = "public"."get_user_org_id"())))));



CREATE POLICY "work_order_events_read" ON "public"."work_order_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."work_orders" "wo"
  WHERE (("wo"."id" = "work_order_events"."work_order_id") AND ("wo"."organization_id" = "public"."get_user_org_id"())))));



ALTER TABLE "public"."work_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_orders_org_insert" ON "public"."work_orders" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "work_orders_org_read" ON "public"."work_orders" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "work_orders_org_update" ON "public"."work_orders" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workspaces_all" ON "public"."workspaces" USING (true) WITH CHECK (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_sampling_calendar_adjustment"("p_calendar_id" "uuid", "p_adjustment_type" "text", "p_reason" "text", "p_new_scheduled_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_sampling_calendar_adjustment"("p_calendar_id" "uuid", "p_adjustment_type" "text", "p_reason" "text", "p_new_scheduled_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_sampling_calendar_adjustment"("p_calendar_id" "uuid", "p_adjustment_type" "text", "p_reason" "text", "p_new_scheduled_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_org_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_org_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_org_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_scoped_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_scoped_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_scoped_table"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_field_visit_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_field_visit_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_field_visit_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_governance_issue_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_governance_issue_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_governance_issue_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_governance_issue_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_governance_issue_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_governance_issue_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_classify_governance_issue"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_classify_governance_issue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_classify_governance_issue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_ca_from_enforcement"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_ca_from_enforcement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_ca_from_enforcement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_ca_from_exceedance"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_ca_from_exceedance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_ca_from_exceedance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_ca_from_incident"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_ca_from_incident"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_ca_from_incident"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_expire_training_completions"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_expire_training_completions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_expire_training_completions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_insert_discrepancies"("rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."batch_insert_discrepancies"("rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_insert_discrepancies"("rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_days_at_risk"("p_next_due_date" "date", "p_completion_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_days_at_risk"("p_next_due_date" "date", "p_completion_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_days_at_risk"("p_next_due_date" "date", "p_completion_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_dmr_values"("p_submission_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_dmr_values"("p_submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_dmr_values"("p_submission_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_document_completeness"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_document_completeness"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_document_completeness"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_go_live_readiness"("p_checklist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_go_live_readiness"("p_checklist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_go_live_readiness"("p_checklist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_stipulated_penalty"("p_obligation_type" "text", "p_days_late" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_stipulated_penalty"("p_obligation_type" "text", "p_days_late" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_stipulated_penalty"("p_obligation_type" "text", "p_days_late" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_field_visit"("p_visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_field_visit"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_field_visit"("p_visit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_governance_issue"("p_issue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_governance_issue"("p_issue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_governance_issue"("p_issue_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_sampling_calendar_item"("p_calendar_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_sampling_calendar_item"("p_calendar_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_sampling_calendar_item"("p_calendar_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_sampling_schedule"("p_schedule_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_sampling_schedule"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_sampling_schedule"("p_schedule_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_sampling_records"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_sampling_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_sampling_records"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_system_health_snapshot"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."capture_system_health_snapshot"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_system_health_snapshot"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_noise_rules"("p_email_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_noise_rules"("p_email_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_noise_rules"("p_email_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_rain_event_thresholds"("p_station_id" "uuid", "p_reading_date" "date", "p_rainfall_inches" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."check_rain_event_thresholds"("p_station_id" "uuid", "p_reading_date" "date", "p_rainfall_inches" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rain_event_thresholds"("p_station_id" "uuid", "p_reading_date" "date", "p_rainfall_inches" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_readiness_gate"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_readiness_gate"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_readiness_gate"("p_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_training_readiness"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_training_readiness"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_training_readiness"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_field_visit"("p_field_visit_id" "uuid", "p_outcome" "text", "p_completed_latitude" numeric, "p_completed_longitude" numeric, "p_weather_conditions" "text", "p_field_notes" "text", "p_potential_force_majeure" boolean, "p_potential_force_majeure_notes" "text", "p_no_discharge_narrative" "text", "p_no_discharge_observed_condition" "text", "p_no_discharge_obstruction_observed" boolean, "p_no_discharge_obstruction_details" "text", "p_access_issue_type" "text", "p_access_issue_obstruction_narrative" "text", "p_access_issue_contact_attempted" boolean, "p_access_issue_contact_name" "text", "p_access_issue_contact_outcome" "text", "p_actor_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_field_visit"("p_field_visit_id" "uuid", "p_outcome" "text", "p_completed_latitude" numeric, "p_completed_longitude" numeric, "p_weather_conditions" "text", "p_field_notes" "text", "p_potential_force_majeure" boolean, "p_potential_force_majeure_notes" "text", "p_no_discharge_narrative" "text", "p_no_discharge_observed_condition" "text", "p_no_discharge_obstruction_observed" boolean, "p_no_discharge_obstruction_details" "text", "p_access_issue_type" "text", "p_access_issue_obstruction_narrative" "text", "p_access_issue_contact_attempted" boolean, "p_access_issue_contact_name" "text", "p_access_issue_contact_outcome" "text", "p_actor_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_field_visit"("p_field_visit_id" "uuid", "p_outcome" "text", "p_completed_latitude" numeric, "p_completed_longitude" numeric, "p_weather_conditions" "text", "p_field_notes" "text", "p_potential_force_majeure" boolean, "p_potential_force_majeure_notes" "text", "p_no_discharge_narrative" "text", "p_no_discharge_observed_condition" "text", "p_no_discharge_obstruction_observed" boolean, "p_no_discharge_obstruction_details" "text", "p_access_issue_type" "text", "p_access_issue_obstruction_narrative" "text", "p_access_issue_contact_attempted" boolean, "p_access_issue_contact_name" "text", "p_access_issue_contact_outcome" "text", "p_actor_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_ca_from_incident"("p_incident_id" "uuid", "p_title" "text", "p_priority" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_ca_from_incident"("p_incident_id" "uuid", "p_title" "text", "p_priority" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ca_from_incident"("p_incident_id" "uuid", "p_title" "text", "p_priority" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_incident"("p_incident_type_code" "text", "p_title" "text", "p_description" "text", "p_severity" "public"."incident_severity", "p_field_visit_id" "uuid", "p_decree_paragraphs" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_incident"("p_incident_type_code" "text", "p_title" "text", "p_description" "text", "p_severity" "public"."incident_severity", "p_field_visit_id" "uuid", "p_decree_paragraphs" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_incident"("p_incident_type_code" "text", "p_title" "text", "p_description" "text", "p_severity" "public"."incident_severity", "p_field_visit_id" "uuid", "p_decree_paragraphs" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_manual_sampling_calendar_entry"("p_permit_id" "uuid", "p_outfall_id" "uuid", "p_parameter_id" "uuid", "p_scheduled_date" "date", "p_entry_type" "text", "p_route_zone" "text", "p_default_assigned_to" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_manual_sampling_calendar_entry"("p_permit_id" "uuid", "p_outfall_id" "uuid", "p_parameter_id" "uuid", "p_scheduled_date" "date", "p_entry_type" "text", "p_route_zone" "text", "p_default_assigned_to" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_manual_sampling_calendar_entry"("p_permit_id" "uuid", "p_outfall_id" "uuid", "p_parameter_id" "uuid", "p_scheduled_date" "date", "p_entry_type" "text", "p_route_zone" "text", "p_default_assigned_to" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_sampling_route_batch"("p_route_date" "date", "p_route_zone" "text", "p_assigned_to" "uuid", "p_notes" "text", "p_calendar_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_sampling_route_batch"("p_route_date" "date", "p_route_zone" "text", "p_assigned_to" "uuid", "p_notes" "text", "p_calendar_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sampling_route_batch"("p_route_date" "date", "p_route_zone" "text", "p_assigned_to" "uuid", "p_notes" "text", "p_calendar_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_has_any_role"("p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_has_any_role"("p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_has_any_role"("p_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."cutover_scope_table_count"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cutover_scope_table_count"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cutover_scope_table_count"("p_batch_id" "uuid", "p_org_id" "uuid", "p_table_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."derive_sampling_priority_rank"("p_parameter_name" "text", "p_scheduled_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."derive_sampling_priority_rank"("p_parameter_name" "text", "p_scheduled_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."derive_sampling_priority_rank"("p_parameter_name" "text", "p_scheduled_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."derive_sampling_priority_reason"("p_parameter_name" "text", "p_scheduled_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."derive_sampling_priority_reason"("p_parameter_name" "text", "p_scheduled_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."derive_sampling_priority_reason"("p_parameter_name" "text", "p_scheduled_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_exceedance"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_exceedance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_exceedance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_sampling_route_batch"("p_route_batch_id" "uuid", "p_field_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_sampling_route_batch"("p_route_batch_id" "uuid", "p_field_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_sampling_route_batch"("p_route_batch_id" "uuid", "p_field_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_cutover_write_freeze"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_cutover_write_freeze"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_cutover_write_freeze"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_field_visit_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_field_visit_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_field_visit_completion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_field_visit_editable"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_field_visit_editable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_field_visit_editable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."escalate_incident"("p_incident_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."escalate_incident"("p_incident_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."escalate_incident"("p_incident_id" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_cutover_batch"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_cutover_batch"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_cutover_batch"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_readonly_query"("query_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_readonly_query"("query_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_readonly_query"("query_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_readonly_query"("query_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_roadmap_tasks_mark_linear_pending"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_roadmap_tasks_mark_linear_pending"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_roadmap_tasks_mark_linear_pending"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_compliance_snapshot"("p_org_id" "uuid", "p_snapshot_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_compliance_snapshot"("p_org_id" "uuid", "p_snapshot_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_compliance_snapshot"("p_org_id" "uuid", "p_snapshot_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_sampling_calendar"("p_month_start" "date", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_sampling_calendar"("p_month_start" "date", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_sampling_calendar"("p_month_start" "date", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_archive_batch_summary"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_archive_batch_summary"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_archive_batch_summary"("p_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_archive_table_preview"("p_batch_id" "uuid", "p_table_name" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_archive_table_preview"("p_batch_id" "uuid", "p_table_name" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_archive_table_preview"("p_batch_id" "uuid", "p_table_name" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_audit_readiness_score"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_audit_readiness_score"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_audit_readiness_score"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_compliance_trend"("p_org_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_compliance_trend"("p_org_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_compliance_trend"("p_org_id" "uuid", "p_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_echo_dmr_coverage"("p_site_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_echo_dmr_coverage"("p_site_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_echo_dmr_coverage"("p_site_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_embedding_extracted_data"("p_queue_id" "uuid", "p_max_records" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_embedding_extracted_data"("p_queue_id" "uuid", "p_max_records" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_embedding_extracted_data"("p_queue_id" "uuid", "p_max_records" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_equipment_due_calibration"("p_org_id" "uuid", "p_within_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_equipment_due_calibration"("p_org_id" "uuid", "p_within_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_equipment_due_calibration"("p_org_id" "uuid", "p_within_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inbox_zero_stats"("p_user_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_inbox_zero_stats"("p_user_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inbox_zero_stats"("p_user_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rls_policy_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_rls_policy_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rls_policy_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unit_conversion"("p_parameter_id" "uuid", "p_from_unit" "text", "p_to_unit" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unit_conversion"("p_parameter_id" "uuid", "p_from_unit" "text", "p_to_unit" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unit_conversion"("p_parameter_id" "uuid", "p_from_unit" "text", "p_to_unit" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_parent_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_parent_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_parent_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."in_live_program_scope"("p_org_id" "uuid", "p_site_id" "uuid", "p_permit_id" "uuid", "p_outfall_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."in_live_program_scope"("p_org_id" "uuid", "p_site_id" "uuid", "p_permit_id" "uuid", "p_outfall_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_live_program_scope"("p_org_id" "uuid", "p_site_id" "uuid", "p_permit_id" "uuid", "p_outfall_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_template_run_count"("template_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_template_run_count"("template_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_template_run_count"("template_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."cutover_batches" TO "anon";
GRANT ALL ON TABLE "public"."cutover_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."cutover_batches" TO "service_role";



GRANT ALL ON FUNCTION "public"."list_archive_batches"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_archive_batches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_archive_batches"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_ca_signature_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_ca_signature_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_ca_signature_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_permit_limit_review_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_permit_limit_review_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_permit_limit_review_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_roadmap_sync_event"("p_direction" "text", "p_task_id" "text", "p_linear_issue_id" "text", "p_action" "text", "p_changed_fields" "jsonb", "p_error_message" "text", "p_webhook_id" "text", "p_actor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_roadmap_sync_event"("p_direction" "text", "p_task_id" "text", "p_linear_issue_id" "text", "p_action" "text", "p_changed_fields" "jsonb", "p_error_message" "text", "p_webhook_id" "text", "p_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "filter_org_id" "uuid", "filter_state" "text", "filter_document_type" "text", "filter_permit_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "filter_org_id" "uuid", "filter_state" "text", "filter_document_type" "text", "filter_permit_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "filter_org_id" "uuid", "filter_state" "text", "filter_document_type" "text", "filter_permit_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_ca_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_ca_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_ca_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_ca_signature"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_ca_signature"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_ca_signature"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_ca_step_advanced"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_ca_step_advanced"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_ca_step_advanced"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_dmr_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_dmr_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_dmr_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_legal_hold_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_legal_hold_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_legal_hold_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_work_order_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_work_order_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_work_order_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."override_readiness_gate"("p_batch_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."override_readiness_gate"("p_batch_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."override_readiness_gate"("p_batch_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."patrol_connection_pool_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."patrol_connection_pool_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."patrol_data_integrity_snapshot"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."patrol_data_integrity_snapshot"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_exemption_audit_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_exemption_audit_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_exemption_audit_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_rain_event_audit_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_rain_event_audit_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_rain_event_audit_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."preview_cutover_batch"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."preview_cutover_batch"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."preview_cutover_batch"("p_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rebuild_live_compliance_snapshots"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rebuild_live_compliance_snapshots"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rebuild_live_compliance_snapshots"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_sampling_route_batch_status"("p_route_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_sampling_route_batch_status"("p_route_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_sampling_route_batch_status"("p_route_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_sampling_calendar_statuses"("p_organization_id" "uuid", "p_as_of" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_sampling_calendar_statuses"("p_organization_id" "uuid", "p_as_of" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_sampling_calendar_statuses"("p_organization_id" "uuid", "p_as_of" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_cutover_batch_rows"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_cutover_batch_rows"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_cutover_batch_rows"("p_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_follow_up_by_thread"("p_thread_key" "text", "p_from_email" "text", "p_resolution_email_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_follow_up_by_thread"("p_thread_key" "text", "p_from_email" "text", "p_resolution_email_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_follow_up_by_thread"("p_thread_key" "text", "p_from_email" "text", "p_resolution_email_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_incident"("p_incident_id" "uuid", "p_resolution_notes" "text", "p_status" "public"."incident_status") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_incident"("p_incident_id" "uuid", "p_resolution_notes" "text", "p_status" "public"."incident_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_incident"("p_incident_id" "uuid", "p_resolution_notes" "text", "p_status" "public"."incident_status") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_parameter"("p_code" "text", "p_alias" "text", "p_state_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_parameter"("p_code" "text", "p_alias" "text", "p_state_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_parameter"("p_code" "text", "p_alias" "text", "p_state_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_archive_batch"("p_batch_id" "uuid", "p_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_archive_batch"("p_batch_id" "uuid", "p_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_archive_batch"("p_batch_id" "uuid", "p_mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."run_data_integrity_check"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."run_data_integrity_check"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_data_integrity_check"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."run_retention_policy_audit"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."run_retention_policy_audit"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_retention_policy_audit"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_emails"("search_query" "text", "p_account_id" "uuid", "p_tiers" integer[], "p_actions" "text"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_emails"("search_query" "text", "p_account_id" "uuid", "p_tiers" integer[], "p_actions" "text"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_emails"("search_query" "text", "p_account_id" "uuid", "p_tiers" integer[], "p_actions" "text"[], "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_tom_memory"("query_text" "text", "source_filter" "text", "max_results" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_tom_memory"("query_text" "text", "source_filter" "text", "max_results" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_tom_memory"("query_text" "text", "source_filter" "text", "max_results" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_tom_memory_exact"("query_text" "text", "source_filter" "text", "max_results" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_tom_memory_exact"("query_text" "text", "source_filter" "text", "max_results" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_tom_memory_exact"("query_text" "text", "source_filter" "text", "max_results" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."send_notification"("p_recipient_id" "uuid", "p_event_type" "text", "p_title" "text", "p_body" "text", "p_priority" "public"."notification_priority", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."send_notification"("p_recipient_id" "uuid", "p_event_type" "text", "p_title" "text", "p_body" "text", "p_priority" "public"."notification_priority", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_notification"("p_recipient_id" "uuid", "p_event_type" "text", "p_title" "text", "p_body" "text", "p_priority" "public"."notification_priority", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_org_incident_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_org_incident_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_org_incident_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_sampling_calendar_from_field_visit"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_sampling_calendar_from_field_visit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_sampling_calendar_from_field_visit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_sampling_route_batch_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_sampling_route_batch_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_sampling_route_batch_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_sampling_route_stop_from_calendar"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_sampling_route_stop_from_calendar"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_sampling_route_stop_from_calendar"() TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_tasks" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_tasks" TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_status_from_linear"("p_task_id" "text", "p_new_status" "text", "p_actor" "text", "p_webhook_id" "text", "p_linear_issue_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_status_from_linear"("p_task_id" "text", "p_new_status" "text", "p_actor" "text", "p_webhook_id" "text", "p_linear_issue_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_audit_checklist_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_audit_checklist_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_audit_checklist_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ca_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ca_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ca_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_dmr_submission_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dmr_submission_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dmr_submission_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_field_ops_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_field_ops_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_field_ops_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_generic_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_generic_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_generic_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_go_live_checklist_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_go_live_checklist_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_go_live_checklist_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_governance_issue_status"("p_issue_id" "uuid", "p_current_status" "text", "p_final_disposition" "text", "p_notes" "text", "p_actor_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_governance_issue_status"("p_issue_id" "uuid", "p_current_status" "text", "p_final_disposition" "text", "p_notes" "text", "p_actor_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_governance_issue_status"("p_issue_id" "uuid", "p_current_status" "text", "p_final_disposition" "text", "p_notes" "text", "p_actor_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_scheduled_report_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_scheduled_report_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_scheduled_report_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_work_order_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_work_order_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_work_order_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_dmr_submission"("p_submission_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_dmr_submission"("p_submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_dmr_submission"("p_submission_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_field_visit_relationships"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_field_visit_relationships"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_field_visit_relationships"() TO "service_role";



GRANT ALL ON TABLE "public"."access_issues" TO "anon";
GRANT ALL ON TABLE "public"."access_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."access_issues" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."approval_history" TO "anon";
GRANT ALL ON TABLE "public"."approval_history" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_history" TO "service_role";



GRANT ALL ON TABLE "public"."archive_manifest" TO "anon";
GRANT ALL ON TABLE "public"."archive_manifest" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_manifest" TO "service_role";



GRANT ALL ON TABLE "public"."audit_checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."audit_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."audit_checklists" TO "anon";
GRANT ALL ON TABLE "public"."audit_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."auto_response_trust" TO "anon";
GRANT ALL ON TABLE "public"."auto_response_trust" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_response_trust" TO "service_role";



GRANT ALL ON TABLE "public"."auto_send_rules" TO "anon";
GRANT ALL ON TABLE "public"."auto_send_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_send_rules" TO "service_role";



GRANT ALL ON TABLE "public"."bottle_kit_inventory" TO "anon";
GRANT ALL ON TABLE "public"."bottle_kit_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."bottle_kit_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."build_jobs" TO "anon";
GRANT ALL ON TABLE "public"."build_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."build_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."calibration_logs" TO "anon";
GRANT ALL ON TABLE "public"."calibration_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."calibration_logs" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_audits" TO "anon";
GRANT ALL ON TABLE "public"."compliance_audits" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_audits" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."compliance_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_violations" TO "anon";
GRANT ALL ON TABLE "public"."compliance_violations" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_violations" TO "service_role";



GRANT ALL ON TABLE "public"."conditional_exemptions" TO "anon";
GRANT ALL ON TABLE "public"."conditional_exemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."conditional_exemptions" TO "service_role";



GRANT ALL ON TABLE "public"."consent_decree_obligations" TO "anon";
GRANT ALL ON TABLE "public"."consent_decree_obligations" TO "authenticated";
GRANT ALL ON TABLE "public"."consent_decree_obligations" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."corrective_actions" TO "anon";
GRANT ALL ON TABLE "public"."corrective_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."corrective_actions" TO "service_role";



GRANT ALL ON TABLE "public"."cutover_matrix_rows" TO "anon";
GRANT ALL ON TABLE "public"."cutover_matrix_rows" TO "authenticated";
GRANT ALL ON TABLE "public"."cutover_matrix_rows" TO "service_role";



GRANT ALL ON TABLE "public"."cutover_matrix_uploads" TO "anon";
GRANT ALL ON TABLE "public"."cutover_matrix_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."cutover_matrix_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."daily_readiness_checklists" TO "anon";
GRANT ALL ON TABLE "public"."daily_readiness_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_readiness_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."data_corrections" TO "anon";
GRANT ALL ON TABLE "public"."data_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."data_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."data_imports" TO "anon";
GRANT ALL ON TABLE "public"."data_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."data_imports" TO "service_role";



GRANT ALL ON TABLE "public"."data_integrity_checks" TO "anon";
GRANT ALL ON TABLE "public"."data_integrity_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."data_integrity_checks" TO "service_role";



GRANT ALL ON TABLE "public"."deployment_stages" TO "anon";
GRANT ALL ON TABLE "public"."deployment_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."deployment_stages" TO "service_role";



GRANT ALL ON TABLE "public"."digest_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."digest_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."digest_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."digest_queue" TO "anon";
GRANT ALL ON TABLE "public"."digest_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."digest_queue" TO "service_role";



GRANT ALL ON TABLE "public"."discrepancy_reviews" TO "anon";
GRANT ALL ON TABLE "public"."discrepancy_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."discrepancy_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."dmr_line_items" TO "anon";
GRANT ALL ON TABLE "public"."dmr_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."dmr_line_items" TO "service_role";



GRANT ALL ON TABLE "public"."dmr_submissions" TO "anon";
GRANT ALL ON TABLE "public"."dmr_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."dmr_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."document_chunks" TO "anon";
GRANT ALL ON TABLE "public"."document_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."document_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."document_completeness" TO "anon";
GRANT ALL ON TABLE "public"."document_completeness" TO "authenticated";
GRANT ALL ON TABLE "public"."document_completeness" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."email_delegation_rules" TO "anon";
GRANT ALL ON TABLE "public"."email_delegation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."email_delegation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."email_drafts" TO "anon";
GRANT ALL ON TABLE "public"."email_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."email_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."email_intel" TO "anon";
GRANT ALL ON TABLE "public"."email_intel" TO "authenticated";
GRANT ALL ON TABLE "public"."email_intel" TO "service_role";



GRANT ALL ON TABLE "public"."email_intel_items" TO "anon";
GRANT ALL ON TABLE "public"."email_intel_items" TO "authenticated";
GRANT ALL ON TABLE "public"."email_intel_items" TO "service_role";



GRANT ALL ON TABLE "public"."email_noise_rules" TO "anon";
GRANT ALL ON TABLE "public"."email_noise_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."email_noise_rules" TO "service_role";



GRANT ALL ON TABLE "public"."email_sender_trust" TO "anon";
GRANT ALL ON TABLE "public"."email_sender_trust" TO "authenticated";
GRANT ALL ON TABLE "public"."email_sender_trust" TO "service_role";



GRANT ALL ON TABLE "public"."email_sync_state" TO "anon";
GRANT ALL ON TABLE "public"."email_sync_state" TO "authenticated";
GRANT ALL ON TABLE "public"."email_sync_state" TO "service_role";



GRANT ALL ON TABLE "public"."email_triage" TO "anon";
GRANT ALL ON TABLE "public"."email_triage" TO "authenticated";
GRANT ALL ON TABLE "public"."email_triage" TO "service_role";



GRANT ALL ON TABLE "public"."email_triage_config" TO "anon";
GRANT ALL ON TABLE "public"."email_triage_config" TO "authenticated";
GRANT ALL ON TABLE "public"."email_triage_config" TO "service_role";



GRANT ALL ON TABLE "public"."email_voice_profile" TO "anon";
GRANT ALL ON TABLE "public"."email_voice_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."email_voice_profile" TO "service_role";



GRANT ALL ON TABLE "public"."email_watch_senders" TO "anon";
GRANT ALL ON TABLE "public"."email_watch_senders" TO "authenticated";
GRANT ALL ON TABLE "public"."email_watch_senders" TO "service_role";



GRANT ALL ON TABLE "public"."email_whitelist" TO "anon";
GRANT ALL ON TABLE "public"."email_whitelist" TO "authenticated";
GRANT ALL ON TABLE "public"."email_whitelist" TO "service_role";



GRANT ALL ON TABLE "public"."emails" TO "anon";
GRANT ALL ON TABLE "public"."emails" TO "authenticated";
GRANT ALL ON TABLE "public"."emails" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_contacts" TO "anon";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_procedures" TO "anon";
GRANT ALL ON TABLE "public"."emergency_procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_procedures" TO "service_role";



GRANT ALL ON TABLE "public"."enforcement_actions" TO "anon";
GRANT ALL ON TABLE "public"."enforcement_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."enforcement_actions" TO "service_role";



GRANT ALL ON TABLE "public"."epa_parameter_code_map" TO "anon";
GRANT ALL ON TABLE "public"."epa_parameter_code_map" TO "authenticated";
GRANT ALL ON TABLE "public"."epa_parameter_code_map" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_assignments" TO "anon";
GRANT ALL ON TABLE "public"."equipment_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_catalog" TO "anon";
GRANT ALL ON TABLE "public"."equipment_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."escalation_chain_steps" TO "anon";
GRANT ALL ON TABLE "public"."escalation_chain_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."escalation_chain_steps" TO "service_role";



GRANT ALL ON TABLE "public"."escalation_chains" TO "anon";
GRANT ALL ON TABLE "public"."escalation_chains" TO "authenticated";
GRANT ALL ON TABLE "public"."escalation_chains" TO "service_role";



GRANT ALL ON TABLE "public"."exceedances" TO "anon";
GRANT ALL ON TABLE "public"."exceedances" TO "authenticated";
GRANT ALL ON TABLE "public"."exceedances" TO "service_role";



GRANT ALL ON TABLE "public"."external_echo_dmrs" TO "anon";
GRANT ALL ON TABLE "public"."external_echo_dmrs" TO "authenticated";
GRANT ALL ON TABLE "public"."external_echo_dmrs" TO "service_role";



GRANT ALL ON TABLE "public"."external_echo_facilities" TO "anon";
GRANT ALL ON TABLE "public"."external_echo_facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."external_echo_facilities" TO "service_role";



GRANT ALL ON TABLE "public"."external_msha_inspections" TO "anon";
GRANT ALL ON TABLE "public"."external_msha_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."external_msha_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."external_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."external_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."external_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."field_evidence_assets" TO "anon";
GRANT ALL ON TABLE "public"."field_evidence_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."field_evidence_assets" TO "service_role";



GRANT ALL ON TABLE "public"."field_measurements" TO "anon";
GRANT ALL ON TABLE "public"."field_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."field_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."field_outbound_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."field_outbound_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."field_outbound_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."field_visits" TO "anon";
GRANT ALL ON TABLE "public"."field_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."field_visits" TO "service_role";



GRANT ALL ON TABLE "public"."file_processing_queue" TO "anon";
GRANT ALL ON TABLE "public"."file_processing_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."file_processing_queue" TO "service_role";



GRANT ALL ON TABLE "public"."fish_tissue_results" TO "anon";
GRANT ALL ON TABLE "public"."fish_tissue_results" TO "authenticated";
GRANT ALL ON TABLE "public"."fish_tissue_results" TO "service_role";



GRANT ALL ON TABLE "public"."follow_ups" TO "anon";
GRANT ALL ON TABLE "public"."follow_ups" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_ups" TO "service_role";



GRANT ALL ON TABLE "public"."fts_monthly_totals" TO "anon";
GRANT ALL ON TABLE "public"."fts_monthly_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."fts_monthly_totals" TO "service_role";



GRANT ALL ON TABLE "public"."fts_uploads" TO "anon";
GRANT ALL ON TABLE "public"."fts_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."fts_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."fts_violations" TO "anon";
GRANT ALL ON TABLE "public"."fts_violations" TO "authenticated";
GRANT ALL ON TABLE "public"."fts_violations" TO "service_role";



GRANT ALL ON TABLE "public"."generated_reports" TO "anon";
GRANT ALL ON TABLE "public"."generated_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_reports" TO "service_role";



GRANT ALL ON TABLE "public"."go_live_checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."go_live_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."go_live_checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."go_live_checklists" TO "anon";
GRANT ALL ON TABLE "public"."go_live_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."go_live_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."go_live_sign_offs" TO "anon";
GRANT ALL ON TABLE "public"."go_live_sign_offs" TO "authenticated";
GRANT ALL ON TABLE "public"."go_live_sign_offs" TO "service_role";



GRANT ALL ON TABLE "public"."governance_escalation_config" TO "anon";
GRANT ALL ON TABLE "public"."governance_escalation_config" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_escalation_config" TO "service_role";



GRANT ALL ON TABLE "public"."governance_issue_events" TO "anon";
GRANT ALL ON TABLE "public"."governance_issue_events" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_issue_events" TO "service_role";



GRANT ALL ON TABLE "public"."governance_issues" TO "anon";
GRANT ALL ON TABLE "public"."governance_issues" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_issues" TO "service_role";



GRANT ALL ON TABLE "public"."governance_reviews" TO "anon";
GRANT ALL ON TABLE "public"."governance_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."handoff_history" TO "anon";
GRANT ALL ON TABLE "public"."handoff_history" TO "authenticated";
GRANT ALL ON TABLE "public"."handoff_history" TO "service_role";



GRANT ALL ON TABLE "public"."human_overrides" TO "anon";
GRANT ALL ON TABLE "public"."human_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."human_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."incident_events" TO "anon";
GRANT ALL ON TABLE "public"."incident_events" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_events" TO "service_role";



GRANT ALL ON TABLE "public"."incident_types" TO "anon";
GRANT ALL ON TABLE "public"."incident_types" TO "authenticated";
GRANT ALL ON TABLE "public"."incident_types" TO "service_role";



GRANT ALL ON TABLE "public"."incidents" TO "anon";
GRANT ALL ON TABLE "public"."incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."incidents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."incidents_incident_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."incidents_incident_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."incidents_incident_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."innovation_actions" TO "anon";
GRANT ALL ON TABLE "public"."innovation_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."innovation_actions" TO "service_role";



GRANT ALL ON TABLE "public"."innovation_enrichment_tasks" TO "anon";
GRANT ALL ON TABLE "public"."innovation_enrichment_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."innovation_enrichment_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."innovation_grade_runs" TO "anon";
GRANT ALL ON TABLE "public"."innovation_grade_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."innovation_grade_runs" TO "service_role";



GRANT ALL ON TABLE "public"."innovation_ideas" TO "anon";
GRANT ALL ON TABLE "public"."innovation_ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."innovation_ideas" TO "service_role";



GRANT ALL ON TABLE "public"."innovation_packs" TO "anon";
GRANT ALL ON TABLE "public"."innovation_packs" TO "authenticated";
GRANT ALL ON TABLE "public"."innovation_packs" TO "service_role";



GRANT ALL ON TABLE "public"."integration_connections" TO "anon";
GRANT ALL ON TABLE "public"."integration_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_connections" TO "service_role";



GRANT ALL ON TABLE "public"."keyword_alert_rules" TO "anon";
GRANT ALL ON TABLE "public"."keyword_alert_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."keyword_alert_rules" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_targets" TO "anon";
GRANT ALL ON TABLE "public"."kpi_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_targets" TO "service_role";



GRANT ALL ON TABLE "public"."lab_results" TO "anon";
GRANT ALL ON TABLE "public"."lab_results" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_results" TO "service_role";



GRANT ALL ON TABLE "public"."legal_holds" TO "anon";
GRANT ALL ON TABLE "public"."legal_holds" TO "authenticated";
GRANT ALL ON TABLE "public"."legal_holds" TO "service_role";



GRANT ALL ON TABLE "public"."live_program_roster" TO "anon";
GRANT ALL ON TABLE "public"."live_program_roster" TO "authenticated";
GRANT ALL ON TABLE "public"."live_program_roster" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_logs" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_logs" TO "service_role";



GRANT ALL ON TABLE "public"."no_discharge_events" TO "anon";
GRANT ALL ON TABLE "public"."no_discharge_events" TO "authenticated";
GRANT ALL ON TABLE "public"."no_discharge_events" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."nov_records" TO "anon";
GRANT ALL ON TABLE "public"."nov_records" TO "authenticated";
GRANT ALL ON TABLE "public"."nov_records" TO "service_role";



GRANT ALL ON TABLE "public"."npdes_id_overrides" TO "anon";
GRANT ALL ON TABLE "public"."npdes_id_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."npdes_id_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."npdes_permits" TO "anon";
GRANT ALL ON TABLE "public"."npdes_permits" TO "authenticated";
GRANT ALL ON TABLE "public"."npdes_permits" TO "service_role";



GRANT ALL ON TABLE "public"."obligation_evidence" TO "anon";
GRANT ALL ON TABLE "public"."obligation_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."obligation_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."outfall_aliases" TO "anon";
GRANT ALL ON TABLE "public"."outfall_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."outfall_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."outfall_discharge_log" TO "anon";
GRANT ALL ON TABLE "public"."outfall_discharge_log" TO "authenticated";
GRANT ALL ON TABLE "public"."outfall_discharge_log" TO "service_role";



GRANT ALL ON TABLE "public"."outfall_limit_table_assignments" TO "anon";
GRANT ALL ON TABLE "public"."outfall_limit_table_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."outfall_limit_table_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."outfalls" TO "anon";
GRANT ALL ON TABLE "public"."outfalls" TO "authenticated";
GRANT ALL ON TABLE "public"."outfalls" TO "service_role";



GRANT ALL ON TABLE "public"."outlet_inspections" TO "anon";
GRANT ALL ON TABLE "public"."outlet_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."outlet_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."parameter_aliases" TO "anon";
GRANT ALL ON TABLE "public"."parameter_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."parameter_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."parameters" TO "anon";
GRANT ALL ON TABLE "public"."parameters" TO "authenticated";
GRANT ALL ON TABLE "public"."parameters" TO "service_role";



GRANT ALL ON TABLE "public"."permit_amendments" TO "anon";
GRANT ALL ON TABLE "public"."permit_amendments" TO "authenticated";
GRANT ALL ON TABLE "public"."permit_amendments" TO "service_role";



GRANT ALL ON TABLE "public"."permit_limit_tables" TO "anon";
GRANT ALL ON TABLE "public"."permit_limit_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."permit_limit_tables" TO "service_role";



GRANT ALL ON TABLE "public"."permit_limits" TO "anon";
GRANT ALL ON TABLE "public"."permit_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."permit_limits" TO "service_role";



GRANT ALL ON TABLE "public"."precipitation_events" TO "anon";
GRANT ALL ON TABLE "public"."precipitation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."precipitation_events" TO "service_role";



GRANT ALL ON TABLE "public"."precipitation_exemptions" TO "anon";
GRANT ALL ON TABLE "public"."precipitation_exemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."precipitation_exemptions" TO "service_role";



GRANT ALL ON TABLE "public"."precipitation_readings" TO "anon";
GRANT ALL ON TABLE "public"."precipitation_readings" TO "authenticated";
GRANT ALL ON TABLE "public"."precipitation_readings" TO "service_role";



GRANT ALL ON TABLE "public"."quarterly_reports" TO "anon";
GRANT ALL ON TABLE "public"."quarterly_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."quarterly_reports" TO "service_role";



GRANT ALL ON TABLE "public"."rca_findings" TO "anon";
GRANT ALL ON TABLE "public"."rca_findings" TO "authenticated";
GRANT ALL ON TABLE "public"."rca_findings" TO "service_role";



GRANT ALL ON TABLE "public"."rca_templates" TO "anon";
GRANT ALL ON TABLE "public"."rca_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."rca_templates" TO "service_role";



GRANT ALL ON TABLE "public"."readiness_checks" TO "anon";
GRANT ALL ON TABLE "public"."readiness_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."readiness_checks" TO "service_role";



GRANT ALL ON TABLE "public"."readiness_requirements" TO "anon";
GRANT ALL ON TABLE "public"."readiness_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."readiness_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."receiving_waters" TO "anon";
GRANT ALL ON TABLE "public"."receiving_waters" TO "authenticated";
GRANT ALL ON TABLE "public"."receiving_waters" TO "service_role";



GRANT ALL ON TABLE "public"."regulatory_contacts" TO "anon";
GRANT ALL ON TABLE "public"."regulatory_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."regulatory_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."regulatory_deadlines" TO "anon";
GRANT ALL ON TABLE "public"."regulatory_deadlines" TO "authenticated";
GRANT ALL ON TABLE "public"."regulatory_deadlines" TO "service_role";



GRANT ALL ON TABLE "public"."report_definitions" TO "anon";
GRANT ALL ON TABLE "public"."report_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."report_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."report_delivery_recipients" TO "anon";
GRANT ALL ON TABLE "public"."report_delivery_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."report_delivery_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."report_role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."report_role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."report_role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."report_runs" TO "anon";
GRANT ALL ON TABLE "public"."report_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."report_runs" TO "service_role";



GRANT ALL ON TABLE "public"."report_templates" TO "anon";
GRANT ALL ON TABLE "public"."report_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."report_templates" TO "service_role";



GRANT ALL ON TABLE "public"."retention_policies" TO "anon";
GRANT ALL ON TABLE "public"."retention_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."retention_policies" TO "service_role";



GRANT ALL ON TABLE "public"."roadmap_sync_events" TO "anon";
GRANT ALL ON TABLE "public"."roadmap_sync_events" TO "authenticated";
GRANT ALL ON TABLE "public"."roadmap_sync_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."roadmap_sync_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roadmap_sync_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roadmap_sync_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sampling_calendar" TO "anon";
GRANT ALL ON TABLE "public"."sampling_calendar" TO "authenticated";
GRANT ALL ON TABLE "public"."sampling_calendar" TO "service_role";



GRANT ALL ON TABLE "public"."sampling_calendar_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."sampling_calendar_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."sampling_calendar_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."sampling_events" TO "anon";
GRANT ALL ON TABLE "public"."sampling_events" TO "authenticated";
GRANT ALL ON TABLE "public"."sampling_events" TO "service_role";



GRANT ALL ON TABLE "public"."sampling_route_batches" TO "anon";
GRANT ALL ON TABLE "public"."sampling_route_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."sampling_route_batches" TO "service_role";



GRANT ALL ON TABLE "public"."sampling_route_stops" TO "anon";
GRANT ALL ON TABLE "public"."sampling_route_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."sampling_route_stops" TO "service_role";



GRANT ALL ON TABLE "public"."sampling_schedules" TO "anon";
GRANT ALL ON TABLE "public"."sampling_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."sampling_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_reports" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_reports" TO "service_role";



GRANT ALL ON TABLE "public"."site_weather_station_assignments" TO "anon";
GRANT ALL ON TABLE "public"."site_weather_station_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."site_weather_station_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."sites" TO "anon";
GRANT ALL ON TABLE "public"."sites" TO "authenticated";
GRANT ALL ON TABLE "public"."sites" TO "service_role";



GRANT ALL ON TABLE "public"."skill_execution_log" TO "anon";
GRANT ALL ON TABLE "public"."skill_execution_log" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_execution_log" TO "service_role";



GRANT ALL ON TABLE "public"."skill_feedback" TO "anon";
GRANT ALL ON TABLE "public"."skill_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."skill_registry" TO "anon";
GRANT ALL ON TABLE "public"."skill_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."skill_registry" TO "service_role";



GRANT ALL ON TABLE "public"."smoke_test_runs" TO "anon";
GRANT ALL ON TABLE "public"."smoke_test_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."smoke_test_runs" TO "service_role";



GRANT ALL ON TABLE "public"."state_regulatory_configs" TO "anon";
GRANT ALL ON TABLE "public"."state_regulatory_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."state_regulatory_configs" TO "service_role";



GRANT ALL ON TABLE "public"."states" TO "anon";
GRANT ALL ON TABLE "public"."states" TO "authenticated";
GRANT ALL ON TABLE "public"."states" TO "service_role";



GRANT ALL ON TABLE "public"."stipulated_penalties" TO "anon";
GRANT ALL ON TABLE "public"."stipulated_penalties" TO "authenticated";
GRANT ALL ON TABLE "public"."stipulated_penalties" TO "service_role";



GRANT ALL ON TABLE "public"."stream_monitoring_locations" TO "anon";
GRANT ALL ON TABLE "public"."stream_monitoring_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."stream_monitoring_locations" TO "service_role";



GRANT ALL ON TABLE "public"."stream_monitoring_results" TO "anon";
GRANT ALL ON TABLE "public"."stream_monitoring_results" TO "authenticated";
GRANT ALL ON TABLE "public"."stream_monitoring_results" TO "service_role";



GRANT ALL ON TABLE "public"."system_health_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_health_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_health_logs" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."tom_memory" TO "anon";
GRANT ALL ON TABLE "public"."tom_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."tom_memory" TO "service_role";



GRANT ALL ON TABLE "public"."training_catalog" TO "anon";
GRANT ALL ON TABLE "public"."training_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."training_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."training_completions" TO "anon";
GRANT ALL ON TABLE "public"."training_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."training_completions" TO "service_role";



GRANT ALL ON TABLE "public"."training_requirements" TO "anon";
GRANT ALL ON TABLE "public"."training_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."training_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."unit_conversions" TO "anon";
GRANT ALL ON TABLE "public"."unit_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_conversions" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_role_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."v_roadmap_sync_health" TO "anon";
GRANT ALL ON TABLE "public"."v_roadmap_sync_health" TO "authenticated";
GRANT ALL ON TABLE "public"."v_roadmap_sync_health" TO "service_role";



GRANT ALL ON TABLE "public"."v_roadmap_tasks_pending_linear_sync" TO "anon";
GRANT ALL ON TABLE "public"."v_roadmap_tasks_pending_linear_sync" TO "authenticated";
GRANT ALL ON TABLE "public"."v_roadmap_tasks_pending_linear_sync" TO "service_role";



GRANT ALL ON TABLE "public"."vip_contacts" TO "anon";
GRANT ALL ON TABLE "public"."vip_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."vip_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."weather_stations" TO "anon";
GRANT ALL ON TABLE "public"."weather_stations" TO "authenticated";
GRANT ALL ON TABLE "public"."weather_stations" TO "service_role";



GRANT ALL ON TABLE "public"."wet_test_results" TO "anon";
GRANT ALL ON TABLE "public"."wet_test_results" TO "authenticated";
GRANT ALL ON TABLE "public"."wet_test_results" TO "service_role";



GRANT ALL ON TABLE "public"."work_order_events" TO "anon";
GRANT ALL ON TABLE "public"."work_order_events" TO "authenticated";
GRANT ALL ON TABLE "public"."work_order_events" TO "service_role";



GRANT ALL ON TABLE "public"."work_orders" TO "anon";
GRANT ALL ON TABLE "public"."work_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."work_orders" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








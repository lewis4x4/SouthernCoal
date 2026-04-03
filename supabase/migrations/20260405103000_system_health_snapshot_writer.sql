CREATE OR REPLACE FUNCTION capture_system_health_snapshot(
  p_org_id uuid DEFAULT get_user_org_id()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DO $$
DECLARE
  v_org_id uuid;
  v_db_size_bytes bigint := 0;
  v_storage_bytes bigint := 0;
  v_active_users integer := 0;
  v_error_count integer := 0;
  v_avg_response_ms numeric;
  v_table_counts jsonb;
BEGIN
  SELECT pg_database_size(current_database())
  INTO v_db_size_bytes;

  FOR v_org_id IN
    SELECT o.id
    FROM public.organizations o
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.system_health_logs shl
      WHERE shl.organization_id = o.id
    )
  LOOP
    SELECT COALESCE(SUM(COALESCE(fpq.file_size_bytes, 0)), 0)
    INTO v_storage_bytes
    FROM public.file_processing_queue fpq
    WHERE fpq.organization_id = v_org_id;

    SELECT v_storage_bytes + COALESCE(SUM(COALESCE(rr.file_size_bytes, 0)), 0)
    INTO v_storage_bytes
    FROM public.report_runs rr
    JOIN public.scheduled_reports sr
      ON sr.id = rr.scheduled_report_id
    WHERE sr.organization_id = v_org_id;

    SELECT COUNT(DISTINCT al.user_id)
    INTO v_active_users
    FROM public.audit_log al
    WHERE al.organization_id = v_org_id
      AND al.user_id IS NOT NULL
      AND al.created_at >= now() - INTERVAL '24 hours';

    SELECT
      COALESCE((
        SELECT COUNT(*)
        FROM public.report_runs rr
        JOIN public.scheduled_reports sr
          ON sr.id = rr.scheduled_report_id
        WHERE sr.organization_id = v_org_id
          AND rr.status = 'failed'
          AND rr.created_at >= now() - INTERVAL '24 hours'
      ), 0)
      +
      COALESCE((
        SELECT COUNT(*)
        FROM public.audit_log al
        WHERE al.organization_id = v_org_id
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
      WHERE dic.organization_id = v_org_id
        AND dic.duration_ms IS NOT NULL
        AND dic.created_at >= now() - INTERVAL '7 days'

      UNION ALL

      SELECT str.duration_ms::numeric AS duration_metric
      FROM public.smoke_test_runs str
      WHERE str.organization_id = v_org_id
        AND str.duration_ms IS NOT NULL
        AND str.created_at >= now() - INTERVAL '7 days'
    ) metrics;

    SELECT jsonb_build_object(
      'permits', (
        SELECT COUNT(*)
        FROM public.npdes_permits p
        WHERE p.organization_id = v_org_id
      ),
      'outfalls', (
        SELECT COUNT(*)
        FROM public.outfalls o
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = v_org_id
      ),
      'sampling_events', (
        SELECT COUNT(*)
        FROM public.sampling_events se
        JOIN public.outfalls o ON o.id = se.outfall_id
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = v_org_id
      ),
      'lab_results', (
        SELECT COUNT(*)
        FROM public.lab_results lr
        JOIN public.sampling_events se ON se.id = lr.sampling_event_id
        JOIN public.outfalls o ON o.id = se.outfall_id
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = v_org_id
      ),
      'field_visits', (
        SELECT COUNT(*)
        FROM public.field_visits fv
        WHERE fv.organization_id = v_org_id
      ),
      'governance_issues', (
        SELECT COUNT(*)
        FROM public.governance_issues gi
        WHERE gi.organization_id = v_org_id
      ),
      'corrective_actions', (
        SELECT COUNT(*)
        FROM public.corrective_actions ca
        WHERE ca.organization_id = v_org_id
      ),
      'work_orders', (
        SELECT COUNT(*)
        FROM public.work_orders wo
        WHERE wo.organization_id = v_org_id
      ),
      'violations', (
        SELECT COUNT(*)
        FROM public.compliance_violations cv
        WHERE cv.organization_id = v_org_id
      ),
      'notifications', (
        SELECT COUNT(*)
        FROM public.notifications n
        WHERE n.organization_id = v_org_id
          AND n.dismissed_at IS NULL
      ),
      'retention_policies', (
        SELECT COUNT(*)
        FROM public.retention_policies rp
        WHERE rp.organization_id = v_org_id
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
      v_org_id,
      ROUND(v_db_size_bytes::numeric / 1048576, 2),
      v_table_counts,
      ROUND(v_storage_bytes::numeric / 1048576, 2),
      v_active_users,
      v_error_count,
      v_avg_response_ms,
      now()
    );
  END LOOP;
END;
$$;

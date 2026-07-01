-- Lane C: Missed-sampling obligation ledger — per-outfall required events from sampling_calendar
-- Partial coverage is expected until Sampling Matrix + Upload Dashboard populate schedules.

CREATE OR REPLACE FUNCTION get_sampling_obligation_ledger(
  p_organization_id uuid DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, get_user_org_id());
  v_schedules integer := 0;
  v_outfalls integer := 0;
  v_parameters integer := 0;
  v_matrix_rows integer := 0;
  v_total integer := 0;
  v_fulfilled integer := 0;
  v_excused integer := 0;
  v_missed integer := 0;
  v_at_risk integer := 0;
  v_upcoming integer := 0;
  v_rows jsonb;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Organization context required');
  END IF;

  IF p_status_filter IS NOT NULL
     AND p_status_filter NOT IN ('fulfilled', 'excused', 'missed', 'at_risk', 'upcoming') THEN
    RETURN jsonb_build_object('error', 'Invalid status filter');
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE is_active),
    COUNT(DISTINCT outfall_id) FILTER (WHERE is_active),
    COUNT(DISTINCT parameter_id) FILTER (WHERE is_active),
    COUNT(*) FILTER (WHERE is_active AND source <> 'manual')
  INTO v_schedules, v_outfalls, v_parameters, v_matrix_rows
  FROM sampling_schedules
  WHERE organization_id = v_org_id;

  WITH classified AS (
    SELECT
      sc.id AS calendar_id,
      sc.scheduled_date,
      COALESCE(sc.window_end, sc.scheduled_date) AS effective_due,
      sc.status AS calendar_status,
      sc.dispatch_status,
      o.outfall_number,
      p.short_name AS parameter_short_name,
      np.permit_number,
      ss.source AS schedule_source,
      ss.frequency_code,
      CASE
        WHEN sampling_calendar_has_lab_result(sc.id) THEN 'fulfilled'
        WHEN sampling_calendar_is_documented_excuse(sc.id) THEN 'excused'
        WHEN COALESCE(sc.window_end, sc.scheduled_date) < CURRENT_DATE THEN 'missed'
        WHEN COALESCE(sc.window_end, sc.scheduled_date) <= CURRENT_DATE + 2 THEN 'at_risk'
        ELSE 'upcoming'
      END AS obligation_status,
      GREATEST(0, CURRENT_DATE - COALESCE(sc.window_end, sc.scheduled_date)) AS days_late
    FROM sampling_calendar sc
    JOIN sampling_schedules ss ON ss.id = sc.schedule_id
    JOIN outfalls o ON o.id = sc.outfall_id
    JOIN parameters p ON p.id = sc.parameter_id
    LEFT JOIN npdes_permits np ON np.id = ss.permit_id
    WHERE sc.organization_id = v_org_id
  ),
  filtered AS (
    SELECT *
    FROM classified c
    WHERE p_status_filter IS NULL OR c.obligation_status = p_status_filter
  )
  SELECT
    (SELECT COUNT(*) FROM classified),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'fulfilled'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'excused'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'missed'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'at_risk'),
    (SELECT COUNT(*) FROM classified WHERE obligation_status = 'upcoming'),
    COALESCE(
      (
        SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.effective_due DESC, f.outfall_number, f.parameter_short_name)
        FROM (
          SELECT *
          FROM filtered
          ORDER BY effective_due DESC, outfall_number, parameter_short_name
          LIMIT GREATEST(1, LEAST(p_limit, 2000))
        ) f
      ),
      '[]'::jsonb
    )
  INTO v_total, v_fulfilled, v_excused, v_missed, v_at_risk, v_upcoming, v_rows;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'computed_at', now(),
    'disclaimer',
      'DRAFT — partial obligation calendar; fills incrementally as Sampling Matrix and Upload Dashboard populate permits/outfalls',
    'coverage', jsonb_build_object(
      'active_schedules', v_schedules,
      'distinct_outfalls', v_outfalls,
      'distinct_parameters', v_parameters,
      'calendar_events', v_total,
      'matrix_rows', v_matrix_rows,
      'matrix_loaded', v_matrix_rows > 0
    ),
    'status_counts', jsonb_build_object(
      'fulfilled', v_fulfilled,
      'excused', v_excused,
      'missed', v_missed,
      'at_risk', v_at_risk,
      'upcoming', v_upcoming
    ),
    'rows', v_rows
  );
END;
$$;

COMMENT ON FUNCTION get_sampling_obligation_ledger IS
  'Per-outfall sampling obligation ledger from sampling_calendar — DRAFT partial coverage until matrix lands.';

GRANT EXECUTE ON FUNCTION get_sampling_obligation_ledger(uuid, text, integer) TO authenticated;

-- GST-26: Retry-safe makeup adjustments and refresh that preserves active dispatch work.
BEGIN;

CREATE OR REPLACE FUNCTION refresh_sampling_calendar_statuses(
  p_organization_id uuid DEFAULT get_user_org_id(),
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE sampling_calendar
  SET status = CASE
        WHEN scheduled_date < p_as_of THEN 'overdue'
        ELSE 'pending'
      END,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND status IN ('pending', 'overdue')
    AND dispatch_status = 'ready'
    AND current_field_visit_id IS NULL
    AND current_route_batch_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION apply_sampling_calendar_adjustment(
  p_calendar_id uuid,
  p_adjustment_type text,
  p_reason text,
  p_new_scheduled_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item sampling_calendar%ROWTYPE;
  v_new_calendar_id uuid;
  v_created_makeup boolean := false;
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

      SELECT id
      INTO v_new_calendar_id
      FROM sampling_calendar
      WHERE organization_id = v_item.organization_id
        AND source_calendar_id = p_calendar_id
        AND scheduled_date = p_new_scheduled_date
      LIMIT 1;

      IF v_new_calendar_id IS NULL THEN
        BEGIN
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

          v_created_makeup := true;
        EXCEPTION
          WHEN unique_violation THEN
            SELECT id
            INTO v_new_calendar_id
            FROM sampling_calendar
            WHERE schedule_id = v_item.schedule_id
              AND scheduled_date = p_new_scheduled_date
            LIMIT 1;

            IF v_new_calendar_id IS NULL THEN
              RAISE;
            END IF;

            IF NOT EXISTS (
              SELECT 1
              FROM sampling_calendar
              WHERE id = v_new_calendar_id
                AND source_calendar_id = p_calendar_id
            ) THEN
              RAISE EXCEPTION
                'A calendar item already exists on % for this schedule',
                p_new_scheduled_date;
            END IF;
        END;
      END IF;
  END CASE;

  IF lower(p_adjustment_type) <> 'makeup' OR v_created_makeup THEN
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
  END IF;

  RETURN jsonb_build_object(
    'calendar_id', v_new_calendar_id,
    'adjustment_type', lower(p_adjustment_type),
    'idempotent', lower(p_adjustment_type) = 'makeup' AND NOT v_created_makeup
  );
END;
$$;

COMMIT;

-- =============================================================================
-- Phase 2C: Route engine — priority sequencing, field visit ↔ route batch link
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Field visits: link dispatched route work to parent batch (daily assignment)
-- ---------------------------------------------------------------------------

ALTER TABLE field_visits
  ADD COLUMN IF NOT EXISTS route_batch_id uuid REFERENCES sampling_route_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_field_visits_route_batch
  ON field_visits(route_batch_id)
  WHERE route_batch_id IS NOT NULL;

COMMENT ON COLUMN field_visits.route_batch_id IS
  'When set, this visit was created from dispatch_sampling_route_batch for supervisor daily route tracking.';

-- ---------------------------------------------------------------------------
-- 2. Priority: short-hold-first within each due band, then due-soon ladder
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION derive_sampling_priority_rank(
  p_parameter_name text,
  p_scheduled_date date
)
RETURNS integer
LANGUAGE sql
STABLE
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

CREATE OR REPLACE FUNCTION derive_sampling_priority_reason(
  p_parameter_name text,
  p_scheduled_date date
)
RETURNS text
LANGUAGE sql
STABLE
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

-- ---------------------------------------------------------------------------
-- 3. Dispatch: stamp route_batch_id on created visits
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION dispatch_sampling_route_batch(
  p_route_batch_id uuid,
  p_field_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
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

COMMIT;

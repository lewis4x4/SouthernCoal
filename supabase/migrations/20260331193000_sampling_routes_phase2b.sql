-- =============================================================================
-- Phase 2B: Sampling route batches, ordered stops, and route dispatch
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Route batch tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sampling_route_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  route_date date NOT NULL,
  route_zone text NOT NULL,
  assigned_to uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  route_status text NOT NULL DEFAULT 'draft'
    CHECK (route_status IN ('draft', 'dispatched', 'in_progress', 'completed', 'exception', 'cancelled')),
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_route_batches_org_date
  ON sampling_route_batches(organization_id, route_date DESC, route_zone);
CREATE INDEX IF NOT EXISTS idx_sampling_route_batches_assigned
  ON sampling_route_batches(assigned_to, route_date DESC);

CREATE TABLE IF NOT EXISTS sampling_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_batch_id uuid NOT NULL REFERENCES sampling_route_batches(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL UNIQUE REFERENCES sampling_calendar(id) ON DELETE CASCADE,
  stop_sequence integer NOT NULL CHECK (stop_sequence > 0),
  priority_rank integer NOT NULL DEFAULT 100,
  priority_reason text,
  estimated_drive_minutes integer,
  stop_status text NOT NULL DEFAULT 'pending'
    CHECK (stop_status IN ('pending', 'dispatched', 'in_progress', 'completed', 'skipped', 'exception')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_route_stops_batch
  ON sampling_route_stops(route_batch_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_sampling_route_stops_status
  ON sampling_route_stops(route_batch_id, stop_status);

ALTER TABLE sampling_calendar
  ADD COLUMN IF NOT EXISTS current_route_batch_id uuid REFERENCES sampling_route_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sampling_calendar_route_batch
  ON sampling_calendar(current_route_batch_id);

-- ---------------------------------------------------------------------------
-- 2. Helper functions
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
      WHEN p_scheduled_date = CURRENT_DATE THEN 10
      WHEN p_scheduled_date <= CURRENT_DATE + 2 THEN 20
      ELSE 40
    END
    + CASE
        WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(fecal|bacteria|e\\. coli|ecoli|coli)%' THEN -5
        WHEN lower(COALESCE(p_parameter_name, '')) LIKE '%bod%' THEN -3
        ELSE 0
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
      WHEN lower(COALESCE(p_parameter_name, '')) SIMILAR TO '%(fecal|bacteria|e\\. coli|ecoli|coli)%' THEN 'short_hold_bacteria'
      WHEN lower(COALESCE(p_parameter_name, '')) LIKE '%bod%' THEN 'short_hold_bod'
      ELSE NULL
    END
  );
$$;

CREATE OR REPLACE FUNCTION recalculate_sampling_route_batch_status(p_route_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION create_sampling_route_batch(
  p_route_date date,
  p_route_zone text,
  p_assigned_to uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_calendar_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
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
      sampling_calendar_id
    )
    VALUES (
      v_route_stop.organization_id,
      v_route_stop.permit_id,
      v_route_stop.outfall_id,
      v_assigned_to,
      auth.uid(),
      v_route_stop.scheduled_date,
      COALESCE(p_field_notes, v_batch.notes, v_route_stop.instructions),
      v_route_stop.calendar_id
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

CREATE OR REPLACE FUNCTION sync_sampling_route_stop_from_calendar()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION sync_sampling_route_batch_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE sampling_route_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sampling_route_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view route batches in own org" ON sampling_route_batches;
CREATE POLICY "Users view route batches in own org"
  ON sampling_route_batches FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (
      can_manage_sampling_records()
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Managers manage route batches" ON sampling_route_batches;
CREATE POLICY "Managers manage route batches"
  ON sampling_route_batches FOR ALL TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  );

DROP POLICY IF EXISTS "Service role full access route batches" ON sampling_route_batches;
CREATE POLICY "Service role full access route batches"
  ON sampling_route_batches FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view route stops in own org" ON sampling_route_stops;
CREATE POLICY "Users view route stops in own org"
  ON sampling_route_stops FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM sampling_route_batches rb
      WHERE rb.id = sampling_route_stops.route_batch_id
        AND rb.organization_id = get_user_org_id()
        AND (
          can_manage_sampling_records()
          OR rb.assigned_to = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Managers manage route stops" ON sampling_route_stops;
CREATE POLICY "Managers manage route stops"
  ON sampling_route_stops FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM sampling_route_batches rb
      WHERE rb.id = sampling_route_stops.route_batch_id
        AND rb.organization_id = get_user_org_id()
        AND can_manage_sampling_records()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM sampling_route_batches rb
      WHERE rb.id = sampling_route_stops.route_batch_id
        AND rb.organization_id = get_user_org_id()
        AND can_manage_sampling_records()
    )
  );

DROP POLICY IF EXISTS "Service role full access route stops" ON sampling_route_stops;
CREATE POLICY "Service role full access route stops"
  ON sampling_route_stops FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sampling_route_batches_updated_at ON sampling_route_batches;
CREATE TRIGGER trg_sampling_route_batches_updated_at
  BEFORE UPDATE ON sampling_route_batches
  FOR EACH ROW EXECUTE FUNCTION sync_sampling_route_batch_timestamp();

DROP TRIGGER IF EXISTS trg_sampling_route_stops_updated_at ON sampling_route_stops;
CREATE TRIGGER trg_sampling_route_stops_updated_at
  BEFORE UPDATE ON sampling_route_stops
  FOR EACH ROW EXECUTE FUNCTION sync_sampling_route_batch_timestamp();

DROP TRIGGER IF EXISTS trg_sampling_calendar_sync_route_stops ON sampling_calendar;
CREATE TRIGGER trg_sampling_calendar_sync_route_stops
  AFTER UPDATE ON sampling_calendar
  FOR EACH ROW EXECUTE FUNCTION sync_sampling_route_stop_from_calendar();

COMMIT;

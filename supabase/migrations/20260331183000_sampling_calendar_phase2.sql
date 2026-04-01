-- =============================================================================
-- Phase 2: Sampling calendar generation, overrides, and dispatch linkage
-- =============================================================================
-- Purpose:
--   - extend existing sampling_schedules / sampling_calendar tables
--   - add supervisor schedule generation for WV launch
--   - link calendar entries to field_visits
--   - support manual / rain-event entries, overrides, and makeup work
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend legacy schedule tables with org + dispatch metadata
-- ---------------------------------------------------------------------------

ALTER TABLE sampling_schedules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS route_zone text,
  ADD COLUMN IF NOT EXISTS default_assigned_to uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_anchor_date date,
  ADD COLUMN IF NOT EXISTS preferred_day_of_week smallint CHECK (preferred_day_of_week BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS preferred_day_of_month smallint CHECK (preferred_day_of_month BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS secondary_day_of_month smallint CHECK (secondary_day_of_month BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

UPDATE sampling_schedules ss
SET organization_id = np.organization_id
FROM npdes_permits np
WHERE np.id = ss.permit_id
  AND ss.organization_id IS NULL;

ALTER TABLE sampling_schedules
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sampling_schedules_org_active
  ON sampling_schedules(organization_id, is_active, frequency_code);
CREATE INDEX IF NOT EXISTS idx_sampling_schedules_default_assigned
  ON sampling_schedules(default_assigned_to);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sampling_schedules_scope
  ON sampling_schedules(
    organization_id,
    permit_id,
    outfall_id,
    parameter_id,
    frequency_code,
    sample_type,
    source
  );

ALTER TABLE sampling_calendar
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT 'ready'
    CHECK (dispatch_status IN ('ready', 'dispatched', 'in_progress', 'completed', 'skipped', 'exception')),
  ADD COLUMN IF NOT EXISTS current_field_visit_id uuid REFERENCES field_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_zone text,
  ADD COLUMN IF NOT EXISTS default_assigned_to uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS source_calendar_id uuid REFERENCES sampling_calendar(id) ON DELETE SET NULL;

UPDATE sampling_calendar sc
SET organization_id = ss.organization_id,
    route_zone = COALESCE(sc.route_zone, ss.route_zone),
    default_assigned_to = COALESCE(sc.default_assigned_to, ss.default_assigned_to)
FROM sampling_schedules ss
WHERE ss.id = sc.schedule_id
  AND sc.organization_id IS NULL;

ALTER TABLE sampling_calendar
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sampling_calendar_org_date
  ON sampling_calendar(organization_id, scheduled_date, status, dispatch_status);
CREATE INDEX IF NOT EXISTS idx_sampling_calendar_visit
  ON sampling_calendar(current_field_visit_id);
CREATE INDEX IF NOT EXISTS idx_sampling_calendar_zone
  ON sampling_calendar(organization_id, route_zone, scheduled_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sampling_calendar_schedule_date
  ON sampling_calendar(schedule_id, scheduled_date);

ALTER TABLE field_visits
  ADD COLUMN IF NOT EXISTS sampling_calendar_id uuid REFERENCES sampling_calendar(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_field_visits_sampling_calendar_active
  ON field_visits(sampling_calendar_id)
  WHERE sampling_calendar_id IS NOT NULL
    AND visit_status <> 'cancelled';

CREATE TABLE IF NOT EXISTS sampling_calendar_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES sampling_calendar(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL
    CHECK (adjustment_type IN ('manual_entry', 'rain_event', 'skip', 'reschedule', 'makeup')),
  prior_scheduled_date date,
  new_scheduled_date date,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sampling_calendar_adjustments_calendar
  ON sampling_calendar_adjustments(calendar_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sampling_calendar_adjustments_org
  ON sampling_calendar_adjustments(organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Access helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION can_manage_sampling_records()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT current_user_has_any_role(ARRAY['site_manager', 'environmental_manager', 'executive', 'admin']);
$$;

CREATE OR REPLACE FUNCTION can_access_sampling_schedule(p_schedule_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION can_access_sampling_calendar_item(p_calendar_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- ---------------------------------------------------------------------------
-- 3. Schedule generation and override functions
-- ---------------------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION generate_sampling_calendar(
  p_month_start date,
  p_organization_id uuid DEFAULT get_user_org_id()
)
RETURNS jsonb
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION create_manual_sampling_calendar_entry(
  p_permit_id uuid,
  p_outfall_id uuid,
  p_parameter_id uuid,
  p_scheduled_date date,
  p_entry_type text,
  p_route_zone text DEFAULT NULL,
  p_default_assigned_to uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
  v_outfall_permit_id uuid;
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

  SELECT permit_id
  INTO v_outfall_permit_id
  FROM outfalls
  WHERE id = p_outfall_id;

  IF v_outfall_permit_id IS NULL THEN
    RAISE EXCEPTION 'Outfall % was not found', p_outfall_id;
  END IF;

  IF v_outfall_permit_id <> p_permit_id THEN
    RAISE EXCEPTION 'Outfall % does not belong to permit %', p_outfall_id, p_permit_id;
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

-- ---------------------------------------------------------------------------
-- 4. Field visit linkage back to sampling calendar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_sampling_calendar_from_field_visit()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_field_visits_sync_sampling_calendar ON field_visits;
CREATE TRIGGER trg_field_visits_sync_sampling_calendar
  AFTER INSERT OR UPDATE OR DELETE ON field_visits
  FOR EACH ROW EXECUTE FUNCTION sync_sampling_calendar_from_field_visit();

CREATE OR REPLACE FUNCTION validate_field_visit_relationships()
RETURNS trigger
LANGUAGE plpgsql
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
  FROM npdes_permits
  WHERE id = NEW.permit_id;

  IF permit_org_id IS NULL THEN
    RAISE EXCEPTION 'Permit % was not found', NEW.permit_id;
  END IF;

  IF permit_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Permit % does not belong to organization %', NEW.permit_id, NEW.organization_id;
  END IF;

  SELECT permit_id
  INTO outfall_permit_id
  FROM outfalls
  WHERE id = NEW.outfall_id;

  IF outfall_permit_id IS NULL THEN
    RAISE EXCEPTION 'Outfall % was not found', NEW.outfall_id;
  END IF;

  IF outfall_permit_id <> NEW.permit_id THEN
    RAISE EXCEPTION 'Outfall % does not belong to permit %', NEW.outfall_id, NEW.permit_id;
  END IF;

  SELECT organization_id
  INTO assigned_org_id
  FROM user_profiles
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
    FROM sampling_calendar
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

DROP TRIGGER IF EXISTS trg_field_visits_validate_relationships ON field_visits;
CREATE TRIGGER trg_field_visits_validate_relationships
  BEFORE INSERT OR UPDATE ON field_visits
  FOR EACH ROW EXECUTE FUNCTION validate_field_visit_relationships();

-- ---------------------------------------------------------------------------
-- 5. RLS for extended schedule layer
-- ---------------------------------------------------------------------------

ALTER TABLE sampling_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sampling_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE sampling_calendar_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view accessible sampling schedules" ON sampling_schedules;
CREATE POLICY "Users view accessible sampling schedules"
  ON sampling_schedules FOR SELECT TO authenticated
  USING (can_access_sampling_schedule(id));

DROP POLICY IF EXISTS "Managers manage sampling schedules" ON sampling_schedules;
CREATE POLICY "Managers manage sampling schedules"
  ON sampling_schedules FOR ALL TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  );

DROP POLICY IF EXISTS "Service role full access sampling schedules" ON sampling_schedules;
CREATE POLICY "Service role full access sampling schedules"
  ON sampling_schedules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view accessible sampling calendar" ON sampling_calendar;
CREATE POLICY "Users view accessible sampling calendar"
  ON sampling_calendar FOR SELECT TO authenticated
  USING (can_access_sampling_calendar_item(id));

DROP POLICY IF EXISTS "Managers manage sampling calendar" ON sampling_calendar;
CREATE POLICY "Managers manage sampling calendar"
  ON sampling_calendar FOR ALL TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  );

DROP POLICY IF EXISTS "Service role full access sampling calendar" ON sampling_calendar;
CREATE POLICY "Service role full access sampling calendar"
  ON sampling_calendar FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view sampling calendar adjustments" ON sampling_calendar_adjustments;
CREATE POLICY "Users view sampling calendar adjustments"
  ON sampling_calendar_adjustments FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND can_manage_sampling_records()
  );

DROP POLICY IF EXISTS "Managers insert sampling calendar adjustments" ON sampling_calendar_adjustments;
CREATE POLICY "Managers insert sampling calendar adjustments"
  ON sampling_calendar_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND created_by = auth.uid()
    AND can_manage_sampling_records()
  );

DROP POLICY IF EXISTS "Service role full access sampling calendar adjustments" ON sampling_calendar_adjustments;
CREATE POLICY "Service role full access sampling calendar adjustments"
  ON sampling_calendar_adjustments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. Updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sampling_schedules_updated_at ON sampling_schedules;
CREATE TRIGGER trg_sampling_schedules_updated_at
  BEFORE UPDATE ON sampling_schedules
  FOR EACH ROW EXECUTE FUNCTION update_field_ops_timestamp();

DROP TRIGGER IF EXISTS trg_sampling_calendar_updated_at ON sampling_calendar;
CREATE TRIGGER trg_sampling_calendar_updated_at
  BEFORE UPDATE ON sampling_calendar
  FOR EACH ROW EXECUTE FUNCTION update_field_ops_timestamp();

COMMIT;

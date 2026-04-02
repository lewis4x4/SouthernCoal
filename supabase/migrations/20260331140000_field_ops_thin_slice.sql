-- =============================================================================
-- Thin Slice 1: WV Field Visit + Governance Backbone
-- =============================================================================
-- Purpose:
--   Add the minimum executable field-operations backbone for:
--   - manual dispatch
--   - field visit execution
--   - no-discharge documentation
--   - access issue escalation
--   - step-1 governance intake
--
-- Guardrails:
--   - additive only
--   - isolated from report generation, lab import, and scheduled-report flows
--   - reuse existing organizations/outfalls/permits/sampling_events/audit_log patterns
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_user_has_any_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_role_assignments ura
    JOIN roles r ON r.id = ura.role_id
    WHERE ura.user_id = auth.uid()
      AND r.name = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION update_field_ops_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_field_visit_editable()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION validate_field_visit_relationships()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  permit_org_id uuid;
  outfall_permit_id uuid;
  assigned_org_id uuid;
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

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Core field visit tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS field_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  permit_id uuid NOT NULL REFERENCES npdes_permits(id) ON DELETE RESTRICT,
  outfall_id uuid NOT NULL REFERENCES outfalls(id) ON DELETE RESTRICT,
  assigned_to uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  scheduled_date date NOT NULL,
  visit_status text NOT NULL DEFAULT 'assigned'
    CHECK (visit_status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  outcome text
    CHECK (outcome IN ('sample_collected', 'no_discharge', 'access_issue')),
  started_at timestamptz,
  completed_at timestamptz,
  started_latitude numeric,
  started_longitude numeric,
  completed_latitude numeric,
  completed_longitude numeric,
  weather_conditions text,
  field_notes text,
  potential_force_majeure boolean NOT NULL DEFAULT false,
  potential_force_majeure_notes text,
  linked_sampling_event_id uuid REFERENCES sampling_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_visits_completion_requires_outcome CHECK (
    visit_status != 'completed' OR outcome IS NOT NULL
  ),
  CONSTRAINT field_visits_started_requires_gps CHECK (
    started_at IS NULL OR (started_latitude IS NOT NULL AND started_longitude IS NOT NULL)
  ),
  CONSTRAINT field_visits_completed_requires_gps CHECK (
    completed_at IS NULL OR (completed_latitude IS NOT NULL AND completed_longitude IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_field_visits_org_date
  ON field_visits(organization_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_visits_assigned_to
  ON field_visits(assigned_to, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_visits_status
  ON field_visits(organization_id, visit_status, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_visits_outfall
  ON field_visits(outfall_id, scheduled_date DESC);

CREATE TABLE IF NOT EXISTS outlet_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_visit_id uuid NOT NULL UNIQUE REFERENCES field_visits(id) ON DELETE CASCADE,
  flow_status text NOT NULL DEFAULT 'unknown'
    CHECK (flow_status IN ('flowing', 'no_flow', 'obstructed', 'unknown')),
  signage_condition text,
  pipe_condition text,
  erosion_observed boolean NOT NULL DEFAULT false,
  obstruction_observed boolean NOT NULL DEFAULT false,
  obstruction_details text,
  inspector_notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS field_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_visit_id uuid NOT NULL REFERENCES field_visits(id) ON DELETE CASCADE,
  parameter_name text NOT NULL,
  measured_value numeric,
  measured_text text,
  unit text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_measurements_value_presence CHECK (
    measured_value IS NOT NULL OR measured_text IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_field_measurements_visit
  ON field_measurements(field_visit_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS no_discharge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_visit_id uuid NOT NULL UNIQUE REFERENCES field_visits(id) ON DELETE CASCADE,
  narrative text NOT NULL,
  observed_condition text,
  obstruction_observed boolean NOT NULL DEFAULT false,
  obstruction_details text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_visit_id uuid NOT NULL UNIQUE REFERENCES field_visits(id) ON DELETE CASCADE,
  issue_type text NOT NULL DEFAULT 'access_issue'
    CHECK (issue_type IN ('access_issue', 'road_blocked', 'locked_gate', 'weather', 'safety_hazard', 'other')),
  obstruction_narrative text NOT NULL,
  contact_attempted boolean NOT NULL DEFAULT false,
  contact_name text,
  contact_outcome text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Governance tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS governance_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_visit_id uuid REFERENCES field_visits(id) ON DELETE SET NULL,
  access_issue_id uuid REFERENCES access_issues(id) ON DELETE SET NULL,
  issue_type text NOT NULL
    CHECK (issue_type IN ('access_issue', 'potential_force_majeure')),
  related_entity_type text NOT NULL
    CHECK (related_entity_type IN ('field_visit', 'access_issue')),
  related_entity_id uuid NOT NULL,
  related_outfall_id uuid REFERENCES outfalls(id) ON DELETE SET NULL,
  related_permit_id uuid REFERENCES npdes_permits(id) ON DELETE SET NULL,
  state_code text NOT NULL DEFAULT 'WV',
  decree_paragraphs text[] NOT NULL DEFAULT ARRAY[]::text[],
  title text NOT NULL,
  issue_summary text NOT NULL,
  current_status text NOT NULL DEFAULT 'open'
    CHECK (current_status IN ('open', 'under_review', 'decision_recorded', 'closed')),
  current_step integer NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 4),
  current_owner_name text NOT NULL DEFAULT 'Bill Johnson',
  current_owner_role text NOT NULL DEFAULT 'Chief Compliance Officer',
  current_owner_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  raised_at timestamptz NOT NULL DEFAULT now(),
  response_deadline timestamptz,
  notice_deadline timestamptz,
  written_deadline timestamptz,
  final_disposition text,
  final_decision_at timestamptz,
  closed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_issues_org_status
  ON governance_issues(organization_id, current_status, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_governance_issues_owner
  ON governance_issues(current_owner_name, current_status, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_governance_issues_visit
  ON governance_issues(field_visit_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_governance_issues_visit_type
  ON governance_issues(field_visit_id, issue_type)
  WHERE field_visit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_governance_issues_access_issue
  ON governance_issues(access_issue_id)
  WHERE access_issue_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS governance_issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governance_issue_id uuid NOT NULL REFERENCES governance_issues(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'status_changed', 'decision_recorded', 'owner_changed', 'note_added', 'evidence_linked')),
  from_status text,
  to_status text,
  actor_user_id uuid DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE SET NULL,
  actor_name text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_issue_events_issue
  ON governance_issue_events(governance_issue_id, created_at DESC);

CREATE TABLE IF NOT EXISTS field_evidence_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_visit_id uuid REFERENCES field_visits(id) ON DELETE CASCADE,
  governance_issue_id uuid REFERENCES governance_issues(id) ON DELETE SET NULL,
  evidence_type text NOT NULL DEFAULT 'photo'
    CHECK (evidence_type IN ('photo', 'document', 'signature', 'other')),
  bucket text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES user_profiles(id) ON DELETE RESTRICT,
  captured_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric,
  longitude numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_evidence_assets_parent_required CHECK (
    field_visit_id IS NOT NULL OR governance_issue_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_field_evidence_visit
  ON field_evidence_assets(field_visit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_evidence_issue
  ON field_evidence_assets(governance_issue_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Transactional write functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION complete_field_visit(
  p_field_visit_id uuid,
  p_outcome text,
  p_completed_latitude numeric,
  p_completed_longitude numeric,
  p_weather_conditions text DEFAULT NULL,
  p_field_notes text DEFAULT NULL,
  p_potential_force_majeure boolean DEFAULT false,
  p_potential_force_majeure_notes text DEFAULT NULL,
  p_no_discharge_narrative text DEFAULT NULL,
  p_no_discharge_observed_condition text DEFAULT NULL,
  p_no_discharge_obstruction_observed boolean DEFAULT false,
  p_no_discharge_obstruction_details text DEFAULT NULL,
  p_access_issue_type text DEFAULT 'access_issue',
  p_access_issue_obstruction_narrative text DEFAULT NULL,
  p_access_issue_contact_attempted boolean DEFAULT false,
  p_access_issue_contact_name text DEFAULT NULL,
  p_access_issue_contact_outcome text DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
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

  IF v_visit.visit_status = 'completed' THEN
    RAISE EXCEPTION 'Field visit % is already completed', p_field_visit_id;
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
      'completed',
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
      status = EXCLUDED.status,
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
        'Bill Johnson',
        'Chief Compliance Officer',
        v_now + interval '24 hours',
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
        'Access issue routed to Bill Johnson',
        jsonb_build_object(
          'issue_type', 'access_issue',
          'field_visit_id', p_field_visit_id
        )
      );
    END IF;

    v_governance_issue_id := v_existing_governance_issue_id;
  END IF;

  IF COALESCE(p_potential_force_majeure, false) THEN
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
        'Bill Johnson',
        'Chief Compliance Officer',
        v_now + interval '24 hours',
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
        'Potential force majeure routed to Bill Johnson',
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

CREATE OR REPLACE FUNCTION update_governance_issue_status(
  p_issue_id uuid,
  p_current_status text,
  p_final_disposition text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
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

-- ---------------------------------------------------------------------------
-- 5. Access helper functions for RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION can_access_field_visit(p_visit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION can_access_governance_issue(p_issue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE field_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE no_discharge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_issue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_evidence_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view accessible field visits" ON field_visits;
CREATE POLICY "Users view accessible field visits"
  ON field_visits FOR SELECT TO authenticated
  USING (can_access_field_visit(id));

DROP POLICY IF EXISTS "Managers create field visits" ON field_visits;
CREATE POLICY "Managers create field visits"
  ON field_visits FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['site_manager', 'environmental_manager', 'executive', 'admin'])
  );

DROP POLICY IF EXISTS "Assigned users or managers update field visits" ON field_visits;
CREATE POLICY "Assigned users or managers update field visits"
  ON field_visits FOR UPDATE TO authenticated
  USING (can_access_field_visit(id))
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Admins delete field visits" ON field_visits;
CREATE POLICY "Admins delete field visits"
  ON field_visits FOR DELETE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

DROP POLICY IF EXISTS "Service role full access field visits" ON field_visits;
CREATE POLICY "Service role full access field visits"
  ON field_visits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view outlet inspections for accessible visits" ON outlet_inspections;
CREATE POLICY "Users view outlet inspections for accessible visits"
  ON outlet_inspections FOR SELECT TO authenticated
  USING (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Users manage outlet inspections for accessible visits" ON outlet_inspections;
CREATE POLICY "Users manage outlet inspections for accessible visits"
  ON outlet_inspections FOR ALL TO authenticated
  USING (can_access_field_visit(field_visit_id))
  WITH CHECK (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Service role full access outlet inspections" ON outlet_inspections;
CREATE POLICY "Service role full access outlet inspections"
  ON outlet_inspections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view field measurements for accessible visits" ON field_measurements;
CREATE POLICY "Users view field measurements for accessible visits"
  ON field_measurements FOR SELECT TO authenticated
  USING (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Users manage field measurements for accessible visits" ON field_measurements;
CREATE POLICY "Users manage field measurements for accessible visits"
  ON field_measurements FOR ALL TO authenticated
  USING (can_access_field_visit(field_visit_id))
  WITH CHECK (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Service role full access field measurements" ON field_measurements;
CREATE POLICY "Service role full access field measurements"
  ON field_measurements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view no discharge events for accessible visits" ON no_discharge_events;
CREATE POLICY "Users view no discharge events for accessible visits"
  ON no_discharge_events FOR SELECT TO authenticated
  USING (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Users manage no discharge events for accessible visits" ON no_discharge_events;
CREATE POLICY "Users manage no discharge events for accessible visits"
  ON no_discharge_events FOR ALL TO authenticated
  USING (can_access_field_visit(field_visit_id))
  WITH CHECK (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Service role full access no discharge events" ON no_discharge_events;
CREATE POLICY "Service role full access no discharge events"
  ON no_discharge_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view access issues for accessible visits" ON access_issues;
CREATE POLICY "Users view access issues for accessible visits"
  ON access_issues FOR SELECT TO authenticated
  USING (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Users manage access issues for accessible visits" ON access_issues;
CREATE POLICY "Users manage access issues for accessible visits"
  ON access_issues FOR ALL TO authenticated
  USING (can_access_field_visit(field_visit_id))
  WITH CHECK (can_access_field_visit(field_visit_id));

DROP POLICY IF EXISTS "Service role full access access issues" ON access_issues;
CREATE POLICY "Service role full access access issues"
  ON access_issues FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view accessible governance issues" ON governance_issues;
CREATE POLICY "Users view accessible governance issues"
  ON governance_issues FOR SELECT TO authenticated
  USING (can_access_governance_issue(id));

DROP POLICY IF EXISTS "Users create governance issues in own org" ON governance_issues;
CREATE POLICY "Users create governance issues in own org"
  ON governance_issues FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Managers update governance issues" ON governance_issues;
CREATE POLICY "Managers update governance issues"
  ON governance_issues FOR UPDATE TO authenticated
  USING (
    can_access_governance_issue(id)
    AND (
      current_owner_user_id = auth.uid()
      OR current_user_has_any_role(ARRAY['environmental_manager', 'executive', 'admin'])
    )
  )
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Service role full access governance issues" ON governance_issues;
CREATE POLICY "Service role full access governance issues"
  ON governance_issues FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view governance issue events" ON governance_issue_events;
CREATE POLICY "Users view governance issue events"
  ON governance_issue_events FOR SELECT TO authenticated
  USING (can_access_governance_issue(governance_issue_id));

DROP POLICY IF EXISTS "Users insert governance issue events" ON governance_issue_events;
CREATE POLICY "Users insert governance issue events"
  ON governance_issue_events FOR INSERT TO authenticated
  WITH CHECK (
    can_access_governance_issue(governance_issue_id)
    AND actor_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Service role full access governance issue events" ON governance_issue_events;
CREATE POLICY "Service role full access governance issue events"
  ON governance_issue_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users view field evidence for accessible records" ON field_evidence_assets;
CREATE POLICY "Users view field evidence for accessible records"
  ON field_evidence_assets FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (
      (field_visit_id IS NOT NULL AND can_access_field_visit(field_visit_id))
      OR (governance_issue_id IS NOT NULL AND can_access_governance_issue(governance_issue_id))
      OR current_user_has_any_role(ARRAY['environmental_manager', 'executive', 'admin'])
    )
  );

DROP POLICY IF EXISTS "Users insert field evidence for accessible records" ON field_evidence_assets;
CREATE POLICY "Users insert field evidence for accessible records"
  ON field_evidence_assets FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND uploaded_by = auth.uid()
    AND (
      (field_visit_id IS NOT NULL AND can_access_field_visit(field_visit_id))
      OR (governance_issue_id IS NOT NULL AND can_access_governance_issue(governance_issue_id))
    )
  );

DROP POLICY IF EXISTS "Users delete field evidence for accessible records" ON field_evidence_assets;
CREATE POLICY "Users delete field evidence for accessible records"
  ON field_evidence_assets FOR DELETE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND (
      uploaded_by = auth.uid()
      OR current_user_has_any_role(ARRAY['environmental_manager', 'executive', 'admin'])
    )
  );

DROP POLICY IF EXISTS "Service role full access field evidence" ON field_evidence_assets;
CREATE POLICY "Service role full access field evidence"
  ON field_evidence_assets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 7. Completion guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_field_visit_completion()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_field_visits_enforce_completion ON field_visits;
CREATE TRIGGER trg_field_visits_enforce_completion
  BEFORE UPDATE ON field_visits
  FOR EACH ROW EXECUTE FUNCTION enforce_field_visit_completion();

DROP TRIGGER IF EXISTS trg_field_visits_validate_relationships ON field_visits;
CREATE TRIGGER trg_field_visits_validate_relationships
  BEFORE INSERT OR UPDATE ON field_visits
  FOR EACH ROW EXECUTE FUNCTION validate_field_visit_relationships();

-- ---------------------------------------------------------------------------
-- 8. Audit triggers for immutable trail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_field_visit_change()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_field_visits_audit_insert ON field_visits;
CREATE TRIGGER trg_field_visits_audit_insert
  AFTER INSERT ON field_visits
  FOR EACH ROW EXECUTE FUNCTION audit_field_visit_change();

DROP TRIGGER IF EXISTS trg_field_visits_audit_update ON field_visits;
CREATE TRIGGER trg_field_visits_audit_update
  AFTER UPDATE ON field_visits
  FOR EACH ROW EXECUTE FUNCTION audit_field_visit_change();

CREATE OR REPLACE FUNCTION audit_governance_issue_change()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_governance_issues_audit_insert ON governance_issues;
CREATE TRIGGER trg_governance_issues_audit_insert
  AFTER INSERT ON governance_issues
  FOR EACH ROW EXECUTE FUNCTION audit_governance_issue_change();

DROP TRIGGER IF EXISTS trg_governance_issues_audit_update ON governance_issues;
CREATE TRIGGER trg_governance_issues_audit_update
  AFTER UPDATE ON governance_issues
  FOR EACH ROW EXECUTE FUNCTION audit_governance_issue_change();

CREATE OR REPLACE FUNCTION audit_governance_issue_event()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_governance_issue_events_audit ON governance_issue_events;
CREATE TRIGGER trg_governance_issue_events_audit
  AFTER INSERT ON governance_issue_events
  FOR EACH ROW EXECUTE FUNCTION audit_governance_issue_event();

-- ---------------------------------------------------------------------------
-- 9. Updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_field_visits_updated_at ON field_visits;
CREATE TRIGGER trg_field_visits_updated_at
  BEFORE UPDATE ON field_visits
  FOR EACH ROW EXECUTE FUNCTION update_field_ops_timestamp();

DROP TRIGGER IF EXISTS trg_outlet_inspections_updated_at ON outlet_inspections;
CREATE TRIGGER trg_outlet_inspections_updated_at
  BEFORE UPDATE ON outlet_inspections
  FOR EACH ROW EXECUTE FUNCTION update_field_ops_timestamp();

DROP TRIGGER IF EXISTS trg_no_discharge_events_updated_at ON no_discharge_events;
CREATE TRIGGER trg_no_discharge_events_updated_at
  BEFORE UPDATE ON no_discharge_events
  FOR EACH ROW EXECUTE FUNCTION update_field_ops_timestamp();

DROP TRIGGER IF EXISTS trg_access_issues_updated_at ON access_issues;
CREATE TRIGGER trg_access_issues_updated_at
  BEFORE UPDATE ON access_issues
  FOR EACH ROW EXECUTE FUNCTION update_field_ops_timestamp();

DROP TRIGGER IF EXISTS trg_governance_issues_updated_at ON governance_issues;
CREATE TRIGGER trg_governance_issues_updated_at
  BEFORE UPDATE ON governance_issues
  FOR EACH ROW EXECUTE FUNCTION update_field_ops_timestamp();

DROP TRIGGER IF EXISTS trg_outlet_inspections_lock_completed ON outlet_inspections;
CREATE TRIGGER trg_outlet_inspections_lock_completed
  BEFORE INSERT OR UPDATE OR DELETE ON outlet_inspections
  FOR EACH ROW EXECUTE FUNCTION ensure_field_visit_editable();

DROP TRIGGER IF EXISTS trg_field_measurements_lock_completed ON field_measurements;
CREATE TRIGGER trg_field_measurements_lock_completed
  BEFORE INSERT OR UPDATE OR DELETE ON field_measurements
  FOR EACH ROW EXECUTE FUNCTION ensure_field_visit_editable();

DROP TRIGGER IF EXISTS trg_no_discharge_events_lock_completed ON no_discharge_events;
CREATE TRIGGER trg_no_discharge_events_lock_completed
  BEFORE INSERT OR UPDATE OR DELETE ON no_discharge_events
  FOR EACH ROW EXECUTE FUNCTION ensure_field_visit_editable();

DROP TRIGGER IF EXISTS trg_access_issues_lock_completed ON access_issues;
CREATE TRIGGER trg_access_issues_lock_completed
  BEFORE INSERT OR UPDATE OR DELETE ON access_issues
  FOR EACH ROW EXECUTE FUNCTION ensure_field_visit_editable();

DROP TRIGGER IF EXISTS trg_field_evidence_assets_lock_completed ON field_evidence_assets;
CREATE TRIGGER trg_field_evidence_assets_lock_completed
  BEFORE INSERT OR UPDATE OR DELETE ON field_evidence_assets
  FOR EACH ROW EXECUTE FUNCTION ensure_field_visit_editable();

-- ---------------------------------------------------------------------------
-- 10. Storage bucket + org-scoped policies for field evidence
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'field-inspections',
  'field-inspections',
  false,
  26214400,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Org upload field visit evidence" ON storage.objects;
CREATE POLICY "Org upload field visit evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'field-inspections'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

DROP POLICY IF EXISTS "Org read field visit evidence" ON storage.objects;
CREATE POLICY "Org read field visit evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'field-inspections'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

DROP POLICY IF EXISTS "Org delete field visit evidence" ON storage.objects;
CREATE POLICY "Org delete field visit evidence"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'field-inspections'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

COMMIT;

-- Phase 1: Foundation Hardening & Offline Completion
-- 1. governance_escalation_config — configurable escalation chain (replaces hardcoded "Bill Johnson")
-- 2. field_outbound_sync_log — server-side log of offline queue flush events for admin visibility
-- 3. field_visits.offline_created_at — sync diagnostic timestamp
-- 4. Idempotency guard on complete_field_visit RPC
-- 5. Updated complete_field_visit to read escalation config instead of hardcoded names

-- ============================================================================
-- 1. Governance Escalation Config
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance_escalation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  issue_type text NOT NULL
    CHECK (issue_type IN ('access_issue', 'potential_force_majeure')),
  step_number integer NOT NULL CHECK (step_number BETWEEN 1 AND 6),
  owner_name text NOT NULL,
  owner_role text NOT NULL,
  owner_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  sla_hours integer NOT NULL DEFAULT 24,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, issue_type, step_number)
);

COMMENT ON TABLE governance_escalation_config IS
  'Configurable escalation chain per issue type. Replaces hardcoded "Bill Johnson" in complete_field_visit RPC.';

ALTER TABLE governance_escalation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY governance_escalation_config_select ON governance_escalation_config
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY governance_escalation_config_insert ON governance_escalation_config
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY governance_escalation_config_update ON governance_escalation_config
  FOR UPDATE USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY governance_escalation_config_delete ON governance_escalation_config
  FOR DELETE USING (organization_id = get_user_org_id());

-- Seed default escalation config for all existing organizations
-- Step 1 = Bill Johnson (compliance review), Step 2 = Tom Lusk (elevation)
INSERT INTO governance_escalation_config (organization_id, issue_type, step_number, owner_name, owner_role, sla_hours)
SELECT o.id, it.issue_type, s.step_number, s.owner_name, s.owner_role, s.sla_hours
FROM organizations o
CROSS JOIN (VALUES ('access_issue'), ('potential_force_majeure')) AS it(issue_type)
CROSS JOIN (VALUES
  (1, 'Bill Johnson', 'Chief Compliance Officer', 24),
  (2, 'Tom Lusk', 'COO', 48)
) AS s(step_number, owner_name, owner_role, sla_hours)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. Field Outbound Sync Log
-- ============================================================================
CREATE TABLE IF NOT EXISTS field_outbound_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  ops_processed integer NOT NULL DEFAULT 0,
  ops_failed integer NOT NULL DEFAULT 0,
  ops_held integer NOT NULL DEFAULT 0,
  held_op_kinds text[] NOT NULL DEFAULT ARRAY[]::text[],
  held_visit_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  error_message text,
  conflict_hold_reason text,
  device_info jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE field_outbound_sync_log IS
  'Server-side record of offline outbound queue flush attempts for admin diagnostics.';

ALTER TABLE field_outbound_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_outbound_sync_log_select ON field_outbound_sync_log
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY field_outbound_sync_log_insert ON field_outbound_sync_log
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_field_outbound_sync_log_org_synced
  ON field_outbound_sync_log (organization_id, synced_at DESC);

CREATE INDEX idx_field_outbound_sync_log_user
  ON field_outbound_sync_log (user_id, synced_at DESC);

-- ============================================================================
-- 3. field_visits.offline_created_at
-- ============================================================================
ALTER TABLE field_visits
  ADD COLUMN IF NOT EXISTS offline_created_at timestamptz;

COMMENT ON COLUMN field_visits.offline_created_at IS
  'Timestamp from the client device when the visit was started offline. NULL if started while online.';

-- ============================================================================
-- 4 & 5. Replace complete_field_visit with idempotency guard + configurable escalation
-- ============================================================================
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
SECURITY DEFINER
SET search_path = public
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

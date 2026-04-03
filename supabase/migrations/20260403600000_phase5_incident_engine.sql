-- Phase 5: Incident Engine & Escalation Orchestrator
-- Replaces narrow 2-type governance with formal 18+ type incident system.
-- Preserves governance_issues via legacy_governance_issue_id migration path.
-- Dual escalation chains: operational + compliance.
--
-- Tables:
--   incident_types           — 18+ typed incidents with severity defaults
--   incidents                — main incident records with countdown + severity
--   incident_events          — immutable audit trail per incident
--   escalation_chains        — named chains (operational, compliance)
--   escalation_chain_steps   — ordered steps within a chain

-- ============================================================================
-- 1. Enums
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE incident_severity AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_recoverability AS ENUM ('recoverable', 'non_recoverable', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM (
    'open', 'investigating', 'escalated', 'pending_action',
    'action_taken', 'monitoring', 'closed', 'closed_no_action'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. incident_types — catalog of all recognized incident categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS incident_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'field'
    CHECK (category IN ('field', 'sample_integrity', 'equipment', 'regulatory', 'environmental', 'safety', 'data_quality')),
  default_severity incident_severity NOT NULL DEFAULT 'medium',
  default_recoverability incident_recoverability NOT NULL DEFAULT 'unknown',
  auto_ca_enabled boolean NOT NULL DEFAULT false,
  countdown_hours integer,  -- NULL = no countdown
  operational_chain_id uuid,  -- FK added after escalation_chains created
  compliance_chain_id uuid,   -- FK added after escalation_chains created
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

ALTER TABLE incident_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read incident types"
  ON incident_types FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admin manage incident types"
  ON incident_types FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin update incident types"
  ON incident_types FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

-- ============================================================================
-- 3. escalation_chains — named escalation paths
-- ============================================================================
CREATE TABLE IF NOT EXISTS escalation_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  chain_type text NOT NULL DEFAULT 'operational'
    CHECK (chain_type IN ('operational', 'compliance')),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE escalation_chains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read escalation chains"
  ON escalation_chains FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admin manage escalation chains"
  ON escalation_chains FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin update escalation chains"
  ON escalation_chains FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

-- ============================================================================
-- 4. escalation_chain_steps — ordered steps in a chain
-- ============================================================================
CREATE TABLE IF NOT EXISTS escalation_chain_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES escalation_chains(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number BETWEEN 1 AND 10),
  owner_name text NOT NULL,
  owner_role text NOT NULL,
  owner_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  sla_hours integer NOT NULL DEFAULT 24,
  auto_escalate boolean NOT NULL DEFAULT true,
  notification_channels text[] NOT NULL DEFAULT '{in_app,email}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, step_number)
);

ALTER TABLE escalation_chain_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read chain steps"
  ON escalation_chain_steps FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM escalation_chains ec
      WHERE ec.id = escalation_chain_steps.chain_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Admin manage chain steps"
  ON escalation_chain_steps FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM escalation_chains ec
      WHERE ec.id = escalation_chain_steps.chain_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Admin update chain steps"
  ON escalation_chain_steps FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM escalation_chains ec
      WHERE ec.id = escalation_chain_steps.chain_id
        AND ec.organization_id = get_user_org_id()
    )
  );

-- Now add FKs from incident_types to escalation_chains
ALTER TABLE incident_types
  ADD CONSTRAINT fk_incident_types_operational_chain
    FOREIGN KEY (operational_chain_id) REFERENCES escalation_chains(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_incident_types_compliance_chain
    FOREIGN KEY (compliance_chain_id) REFERENCES escalation_chains(id) ON DELETE SET NULL;

-- ============================================================================
-- 5. incidents — main incident records
-- ============================================================================
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  incident_type_id uuid NOT NULL REFERENCES incident_types(id) ON DELETE RESTRICT,
  incident_number serial,  -- human-readable sequential number
  -- Severity & recoverability
  severity incident_severity NOT NULL DEFAULT 'medium',
  recoverability incident_recoverability NOT NULL DEFAULT 'unknown',
  status incident_status NOT NULL DEFAULT 'open',
  -- Classification (from Phase 2)
  classification_level text NOT NULL DEFAULT 'compliance_sensitive'
    CHECK (classification_level IN (
      'operational_internal', 'compliance_sensitive', 'privileged',
      'public_eligible', 'regulator_shareable', 'restricted'
    )),
  -- Content
  title text NOT NULL,
  description text,
  root_cause text,
  -- Countdown clock
  countdown_started_at timestamptz,
  countdown_expires_at timestamptz,
  countdown_reason text,
  countdown_paused boolean NOT NULL DEFAULT false,
  -- Escalation state
  active_chain_type text DEFAULT 'operational'
    CHECK (active_chain_type IN ('operational', 'compliance')),
  current_escalation_step integer NOT NULL DEFAULT 1,
  current_owner_name text,
  current_owner_role text,
  current_owner_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  escalated_at timestamptz,
  -- Related entities
  field_visit_id uuid REFERENCES field_visits(id) ON DELETE SET NULL,
  outfall_id uuid,
  permit_id uuid,
  corrective_action_id uuid REFERENCES corrective_actions(id) ON DELETE SET NULL,
  -- Legacy migration path
  legacy_governance_issue_id uuid REFERENCES governance_issues(id) ON DELETE SET NULL,
  -- Auto-CA
  auto_ca_triggered boolean NOT NULL DEFAULT false,
  auto_ca_created_at timestamptz,
  -- Decree references
  decree_paragraphs text[] DEFAULT '{}',
  -- Metadata
  reported_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read incidents"
  ON incidents FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Org insert incidents"
  ON incidents FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Org update incidents"
  ON incidents FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_incidents_org_status
  ON incidents (organization_id, status, severity)
  WHERE status NOT IN ('closed', 'closed_no_action');

CREATE INDEX idx_incidents_countdown
  ON incidents (countdown_expires_at)
  WHERE countdown_expires_at IS NOT NULL
    AND status NOT IN ('closed', 'closed_no_action')
    AND countdown_paused = false;

CREATE INDEX idx_incidents_field_visit
  ON incidents (field_visit_id)
  WHERE field_visit_id IS NOT NULL;

CREATE INDEX idx_incidents_legacy
  ON incidents (legacy_governance_issue_id)
  WHERE legacy_governance_issue_id IS NOT NULL;

-- ============================================================================
-- 6. incident_events — immutable audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'created', 'status_changed', 'severity_changed', 'escalated',
      'owner_changed', 'note_added', 'evidence_linked', 'ca_created',
      'countdown_started', 'countdown_paused', 'countdown_resumed',
      'countdown_expired', 'resolved', 'reopened', 'classified'
    )),
  actor_name text NOT NULL,
  actor_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  old_value text,
  new_value text,
  notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incident_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read incident events"
  ON incident_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = incident_events.incident_id
        AND i.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Org insert incident events"
  ON incident_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM incidents i
      WHERE i.id = incident_events.incident_id
        AND i.organization_id = get_user_org_id()
    )
  );

CREATE INDEX idx_incident_events_incident
  ON incident_events (incident_id, created_at DESC);

-- ============================================================================
-- 7. Seed default escalation chains + 18 incident types for all orgs
-- ============================================================================
DO $$
DECLARE
  v_org_id uuid;
  v_op_chain_id uuid;
  v_comp_chain_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    -- Operational chain: Job Supt → PE (Derek) → Bill → John → Tom
    INSERT INTO escalation_chains (organization_id, name, chain_type, description)
    VALUES (v_org_id, 'Operational', 'operational', 'Field → PE → CCO → VP Ops → COO')
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO v_op_chain_id;

    IF v_op_chain_id IS NOT NULL THEN
      INSERT INTO escalation_chain_steps (chain_id, step_number, owner_name, owner_role, sla_hours) VALUES
        (v_op_chain_id, 1, 'Job Superintendent', 'site_manager', 4),
        (v_op_chain_id, 2, 'Derek O''Neil', 'Professional Engineer', 8),
        (v_op_chain_id, 3, 'Bill Johnson', 'Chief Compliance Officer', 24),
        (v_op_chain_id, 4, 'John Lawson', 'VP Operations', 48),
        (v_op_chain_id, 5, 'Tom Lusk', 'COO', 72)
      ON CONFLICT (chain_id, step_number) DO NOTHING;
    END IF;

    -- Compliance chain: Bill → Tom → COO → CEO/Counsel
    INSERT INTO escalation_chains (organization_id, name, chain_type, description)
    VALUES (v_org_id, 'Compliance', 'compliance', 'CCO → COO → CEO → Chief Counsel')
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO v_comp_chain_id;

    IF v_comp_chain_id IS NOT NULL THEN
      INSERT INTO escalation_chain_steps (chain_id, step_number, owner_name, owner_role, sla_hours) VALUES
        (v_comp_chain_id, 1, 'Bill Johnson', 'Chief Compliance Officer', 24),
        (v_comp_chain_id, 2, 'Tom Lusk', 'COO', 48),
        (v_comp_chain_id, 3, 'CEO', 'ceo_view', 72),
        (v_comp_chain_id, 4, 'Chief Counsel', 'chief_counsel', 96)
      ON CONFLICT (chain_id, step_number) DO NOTHING;
    END IF;

    -- Seed 18 incident types
    INSERT INTO incident_types (organization_id, code, name, category, default_severity, default_recoverability, auto_ca_enabled, countdown_hours, operational_chain_id, compliance_chain_id) VALUES
      (v_org_id, 'access_issue',         'Access Issue',                  'field',             'high',     'recoverable',     true,  72,   v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'force_majeure',        'Potential Force Majeure',       'environmental',     'critical', 'non_recoverable', true,  48,   v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'broken_container',     'Broken Sample Container',       'sample_integrity',  'high',     'recoverable',     true,  24,   v_op_chain_id, NULL),
      (v_org_id, 'cooler_excursion',     'Cooler Temperature Excursion',  'sample_integrity',  'high',     'recoverable',     true,  4,    v_op_chain_id, NULL),
      (v_org_id, 'hold_time_violation',  'Hold Time Violation',           'sample_integrity',  'critical', 'non_recoverable', true,  NULL, v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'chain_of_custody',     'Chain of Custody Break',        'sample_integrity',  'high',     'recoverable',     true,  24,   v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'wrong_preservative',   'Wrong Preservative',            'sample_integrity',  'high',     'non_recoverable', true,  24,   v_op_chain_id, NULL),
      (v_org_id, 'missed_sample',        'Missed Sampling Event',         'field',             'high',     'non_recoverable', true,  48,   v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'equipment_failure',    'Equipment Failure',             'equipment',         'medium',   'recoverable',     false, NULL, v_op_chain_id, NULL),
      (v_org_id, 'calibration_failure',  'Calibration Failure',           'equipment',         'high',     'recoverable',     true,  24,   v_op_chain_id, NULL),
      (v_org_id, 'meter_out_of_range',   'Meter Reading Out of Range',    'equipment',         'medium',   'unknown',         false, NULL, v_op_chain_id, NULL),
      (v_org_id, 'exceedance',           'Parameter Exceedance',          'regulatory',        'critical', 'non_recoverable', true,  24,   v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'permit_violation',     'Permit Violation',              'regulatory',        'critical', 'non_recoverable', true,  24,   v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'spill',               'Spill or Release',              'environmental',     'critical', 'non_recoverable', true,  4,    v_op_chain_id, v_comp_chain_id),
      (v_org_id, 'safety_incident',     'Safety Incident',               'safety',            'critical', 'unknown',         true,  4,    v_op_chain_id, NULL),
      (v_org_id, 'near_miss',           'Near Miss',                     'safety',            'medium',   'recoverable',     false, NULL, v_op_chain_id, NULL),
      (v_org_id, 'data_entry_error',    'Data Entry Error',              'data_quality',      'low',      'recoverable',     false, NULL, v_op_chain_id, NULL),
      (v_org_id, 'lab_data_discrepancy','Lab Data Discrepancy',          'data_quality',      'medium',   'unknown',         true,  48,   v_op_chain_id, v_comp_chain_id)
    ON CONFLICT (organization_id, code) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================================
-- 8. RPC: create_incident — creates incident + first event + starts countdown
-- ============================================================================
CREATE OR REPLACE FUNCTION create_incident(
  p_incident_type_code text,
  p_title text,
  p_description text DEFAULT NULL,
  p_severity incident_severity DEFAULT NULL,
  p_field_visit_id uuid DEFAULT NULL,
  p_decree_paragraphs text[] DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================================================
-- 9. RPC: escalate_incident — advance to next step in active chain
-- ============================================================================
CREATE OR REPLACE FUNCTION escalate_incident(
  p_incident_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident RECORD;
  v_type RECORD;
  v_chain_id uuid;
  v_next_step RECORD;
  v_actor_name text;
BEGIN
  SELECT * INTO v_incident FROM incidents WHERE id = p_incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;

  SELECT * INTO v_type FROM incident_types WHERE id = v_incident.incident_type_id;

  -- Determine active chain
  IF v_incident.active_chain_type = 'compliance' THEN
    v_chain_id := v_type.compliance_chain_id;
  ELSE
    v_chain_id := v_type.operational_chain_id;
  END IF;

  IF v_chain_id IS NULL THEN
    RAISE EXCEPTION 'No escalation chain configured for this incident type + chain type';
  END IF;

  -- Get next step
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

  -- Send notification to new owner
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

-- ============================================================================
-- 10. RPC: resolve_incident — close with resolution notes
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_incident(
  p_incident_id uuid,
  p_resolution_notes text,
  p_status incident_status DEFAULT 'closed'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
  v_old_status text;
BEGIN
  SELECT status::text INTO v_old_status FROM incidents WHERE id = p_incident_id;

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

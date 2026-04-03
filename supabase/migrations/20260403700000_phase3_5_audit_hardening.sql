-- Post-audit hardening for Phases 3-5
-- Fixes: org-scoped incident numbering, missing DELETE policies,
-- RPC authorization, missing indexes on FK columns

-- ============================================================================
-- 1. Fix incident_number: replace global serial with org-scoped sequence
-- ============================================================================

-- Add org-scoped incident numbering via trigger instead of global serial
ALTER TABLE incidents ALTER COLUMN incident_number DROP DEFAULT;

CREATE OR REPLACE FUNCTION set_org_incident_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT COALESCE(MAX(incident_number), 0) + 1
  INTO NEW.incident_number
  FROM incidents
  WHERE organization_id = NEW.organization_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_set_incident_number
  BEFORE INSERT ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION set_org_incident_number();

-- ============================================================================
-- 2. Add missing DELETE policies
-- ============================================================================

-- notifications: users can delete (dismiss) own
CREATE POLICY "Users delete own notifications"
  ON notifications FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

-- notification_preferences: users can delete own
CREATE POLICY "Users delete own preferences"
  ON notification_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- readiness_requirements: admin can deactivate (soft delete via update, but add policy)
CREATE POLICY "Admin delete readiness requirements"
  ON readiness_requirements FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- training_catalog: admin soft-delete via is_active, but add policy
CREATE POLICY "Admin delete training catalog"
  ON training_catalog FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- training_requirements: admin delete
CREATE POLICY "Admin delete training requirements"
  ON training_requirements FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- equipment_catalog: admin soft-delete
CREATE POLICY "Admin delete equipment catalog"
  ON equipment_catalog FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- incident_types: admin delete
CREATE POLICY "Admin delete incident types"
  ON incident_types FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- escalation_chains: admin delete
CREATE POLICY "Admin delete escalation chains"
  ON escalation_chains FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- escalation_chain_steps: admin delete
CREATE POLICY "Admin delete chain steps"
  ON escalation_chain_steps FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM escalation_chains ec
      WHERE ec.id = escalation_chain_steps.chain_id
        AND ec.organization_id = get_user_org_id()
    )
  );

-- ============================================================================
-- 3. Add org authorization to escalate_incident and resolve_incident RPCs
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

-- ============================================================================
-- 4. Missing indexes on FK columns
-- ============================================================================

-- Phase 3: readiness_checks
CREATE INDEX IF NOT EXISTS idx_readiness_checks_requirement
  ON readiness_checks (requirement_id);

-- Phase 4: training_completions FK indexes
CREATE INDEX IF NOT EXISTS idx_training_completions_training
  ON training_completions (training_id);

CREATE INDEX IF NOT EXISTS idx_training_completions_verified_by
  ON training_completions (verified_by)
  WHERE verified_by IS NOT NULL;

-- Phase 4: equipment_assignments
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_assigned_to
  ON equipment_assignments (assigned_to)
  WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_assignments_assigned_by
  ON equipment_assignments (assigned_by);

-- Phase 4: maintenance_logs
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_performed_by
  ON maintenance_logs (performed_by)
  WHERE performed_by IS NOT NULL;

-- Phase 5: incidents FK indexes
CREATE INDEX IF NOT EXISTS idx_incidents_type
  ON incidents (incident_type_id);

CREATE INDEX IF NOT EXISTS idx_incidents_reported_by
  ON incidents (reported_by)
  WHERE reported_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_corrective_action
  ON incidents (corrective_action_id)
  WHERE corrective_action_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_current_owner
  ON incidents (current_owner_user_id)
  WHERE current_owner_user_id IS NOT NULL;

-- Phase 5: incident_events FK
CREATE INDEX IF NOT EXISTS idx_incident_events_actor
  ON incident_events (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

-- Phase 5: escalation_chain_steps FK
CREATE INDEX IF NOT EXISTS idx_escalation_chain_steps_owner
  ON escalation_chain_steps (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- ============================================================================
-- 5. Add org auth check to check_training_readiness
-- ============================================================================

CREATE OR REPLACE FUNCTION check_training_readiness(
  p_user_id uuid
) RETURNS TABLE (
  requirement_id uuid,
  training_name text,
  is_blocking boolean,
  is_met boolean,
  expires_at date,
  days_until_expiry integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================================================
-- 6. Add org auth to get_equipment_due_calibration
-- ============================================================================

CREATE OR REPLACE FUNCTION get_equipment_due_calibration(
  p_org_id uuid,
  p_within_days integer DEFAULT 14
) RETURNS TABLE (
  equipment_id uuid,
  equipment_name text,
  equipment_type text,
  serial_number text,
  last_calibrated_at timestamptz,
  next_calibration_due date,
  days_until_due integer,
  assigned_to_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

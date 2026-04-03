-- Phase 6: Corrective Action Workflow Engine — Integration & Intelligence
--
-- 6A. Incident → CA Bridge
--   - auto_create_ca_from_incident() trigger
--   - Bidirectional linking (incident.corrective_action_id already exists)
--
-- 6B. Notification Integration
--   - CA notification triggers (assignment, step advance, overdue, signature)
--   - No new tables — uses existing notifications infrastructure
--
-- 6C. Root Cause Analysis Templates
--   - rca_templates table — predefined categories + 5-why structure
--   - rca_findings table — linked to CA, structured RCA capture
--
-- 6D. Supporting
--   - source_type enum extension to include 'incident'
--   - Notification event types for CA lifecycle

-- ============================================================================
-- 1. Extend source_type to include 'incident'
-- ============================================================================
-- corrective_actions.source_type is text with CHECK, not an enum.
-- Need to update the CHECK constraint.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find and drop existing check constraint on source_type
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'corrective_actions'::regclass
    AND conname LIKE '%source_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE corrective_actions DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  -- Add updated constraint with 'incident' included
  ALTER TABLE corrective_actions
    ADD CONSTRAINT corrective_actions_source_type_check
    CHECK (source_type IN ('exceedance', 'enforcement', 'audit', 'inspection', 'manual', 'incident'));
END $$;

-- ============================================================================
-- 2. rca_templates — predefined root cause categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS rca_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL
    CHECK (category IN (
      'equipment_failure', 'human_error', 'procedure_gap',
      'weather_event', 'design_deficiency', 'material_failure',
      'training_gap', 'communication_failure', 'external_factor',
      'monitoring_gap', 'maintenance_lapse', 'regulatory_change'
    )),
  description text,
  -- Structured 5-why prompts
  why_prompts text[] NOT NULL DEFAULT '{}',
  -- Suggested preventive actions
  suggested_preventive_actions text[] NOT NULL DEFAULT '{}',
  -- Consent Decree paragraph references
  decree_paragraphs text[] NOT NULL DEFAULT '{}',
  -- Metadata
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE rca_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read rca templates"
  ON rca_templates FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admin insert rca templates"
  ON rca_templates FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin update rca templates"
  ON rca_templates FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin delete rca templates"
  ON rca_templates FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

CREATE INDEX idx_rca_templates_org_category
  ON rca_templates (organization_id, category)
  WHERE is_active = true;

-- ============================================================================
-- 3. rca_findings — structured root cause analysis linked to CA
-- ============================================================================
CREATE TABLE IF NOT EXISTS rca_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corrective_action_id uuid NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES rca_templates(id) ON DELETE SET NULL,
  -- RCA category (may differ from template if manually entered)
  category text NOT NULL,
  -- 5-Why chain
  why_1 text,
  why_2 text,
  why_3 text,
  why_4 text,
  why_5 text,
  -- Contributing factors (structured)
  contributing_factors jsonb NOT NULL DEFAULT '[]',
  -- Root cause determination
  root_cause_summary text NOT NULL,
  -- Recurrence risk
  recurrence_risk text CHECK (recurrence_risk IN ('low', 'medium', 'high', 'critical')),
  -- Suggested preventive action (from template or custom)
  preventive_recommendation text,
  -- Consent Decree paragraphs impacted
  decree_paragraphs text[] NOT NULL DEFAULT '{}',
  -- Analyst
  analyzed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rca_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read rca findings"
  ON rca_findings FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Org members insert rca findings"
  ON rca_findings FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Org members update rca findings"
  ON rca_findings FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Org members delete rca findings"
  ON rca_findings FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

CREATE INDEX idx_rca_findings_ca ON rca_findings (corrective_action_id);
CREATE INDEX idx_rca_findings_org ON rca_findings (organization_id);
CREATE INDEX idx_rca_findings_template ON rca_findings (template_id) WHERE template_id IS NOT NULL;

-- ============================================================================
-- 4. Trigger: Auto-create CA from incident
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_create_ca_from_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type RECORD;
  v_ca_id uuid;
  v_site_id uuid;
  v_permit_id uuid;
  v_state text;
BEGIN
  -- Only fire when auto_ca_triggered changes to true
  IF NOT NEW.auto_ca_triggered THEN
    RETURN NEW;
  END IF;

  -- Skip if CA already linked
  IF NEW.corrective_action_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get incident type info
  SELECT * INTO v_type
  FROM incident_types
  WHERE id = NEW.incident_type_id;

  -- Resolve site/permit from field_visit if available
  IF NEW.field_visit_id IS NOT NULL THEN
    SELECT fv.site_id, fv.permit_id
    INTO v_site_id, v_permit_id
    FROM field_visits fv
    WHERE fv.id = NEW.field_visit_id;
  END IF;

  -- Resolve state from site
  IF v_site_id IS NOT NULL THEN
    SELECT st.code INTO v_state
    FROM sites s
    JOIN states st ON s.state_id = st.id
    WHERE s.id = v_site_id;
  END IF;

  -- Map incident severity to CA priority
  INSERT INTO corrective_actions (
    organization_id,
    site_id,
    npdes_permit_id,
    state,
    source_type,
    source_id,
    title,
    description,
    priority,
    status,
    workflow_step,
    due_date,
    date_received,
    created_at,
    updated_at
  ) VALUES (
    NEW.organization_id,
    v_site_id,
    v_permit_id,
    v_state,
    'incident',
    NEW.id,
    format('Incident: %s — %s', COALESCE(v_type.name, 'Unknown'), NEW.title),
    COALESCE(NEW.description, '') ||
      CASE WHEN NEW.decree_paragraphs IS NOT NULL AND array_length(NEW.decree_paragraphs, 1) > 0
        THEN E'\n\nConsent Decree ¶: ' || array_to_string(NEW.decree_paragraphs, ', ')
        ELSE ''
      END,
    CASE NEW.severity
      WHEN 'critical' THEN 'critical'
      WHEN 'high' THEN 'high'
      WHEN 'medium' THEN 'medium'
      ELSE 'low'
    END,
    'open',
    'identification',
    (CURRENT_DATE + INTERVAL '7 days')::date,
    NEW.reported_at::date,
    now(),
    now()
  ) RETURNING id INTO v_ca_id;

  -- Link CA back to incident
  UPDATE incidents
  SET corrective_action_id = v_ca_id,
      auto_ca_created_at = now(),
      updated_at = now()
  WHERE id = NEW.id;

  -- Log event on incident timeline
  INSERT INTO incident_events (
    incident_id, event_type, actor_name, actor_user_id,
    new_value, notes
  ) VALUES (
    NEW.id, 'ca_created', 'System', NULL,
    v_ca_id::text,
    'Corrective Action auto-created from incident'
  );

  RETURN NEW;
END;
$$;

-- Fire on INSERT (auto_ca_enabled types) and UPDATE (manual trigger)
DROP TRIGGER IF EXISTS trg_incident_creates_ca ON incidents;
CREATE TRIGGER trg_incident_creates_ca
  AFTER INSERT OR UPDATE OF auto_ca_triggered ON incidents
  FOR EACH ROW
  WHEN (NEW.auto_ca_triggered = true)
  EXECUTE FUNCTION auto_create_ca_from_incident();

-- ============================================================================
-- 5. Trigger: CA notification on assignment
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_ca_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when followup_assigned_to changes to a non-null value
  IF NEW.followup_assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if no change
  IF OLD IS NOT NULL AND OLD.followup_assigned_to = NEW.followup_assigned_to THEN
    RETURN NEW;
  END IF;

  PERFORM send_notification(
    NEW.followup_assigned_to,
    'corrective_action_assigned',
    'Corrective Action assigned to you: ' || NEW.title,
    format('Priority: %s | Due: %s | Step: %s',
           NEW.priority,
           COALESCE(NEW.due_date::text, 'No due date'),
           REPLACE(NEW.workflow_step, '_', ' ')),
    CASE NEW.priority
      WHEN 'critical' THEN 'critical'::notification_priority
      WHEN 'high' THEN 'urgent'::notification_priority
      ELSE 'warning'::notification_priority
    END,
    'corrective_action',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ca_notify_assignment ON corrective_actions;
CREATE TRIGGER trg_ca_notify_assignment
  AFTER INSERT OR UPDATE OF followup_assigned_to ON corrective_actions
  FOR EACH ROW
  EXECUTE FUNCTION notify_ca_assignment();

-- ============================================================================
-- 6. Trigger: CA notification on workflow step advance
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_ca_step_advanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire on step change
  IF OLD.workflow_step = NEW.workflow_step THEN
    RETURN NEW;
  END IF;

  -- Notify assigned user (if any)
  IF NEW.followup_assigned_to IS NOT NULL THEN
    PERFORM send_notification(
      NEW.followup_assigned_to,
      'corrective_action_due',
      format('CA "%s" advanced to %s', NEW.title, REPLACE(NEW.workflow_step, '_', ' ')),
      format('Previous step: %s | New step: %s | Status: %s',
             REPLACE(OLD.workflow_step, '_', ' '),
             REPLACE(NEW.workflow_step, '_', ' '),
             NEW.status),
      'info'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  -- If at verification or closure, notify responsible person
  IF NEW.workflow_step IN ('verification', 'closure') AND NEW.responsible_person_id IS NOT NULL THEN
    PERFORM send_notification(
      NEW.responsible_person_id,
      'corrective_action_due',
      format('CA "%s" needs your signature (%s step)', NEW.title, REPLACE(NEW.workflow_step, '_', ' ')),
      'Your signature is required to advance this corrective action.',
      'urgent'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ca_notify_step ON corrective_actions;
CREATE TRIGGER trg_ca_notify_step
  AFTER UPDATE OF workflow_step ON corrective_actions
  FOR EACH ROW
  EXECUTE FUNCTION notify_ca_step_advanced();

-- ============================================================================
-- 7. Trigger: CA notification on signature
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_ca_signature()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Responsible person just signed — notify assigned user
  IF OLD.responsible_person_signed_at IS NULL
     AND NEW.responsible_person_signed_at IS NOT NULL
     AND NEW.followup_assigned_to IS NOT NULL THEN
    PERFORM send_notification(
      NEW.followup_assigned_to,
      'corrective_action_due',
      format('CA "%s" signed by responsible person', NEW.title),
      'Responsible person has signed. Awaiting approver signature.',
      'info'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  -- Approver just signed — notify assigned user
  IF OLD.approved_by_signed_at IS NULL
     AND NEW.approved_by_signed_at IS NOT NULL
     AND NEW.followup_assigned_to IS NOT NULL THEN
    PERFORM send_notification(
      NEW.followup_assigned_to,
      'corrective_action_due',
      format('CA "%s" approved — ready for closure', NEW.title),
      'Both signatures captured. This corrective action can now be closed.',
      'info'::notification_priority,
      'corrective_action',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ca_notify_signature ON corrective_actions;
CREATE TRIGGER trg_ca_notify_signature
  AFTER UPDATE OF responsible_person_signed_at, approved_by_signed_at ON corrective_actions
  FOR EACH ROW
  EXECUTE FUNCTION notify_ca_signature();

-- ============================================================================
-- 8. RPC: create_ca_from_incident — manual creation from incident detail
-- ============================================================================
CREATE OR REPLACE FUNCTION create_ca_from_incident(
  p_incident_id uuid,
  p_title text DEFAULT NULL,
  p_priority text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident RECORD;
  v_type RECORD;
  v_caller_org uuid;
  v_ca_id uuid;
  v_site_id uuid;
  v_permit_id uuid;
  v_state text;
BEGIN
  v_caller_org := get_user_org_id();

  SELECT * INTO v_incident FROM incidents WHERE id = p_incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
  IF v_incident.organization_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied: incident belongs to another organization';
  END IF;

  -- Already has CA?
  IF v_incident.corrective_action_id IS NOT NULL THEN
    RAISE EXCEPTION 'Incident already has a linked corrective action';
  END IF;

  SELECT * INTO v_type FROM incident_types WHERE id = v_incident.incident_type_id;

  -- Resolve site/permit
  IF v_incident.field_visit_id IS NOT NULL THEN
    SELECT fv.site_id, fv.permit_id INTO v_site_id, v_permit_id
    FROM field_visits fv WHERE fv.id = v_incident.field_visit_id;
  END IF;

  IF v_site_id IS NOT NULL THEN
    SELECT st.code INTO v_state
    FROM sites s JOIN states st ON s.state_id = st.id
    WHERE s.id = v_site_id;
  END IF;

  INSERT INTO corrective_actions (
    organization_id, site_id, npdes_permit_id, state,
    source_type, source_id,
    title, description,
    priority, status, workflow_step,
    due_date, date_received,
    created_by, created_at, updated_at
  ) VALUES (
    v_caller_org, v_site_id, v_permit_id, v_state,
    'incident', p_incident_id,
    COALESCE(p_title, format('Incident: %s — %s', COALESCE(v_type.name, 'Unknown'), v_incident.title)),
    v_incident.description,
    COALESCE(p_priority,
      CASE v_incident.severity
        WHEN 'critical' THEN 'critical'
        WHEN 'high' THEN 'high'
        WHEN 'medium' THEN 'medium'
        ELSE 'low'
      END),
    'open', 'identification',
    (CURRENT_DATE + INTERVAL '7 days')::date,
    v_incident.reported_at::date,
    auth.uid(), now(), now()
  ) RETURNING id INTO v_ca_id;

  -- Link CA to incident
  UPDATE incidents SET
    corrective_action_id = v_ca_id,
    auto_ca_triggered = true,
    auto_ca_created_at = now(),
    updated_at = now()
  WHERE id = p_incident_id;

  -- Event on incident timeline
  INSERT INTO incident_events (
    incident_id, event_type, actor_name, actor_user_id,
    new_value, notes
  ) VALUES (
    p_incident_id, 'ca_created',
    (SELECT COALESCE(first_name || ' ' || last_name, email) FROM user_profiles WHERE id = auth.uid()),
    auth.uid(),
    v_ca_id::text,
    'Corrective Action created manually from incident'
  );

  RETURN v_ca_id;
END;
$$;

-- ============================================================================
-- 9. Seed RCA templates for all orgs
-- ============================================================================
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    INSERT INTO rca_templates (organization_id, name, category, description, why_prompts, suggested_preventive_actions, decree_paragraphs) VALUES
      (v_org_id, 'Settling Pond Equipment Failure',   'equipment_failure',
       'Settling pond pump, valve, or structural failure causing discharge issues',
       ARRAY['What component failed?', 'Why did the component fail?', 'Why was the failure not detected sooner?', 'Why was preventive maintenance not performed?', 'What systemic issue allowed this?'],
       ARRAY['Establish preventive maintenance schedule', 'Install redundant equipment', 'Add condition monitoring sensors'],
       ARRAY['¶13', '¶14']),

      (v_org_id, 'Sampling Protocol Deviation',       'human_error',
       'Field sampler deviated from SOPs during collection, preservation, or transport',
       ARRAY['What step was missed or done incorrectly?', 'Why was the SOP not followed?', 'Why was the error not caught in QA review?', 'Why is the training/supervision inadequate?', 'What process gap allows this to recur?'],
       ARRAY['Retrain sampler on SOP', 'Add field QA checklist', 'Implement buddy system for critical samples'],
       ARRAY['¶15', '¶16']),

      (v_org_id, 'Rainfall Exceedance Event',          'weather_event',
       'Extreme rainfall causing discharge exceedance beyond design capacity',
       ARRAY['What rainfall amount triggered the event?', 'Why did the system exceed capacity?', 'Why was the design capacity insufficient?', 'Why was no contingency plan triggered?', 'What long-term design improvement is needed?'],
       ARRAY['Review and update design storm criteria', 'Install additional BMP capacity', 'Create emergency response protocol for storm events'],
       ARRAY['¶13', '¶18']),

      (v_org_id, 'Calibration Failure',                'maintenance_lapse',
       'Field instrument out of calibration leading to inaccurate readings',
       ARRAY['Which instrument failed calibration?', 'Why was it not calibrated on schedule?', 'Why was the out-of-cal condition not detected?', 'Why is the calibration tracking system inadequate?', 'What systemic improvement is needed?'],
       ARRAY['Implement automated calibration reminders', 'Add pre-use calibration checks to daily checklist', 'Maintain backup instruments'],
       ARRAY['¶15']),

      (v_org_id, 'Chain of Custody Break',             'procedure_gap',
       'Sample custody documentation gap compromising data integrity',
       ARRAY['Where in the chain was custody lost?', 'Why was the handoff not documented?', 'Why did the custody tracking system fail?', 'Why was the break not detected during review?', 'What process improvement prevents this?'],
       ARRAY['Implement electronic COC tracking', 'Add custody handoff verification step', 'Train all handlers on COC requirements'],
       ARRAY['¶15', '¶16']),

      (v_org_id, 'Lab Analytical Error',               'external_factor',
       'Contract laboratory produced erroneous results requiring re-analysis',
       ARRAY['What analytical parameter was affected?', 'Why did the lab produce incorrect results?', 'Why was the error not caught in lab QA/QC?', 'Why was it not caught in our data review?', 'What quality assurance improvement is needed?'],
       ARRAY['Require duplicate analysis for critical parameters', 'Add automated lab result validation rules', 'Audit lab QA/QC procedures quarterly'],
       ARRAY['¶15']),

      (v_org_id, 'Missed Sampling Event',              'communication_failure',
       'Required monitoring event not performed within the compliance window',
       ARRAY['Which outlet/parameter was missed?', 'Why was the sampling not performed?', 'Why was the miss not detected earlier?', 'Why did the scheduling system not alert?', 'What scheduling improvement prevents this?'],
       ARRAY['Implement sampling calendar with automated alerts', 'Add 3-day advance warning notifications', 'Establish backup sampler assignments'],
       ARRAY['¶14', '¶15']),

      (v_org_id, 'Permit Limit Exceedance',            'monitoring_gap',
       'Discharge parameter exceeded NPDES permit limit',
       ARRAY['Which parameter exceeded the limit?', 'Why was the parameter out of compliance?', 'Why was the trend not detected before exceedance?', 'Why are existing BMPs insufficient?', 'What treatment/BMP enhancement is needed?'],
       ARRAY['Implement trend monitoring with early warning thresholds', 'Evaluate BMP upgrades', 'Increase monitoring frequency for at-risk parameters'],
       ARRAY['¶13', '¶14']),

      (v_org_id, 'Training Certification Lapse',       'training_gap',
       'Personnel performed regulated activities with expired or missing certifications',
       ARRAY['Which certification lapsed?', 'Why was the lapse not detected?', 'Why was renewal not completed on time?', 'Why is the tracking system inadequate?', 'What systemic fix prevents this?'],
       ARRAY['Implement automated certification expiry alerts', 'Block dispatch of uncertified personnel', 'Maintain qualification matrix with auto-checks'],
       ARRAY['¶15', '¶16']),

      (v_org_id, 'Data Entry / Transcription Error',   'human_error',
       'Incorrect data entered into compliance system from field notes or lab reports',
       ARRAY['What data was incorrectly entered?', 'Why was it entered wrong?', 'Why was it not caught in data review?', 'Why is the data validation system inadequate?', 'What automated check prevents this?'],
       ARRAY['Add input validation rules to data entry forms', 'Implement four-eyes review for critical data', 'Automate data import from lab EDDs'],
       ARRAY['¶15']),

      (v_org_id, 'Spill or Unauthorized Discharge',    'design_deficiency',
       'Uncontrolled release of water, sediment, or chemicals to waters of the state',
       ARRAY['What was discharged and how much?', 'Why did the spill occur?', 'Why was the containment inadequate?', 'Why was the spill not prevented or contained faster?', 'What infrastructure improvement is needed?'],
       ARRAY['Install secondary containment', 'Create spill response kit stations', 'Conduct quarterly spill response drills'],
       ARRAY['¶13', '¶18']),

      (v_org_id, 'Regulatory Change Impact',           'regulatory_change',
       'New or amended permit conditions, regulations, or Consent Decree requirements',
       ARRAY['What changed in the regulatory requirement?', 'Why was the change not incorporated into procedures?', 'Why was the regulatory tracking system not updated?', 'Why is the regulatory change management process inadequate?', 'What process ensures timely incorporation?'],
       ARRAY['Establish regulatory tracking subscription', 'Implement change impact assessment workflow', 'Schedule quarterly regulatory review meetings'],
       ARRAY['¶13'])

    ON CONFLICT (organization_id, name) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================================
-- 10. Indexes for new integration paths
-- ============================================================================
-- Incident → CA lookup
CREATE INDEX IF NOT EXISTS idx_incidents_corrective_action
  ON incidents (corrective_action_id)
  WHERE corrective_action_id IS NOT NULL;

-- CA → source_id for incident source
CREATE INDEX IF NOT EXISTS idx_ca_source_incident
  ON corrective_actions (source_id)
  WHERE source_type = 'incident';

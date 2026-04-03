-- Phase 8: Work Orders, Compliance Database & Human Override
--
-- 8A. Work Orders — deficiency-triggered, SLA-tracked
-- 8B. Compliance Violations — violation/NOV/enforcement database
-- 8C. Human Overrides — immutable override records
-- 8D. Legal Holds — freeze records from auto-close

-- ============================================================================
-- 1. Work Orders
-- ============================================================================
CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Source linkage
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('field_deficiency', 'inspection', 'incident', 'exceedance', 'manual')),
  source_id uuid,
  -- Location
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  outfall_id uuid REFERENCES outfalls(id) ON DELETE SET NULL,
  permit_id uuid REFERENCES npdes_permits(id) ON DELETE SET NULL,
  -- Details
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled')),
  category text
    CHECK (category IN (
      'equipment_repair', 'erosion_control', 'sediment_removal',
      'outfall_maintenance', 'bmp_installation', 'signage',
      'access_road', 'vegetation', 'structural', 'other'
    )),
  -- Assignment
  assigned_to uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  -- SLA tracking
  due_date date,
  sla_hours integer,
  -- Completion
  completed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  verified_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  -- Photos
  before_photo_path text,
  after_photo_path text,
  -- Recurrence
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_count integer NOT NULL DEFAULT 0,
  previous_work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  -- Metadata
  notes text,
  decree_paragraphs text[],
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_orders_org_read ON work_orders
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY work_orders_org_insert ON work_orders
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY work_orders_org_update ON work_orders
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 2. Work Order Events (timeline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS work_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'created', 'assigned', 'status_changed', 'priority_changed',
      'note_added', 'photo_uploaded', 'reassigned', 'completed',
      'verified', 'cancelled', 'reopened', 'sla_warning', 'sla_breach'
    )),
  old_value text,
  new_value text,
  notes text,
  photo_path text,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_order_events_read ON work_order_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_events.work_order_id
        AND wo.organization_id = get_user_org_id()
    )
  );

CREATE POLICY work_order_events_insert ON work_order_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = work_order_events.work_order_id
        AND wo.organization_id = get_user_org_id()
    )
  );

-- ============================================================================
-- 3. Compliance Violations
-- ============================================================================
CREATE TABLE IF NOT EXISTS compliance_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Source linkage
  exceedance_id uuid REFERENCES exceedances(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  corrective_action_id uuid REFERENCES corrective_actions(id) ON DELETE SET NULL,
  -- Location
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  permit_id uuid REFERENCES npdes_permits(id) ON DELETE SET NULL,
  outfall_id uuid REFERENCES outfalls(id) ON DELETE SET NULL,
  -- Violation details
  violation_type text NOT NULL
    CHECK (violation_type IN (
      'permit_exceedance', 'reporting_failure', 'monitoring_failure',
      'discharge_violation', 'bmp_failure', 'consent_decree_violation',
      'spill', 'unauthorized_discharge', 'recordkeeping', 'other'
    )),
  violation_date date NOT NULL,
  discovery_date date,
  parameter_id uuid REFERENCES parameters(id) ON DELETE SET NULL,
  measured_value numeric,
  limit_value numeric,
  unit text,
  exceedance_pct numeric,
  -- Severity & status
  severity text NOT NULL DEFAULT 'minor'
    CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_investigation', 'reported', 'resolved', 'closed')),
  -- Root cause
  root_cause text,
  root_cause_category text
    CHECK (root_cause_category IN (
      'equipment_failure', 'human_error', 'process_failure',
      'weather_event', 'design_deficiency', 'training_gap',
      'maintenance_lapse', 'external_factor', 'unknown', 'other'
    )),
  -- Financial
  estimated_penalty numeric,
  actual_penalty numeric,
  penalty_paid_date date,
  -- Regulatory
  decree_paragraphs text[],
  regulatory_agency text,
  state_code text CHECK (state_code IN ('AL', 'KY', 'TN', 'VA', 'WV')),
  -- Resolution
  resolution_notes text,
  resolved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  -- Metadata
  description text,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY violations_org_read ON compliance_violations
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY violations_org_insert ON compliance_violations
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY violations_org_update ON compliance_violations
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 4. NOV Records (Notices of Violation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS nov_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  violation_id uuid REFERENCES compliance_violations(id) ON DELETE SET NULL,
  -- NOV details
  nov_number text,
  issuing_agency text NOT NULL,
  state_code text CHECK (state_code IN ('AL', 'KY', 'TN', 'VA', 'WV')),
  issued_date date NOT NULL,
  received_date date,
  -- Response tracking
  response_due_date date,
  response_submitted_date date,
  response_status text NOT NULL DEFAULT 'pending'
    CHECK (response_status IN ('pending', 'drafting', 'under_review', 'submitted', 'accepted', 'appealed')),
  -- Content
  description text,
  alleged_violations text,
  proposed_penalty numeric,
  final_penalty numeric,
  -- Files
  nov_document_path text,
  response_document_path text,
  -- Resolution
  resolution_notes text,
  resolved_at timestamptz,
  -- Metadata
  decree_paragraphs text[],
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nov_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY nov_records_org_read ON nov_records
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY nov_records_org_insert ON nov_records
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY nov_records_org_update ON nov_records
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 5. Enforcement Actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS enforcement_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  violation_id uuid REFERENCES compliance_violations(id) ON DELETE SET NULL,
  nov_id uuid REFERENCES nov_records(id) ON DELETE SET NULL,
  -- Action details
  action_type text NOT NULL
    CHECK (action_type IN (
      'administrative_order', 'consent_order', 'compliance_schedule',
      'penalty_assessment', 'injunctive_relief', 'supplemental_environmental_project',
      'criminal_referral', 'other'
    )),
  issuing_agency text NOT NULL,
  state_code text CHECK (state_code IN ('AL', 'KY', 'TN', 'VA', 'WV')),
  -- Dates
  issued_date date NOT NULL,
  effective_date date,
  compliance_deadline date,
  -- Financial
  penalty_amount numeric,
  penalty_paid boolean NOT NULL DEFAULT false,
  penalty_paid_date date,
  -- Status
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'in_compliance', 'completed', 'appealed', 'vacated')),
  -- Content
  description text,
  requirements text,
  decree_paragraphs text[],
  -- Files
  document_path text,
  -- Resolution
  resolution_notes text,
  resolved_at timestamptz,
  -- Metadata
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE enforcement_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY enforcement_org_read ON enforcement_actions
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY enforcement_org_insert ON enforcement_actions
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY enforcement_org_update ON enforcement_actions
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 6. Human Overrides — immutable audit records for automated determinations
-- ============================================================================
CREATE TABLE IF NOT EXISTS human_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- What was overridden
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'exceedance', 'classification', 'escalation', 'incident',
      'corrective_action', 'dmr_line_item', 'violation', 'readiness_check'
    )),
  entity_id uuid NOT NULL,
  -- Override details
  field_name text NOT NULL,
  original_value text,
  override_value text NOT NULL,
  reason text NOT NULL,
  -- Approval
  overridden_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  -- Metadata — IMMUTABLE (no updated_at, no update policy)
  decree_paragraphs text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE human_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY overrides_org_read ON human_overrides
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY overrides_org_insert ON human_overrides
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- NO UPDATE/DELETE policies — overrides are immutable

-- ============================================================================
-- 7. Legal Holds — freeze records from auto-close/auto-archive
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- What is held
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'exceedance', 'incident', 'corrective_action', 'violation',
      'work_order', 'dmr_submission', 'governance_issue'
    )),
  entity_id uuid NOT NULL,
  -- Hold details
  hold_reason text NOT NULL,
  hold_category text NOT NULL DEFAULT 'litigation'
    CHECK (hold_category IN ('litigation', 'investigation', 'regulatory_inquiry', 'audit', 'other')),
  -- Active flag
  is_active boolean NOT NULL DEFAULT true,
  -- Placed by
  placed_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  placed_at timestamptz NOT NULL DEFAULT now(),
  -- Released by
  released_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  released_at timestamptz,
  release_reason text,
  -- Metadata
  decree_paragraphs text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_holds_org_read ON legal_holds
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY legal_holds_org_insert ON legal_holds
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY legal_holds_org_update ON legal_holds
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_holds_unique_active
  ON legal_holds (entity_type, entity_id)
  WHERE is_active = true;

-- ============================================================================
-- 8. Triggers
-- ============================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_work_order_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_updated ON work_orders;
CREATE TRIGGER trg_work_order_updated
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION update_work_order_timestamp();

DROP TRIGGER IF EXISTS trg_violation_updated ON compliance_violations;
CREATE TRIGGER trg_violation_updated
  BEFORE UPDATE ON compliance_violations
  FOR EACH ROW EXECUTE FUNCTION update_work_order_timestamp();

DROP TRIGGER IF EXISTS trg_nov_updated ON nov_records;
CREATE TRIGGER trg_nov_updated
  BEFORE UPDATE ON nov_records
  FOR EACH ROW EXECUTE FUNCTION update_work_order_timestamp();

DROP TRIGGER IF EXISTS trg_enforcement_updated ON enforcement_actions;
CREATE TRIGGER trg_enforcement_updated
  BEFORE UPDATE ON enforcement_actions
  FOR EACH ROW EXECUTE FUNCTION update_work_order_timestamp();

DROP TRIGGER IF EXISTS trg_legal_hold_updated ON legal_holds;
CREATE TRIGGER trg_legal_hold_updated
  BEFORE UPDATE ON legal_holds
  FOR EACH ROW EXECUTE FUNCTION update_work_order_timestamp();

-- Notify on work order assignment
CREATE OR REPLACE FUNCTION notify_work_order_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    PERFORM send_notification(
      NEW.assigned_to,
      'corrective_action_assigned',
      format('Work Order Assigned: %s', NEW.title),
      COALESCE(NEW.description, 'A work order has been assigned to you.'),
      CASE NEW.priority
        WHEN 'critical' THEN 'urgent'::notification_priority
        WHEN 'high' THEN 'warning'::notification_priority
        ELSE 'info'::notification_priority
      END,
      'work_order',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_assigned ON work_orders;
CREATE TRIGGER trg_work_order_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_work_order_assignment();

-- Notify on legal hold placed/released
CREATE OR REPLACE FUNCTION notify_legal_hold_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_ids uuid[];
BEGIN
  -- Notify all admins and chief_counsel in the org
  SELECT array_agg(id) INTO v_admin_ids
  FROM user_profiles
  WHERE organization_id = NEW.organization_id
    AND role IN ('admin', 'chief_counsel', 'coo')
    AND is_active = true;

  IF v_admin_ids IS NOT NULL THEN
    FOR i IN 1..array_length(v_admin_ids, 1) LOOP
      PERFORM send_notification(
        v_admin_ids[i],
        'governance_issue_raised',
        CASE
          WHEN TG_OP = 'INSERT' THEN format('Legal Hold Placed on %s', NEW.entity_type)
          WHEN NOT NEW.is_active AND OLD.is_active THEN format('Legal Hold Released on %s', NEW.entity_type)
          ELSE format('Legal Hold Updated on %s', NEW.entity_type)
        END,
        COALESCE(
          CASE WHEN TG_OP = 'INSERT' THEN NEW.hold_reason ELSE NEW.release_reason END,
          'Legal hold status changed.'
        ),
        'urgent'::notification_priority,
        NEW.entity_type,
        NEW.entity_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_hold_notify ON legal_holds;
CREATE TRIGGER trg_legal_hold_notify
  AFTER INSERT OR UPDATE OF is_active ON legal_holds
  FOR EACH ROW
  EXECUTE FUNCTION notify_legal_hold_change();

-- ============================================================================
-- 9. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_work_orders_org_status
  ON work_orders (organization_id, status)
  WHERE status NOT IN ('completed', 'verified', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_work_orders_assigned
  ON work_orders (assigned_to)
  WHERE status IN ('assigned', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_work_orders_due_date
  ON work_orders (due_date)
  WHERE status NOT IN ('completed', 'verified', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_violations_org_status
  ON compliance_violations (organization_id, status)
  WHERE status != 'closed';

CREATE INDEX IF NOT EXISTS idx_violations_date
  ON compliance_violations (violation_date DESC);

CREATE INDEX IF NOT EXISTS idx_nov_response_due
  ON nov_records (response_due_date)
  WHERE response_status IN ('pending', 'drafting');

CREATE INDEX IF NOT EXISTS idx_enforcement_status
  ON enforcement_actions (organization_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_human_overrides_entity
  ON human_overrides (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_legal_holds_active
  ON legal_holds (entity_type, entity_id)
  WHERE is_active = true;

-- Phase 3: Notification Engine & Readiness Gate
-- Creates notification infrastructure + dispatch readiness checks
--
-- Tables:
--   notifications              — in-app / email / SMS notifications
--   notification_preferences   — per-user, per-event-type channel prefs
--   readiness_requirements     — what must be true before dispatch
--   readiness_checks           — per-batch readiness evaluation log
--
-- Modifications:
--   sampling_route_batches     — add readiness_gate columns

-- ============================================================================
-- 1. Notification priority enum
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE notification_priority AS ENUM ('info', 'warning', 'urgent', 'critical', 'emergency');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. notifications table
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- Event metadata
  event_type text NOT NULL,
  priority notification_priority NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  -- Delivery channels
  channels text[] NOT NULL DEFAULT '{in_app}',
  -- Channel delivery status
  in_app_read_at timestamptz,
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  email_error text,
  sms_error text,
  -- Link to related entity
  entity_type text,
  entity_id uuid,
  -- Metadata
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_id uuid,
  ADD COLUMN IF NOT EXISTS priority notification_priority DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS channels text[] DEFAULT '{in_app}',
  ADD COLUMN IF NOT EXISTS in_app_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS sms_error text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE notifications
      SET recipient_id = user_id
      WHERE recipient_id IS NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'recipient_id'
  ) THEN
    EXECUTE $sql$
      UPDATE notifications n
      SET organization_id = up.organization_id
      FROM user_profiles up
      WHERE n.recipient_id = up.id
        AND n.organization_id IS NULL
    $sql$;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE notifications n
      SET organization_id = up.organization_id
      FROM user_profiles up
      WHERE n.user_id = up.id
        AND n.organization_id IS NULL
    $sql$;
  END IF;
END $$;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- Users can update (mark read/dismiss) their own notifications
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- System inserts via RPC or edge functions (org-scoped)
DROP POLICY IF EXISTS "Org-scoped notification insert" ON notifications;
CREATE POLICY "Org-scoped notification insert"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_id, created_at DESC)
  WHERE in_app_read_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_org_event
  ON notifications (organization_id, event_type, created_at DESC);

-- ============================================================================
-- 3. notification_preferences — per-user channel preferences by event type
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own preferences" ON notification_preferences;
CREATE POLICY "Users manage own preferences"
  ON notification_preferences FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 4. readiness_requirements — what qualifications/checks are needed
-- ============================================================================
CREATE TABLE IF NOT EXISTS readiness_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requirement_type text NOT NULL
    CHECK (requirement_type IN ('training', 'certification', 'equipment', 'calibration', 'custom')),
  name text NOT NULL,
  description text,
  is_blocking boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  applies_to_roles text[] NOT NULL DEFAULT '{field_sampler}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE readiness_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read readiness requirements"
  ON readiness_requirements FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admin insert readiness requirements"
  ON readiness_requirements FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin update readiness requirements"
  ON readiness_requirements FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_readiness_requirements_org_active
  ON readiness_requirements (organization_id)
  WHERE is_active = true;

-- ============================================================================
-- 5. readiness_checks — per-batch evaluation of requirements
-- ============================================================================
CREATE TABLE IF NOT EXISTS readiness_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_batch_id uuid NOT NULL REFERENCES sampling_route_batches(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES readiness_requirements(id) ON DELETE CASCADE,
  checked_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
  passed boolean NOT NULL,
  failure_reason text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_batch_id, requirement_id)
);

ALTER TABLE readiness_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read readiness checks"
  ON readiness_checks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sampling_route_batches srb
      WHERE srb.id = readiness_checks.route_batch_id
        AND srb.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Org members insert readiness checks"
  ON readiness_checks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sampling_route_batches srb
      WHERE srb.id = readiness_checks.route_batch_id
        AND srb.organization_id = get_user_org_id()
    )
  );

CREATE INDEX idx_readiness_checks_batch
  ON readiness_checks (route_batch_id);

-- ============================================================================
-- 6. Add readiness gate columns to sampling_route_batches
-- ============================================================================
ALTER TABLE sampling_route_batches
  ADD COLUMN IF NOT EXISTS readiness_gate_passed boolean,
  ADD COLUMN IF NOT EXISTS readiness_override_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS readiness_override_reason text,
  ADD COLUMN IF NOT EXISTS readiness_checked_at timestamptz;

-- ============================================================================
-- 7. RPC: send_notification — creates a notification row + returns id
-- ============================================================================
CREATE OR REPLACE FUNCTION send_notification(
  p_recipient_id uuid,
  p_event_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_priority notification_priority DEFAULT 'info',
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_notification_id uuid;
  v_prefs RECORD;
  v_channels text[] := ARRAY['in_app'];
BEGIN
  -- Resolve org from recipient
  SELECT organization_id INTO v_org_id
  FROM user_profiles WHERE id = p_recipient_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- Check user preferences for this event type
  SELECT * INTO v_prefs
  FROM notification_preferences
  WHERE user_id = p_recipient_id AND event_type = p_event_type;

  IF FOUND THEN
    v_channels := ARRAY['in_app'];
    IF v_prefs.email_enabled THEN v_channels := v_channels || 'email'; END IF;
    IF v_prefs.sms_enabled THEN v_channels := v_channels || 'sms'; END IF;
    -- If user disabled in_app, still include it for urgent+
    IF NOT v_prefs.in_app_enabled AND p_priority NOT IN ('urgent', 'critical', 'emergency') THEN
      v_channels := array_remove(v_channels, 'in_app');
    END IF;
  END IF;

  -- Always include all channels for emergency
  IF p_priority = 'emergency' THEN
    v_channels := ARRAY['in_app', 'email', 'sms'];
  END IF;

  INSERT INTO notifications (
    organization_id, recipient_id, event_type, priority,
    title, body, channels, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id, p_recipient_id, p_event_type, p_priority,
    p_title, p_body, v_channels, p_entity_type, p_entity_id, p_metadata
  ) RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- 8. RPC: check_readiness_gate — evaluates all requirements for a batch
-- ============================================================================
CREATE OR REPLACE FUNCTION check_readiness_gate(
  p_batch_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_all_passed boolean;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM sampling_route_batches WHERE id = p_batch_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- Check if all blocking requirements have passing checks
  SELECT NOT EXISTS (
    SELECT 1
    FROM readiness_requirements rr
    WHERE rr.organization_id = v_org_id
      AND rr.is_active = true
      AND rr.is_blocking = true
      AND NOT EXISTS (
        SELECT 1 FROM readiness_checks rc
        WHERE rc.route_batch_id = p_batch_id
          AND rc.requirement_id = rr.id
          AND rc.passed = true
      )
  ) INTO v_all_passed;

  -- Update the batch
  UPDATE sampling_route_batches
  SET readiness_gate_passed = v_all_passed,
      readiness_checked_at = now()
  WHERE id = p_batch_id;

  RETURN v_all_passed;
END;
$$;

-- ============================================================================
-- 9. RPC: override_readiness_gate — admin bypass with audit trail
-- ============================================================================
CREATE OR REPLACE FUNCTION override_readiness_gate(
  p_batch_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sampling_route_batches
  SET readiness_gate_passed = true,
      readiness_override_by = auth.uid(),
      readiness_override_reason = p_reason,
      readiness_checked_at = now()
  WHERE id = p_batch_id;

  -- Audit log entry
  INSERT INTO audit_log (
    user_id, action, details, module, table_name, record_id
  ) VALUES (
    auth.uid(),
    'readiness_gate_override',
    jsonb_build_object('batch_id', p_batch_id, 'reason', p_reason),
    'field_ops',
    'sampling_route_batches',
    p_batch_id
  );
END;
$$;

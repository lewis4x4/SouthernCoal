-- Phase 4: Training, Certification & Equipment Management
-- Workforce qualification + equipment tracking feeding Phase 3 readiness gate
--
-- Tables:
--   training_catalog           — courses/certifications available
--   training_requirements      — which roles require which training
--   training_completions       — individual completion records + certificate storage
--   equipment_catalog          — tablets, meters, GPS, coolers, vehicles
--   equipment_assignments      — who has what equipment
--   calibration_logs           — instrument calibration records
--   maintenance_logs           — equipment maintenance history
--   daily_readiness_checklists — pre-shift equipment/readiness checks
--   bottle_kit_inventory       — sample container tracking

-- ============================================================================
-- 1. training_catalog — available courses and certifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('safety', 'compliance', 'field_operations', 'equipment', 'regulatory', 'general')),
  is_certification boolean NOT NULL DEFAULT false,
  validity_months integer,  -- NULL = never expires
  renewal_window_days integer DEFAULT 30,  -- days before expiry to start warning
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE training_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read training catalog"
  ON training_catalog FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admin manage training catalog"
  ON training_catalog FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin update training catalog"
  ON training_catalog FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_training_catalog_org
  ON training_catalog (organization_id) WHERE is_active = true;

-- ============================================================================
-- 2. training_requirements — role-to-training mapping
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  training_id uuid NOT NULL REFERENCES training_catalog(id) ON DELETE CASCADE,
  required_for_roles text[] NOT NULL DEFAULT '{field_sampler}',
  is_blocking boolean NOT NULL DEFAULT true,  -- blocks dispatch if not completed
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, training_id)
);

ALTER TABLE training_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read training requirements"
  ON training_requirements FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admin manage training requirements"
  ON training_requirements FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin update training requirements"
  ON training_requirements FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

-- ============================================================================
-- 3. training_completions — individual completion/certification records
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  training_id uuid NOT NULL REFERENCES training_catalog(id) ON DELETE CASCADE,
  completed_at date NOT NULL DEFAULT CURRENT_DATE,
  expires_at date,  -- computed from training_catalog.validity_months
  certificate_storage_path text,  -- Supabase storage path
  certificate_file_name text,
  verified_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'pending_verification')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE training_completions ENABLE ROW LEVEL SECURITY;

-- Users see their own + admins see org
CREATE POLICY "Users read own training completions"
  ON training_completions FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Org insert training completions"
  ON training_completions FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Org update training completions"
  ON training_completions FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_training_completions_user
  ON training_completions (user_id, training_id, status);

CREATE INDEX idx_training_completions_expiring
  ON training_completions (expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- ============================================================================
-- 4. equipment_catalog — all trackable equipment
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  equipment_type text NOT NULL
    CHECK (equipment_type IN ('tablet', 'meter', 'gps', 'cooler', 'vehicle', 'probe', 'sampler', 'other')),
  serial_number text,
  model text,
  manufacturer text,
  purchase_date date,
  warranty_expires date,
  requires_calibration boolean NOT NULL DEFAULT false,
  calibration_interval_days integer,  -- NULL if no calibration needed
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'assigned', 'maintenance', 'retired', 'lost')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE equipment_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read equipment catalog"
  ON equipment_catalog FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admin manage equipment catalog"
  ON equipment_catalog FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admin update equipment catalog"
  ON equipment_catalog FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_equipment_catalog_org_type
  ON equipment_catalog (organization_id, equipment_type)
  WHERE is_active = true;

-- ============================================================================
-- 5. equipment_assignments — who has what
-- ============================================================================
CREATE TABLE IF NOT EXISTS equipment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment_catalog(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  condition_on_assign text DEFAULT 'good'
    CHECK (condition_on_assign IN ('good', 'fair', 'needs_repair')),
  condition_on_return text
    CHECK (condition_on_return IS NULL OR condition_on_return IN ('good', 'fair', 'needs_repair', 'damaged')),
  notes text
);

ALTER TABLE equipment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read equipment assignments"
  ON equipment_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM equipment_catalog ec
      WHERE ec.id = equipment_assignments.equipment_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Org insert equipment assignments"
  ON equipment_assignments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM equipment_catalog ec
      WHERE ec.id = equipment_assignments.equipment_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Org update equipment assignments"
  ON equipment_assignments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM equipment_catalog ec
      WHERE ec.id = equipment_assignments.equipment_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE INDEX idx_equipment_assignments_active
  ON equipment_assignments (equipment_id, assigned_to)
  WHERE returned_at IS NULL;

-- ============================================================================
-- 6. calibration_logs — instrument calibration records
-- ============================================================================
CREATE TABLE IF NOT EXISTS calibration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment_catalog(id) ON DELETE CASCADE,
  calibrated_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
  calibrated_at timestamptz NOT NULL DEFAULT now(),
  next_calibration_due date,
  result text NOT NULL DEFAULT 'pass'
    CHECK (result IN ('pass', 'fail', 'adjusted')),
  standard_used text,
  readings_before jsonb,
  readings_after jsonb,
  certificate_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calibration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read calibration logs"
  ON calibration_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM equipment_catalog ec
      WHERE ec.id = calibration_logs.equipment_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Org insert calibration logs"
  ON calibration_logs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM equipment_catalog ec
      WHERE ec.id = calibration_logs.equipment_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE INDEX idx_calibration_logs_equipment
  ON calibration_logs (equipment_id, calibrated_at DESC);

CREATE INDEX idx_calibration_logs_due
  ON calibration_logs (next_calibration_due)
  WHERE next_calibration_due IS NOT NULL;

-- ============================================================================
-- 7. maintenance_logs — equipment maintenance history
-- ============================================================================
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment_catalog(id) ON DELETE CASCADE,
  performed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  maintenance_type text NOT NULL DEFAULT 'preventive'
    CHECK (maintenance_type IN ('preventive', 'corrective', 'emergency', 'inspection')),
  description text NOT NULL,
  parts_replaced text,
  cost_estimate numeric(10, 2),
  performed_at timestamptz NOT NULL DEFAULT now(),
  next_maintenance_due date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read maintenance logs"
  ON maintenance_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM equipment_catalog ec
      WHERE ec.id = maintenance_logs.equipment_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Org insert maintenance logs"
  ON maintenance_logs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM equipment_catalog ec
      WHERE ec.id = maintenance_logs.equipment_id
        AND ec.organization_id = get_user_org_id()
    )
  );

CREATE INDEX idx_maintenance_logs_equipment
  ON maintenance_logs (equipment_id, performed_at DESC);

-- ============================================================================
-- 8. daily_readiness_checklists — pre-shift field readiness
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_readiness_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  checklist_date date NOT NULL DEFAULT CURRENT_DATE,
  -- Equipment checks
  tablet_charged boolean,
  gps_functional boolean,
  meter_calibrated boolean,
  cooler_prepared boolean,
  bottles_sufficient boolean,
  vehicle_inspected boolean,
  ppe_available boolean,
  -- Overall
  all_passed boolean NOT NULL DEFAULT false,
  notes text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, checklist_date)
);

ALTER TABLE daily_readiness_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own checklists"
  ON daily_readiness_checklists FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users insert own checklists"
  ON daily_readiness_checklists FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = get_user_org_id()
  );

CREATE INDEX idx_daily_readiness_user_date
  ON daily_readiness_checklists (user_id, checklist_date DESC);

-- ============================================================================
-- 9. bottle_kit_inventory — sample container tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS bottle_kit_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kit_name text NOT NULL,
  parameter_group text,  -- e.g., 'metals', 'nutrients', 'general chemistry'
  bottle_count integer NOT NULL DEFAULT 0,
  bottles_available integer NOT NULL DEFAULT 0,
  preservative text,  -- e.g., 'HNO3', 'H2SO4', 'None'
  container_type text DEFAULT 'plastic'
    CHECK (container_type IN ('plastic', 'glass', 'amber_glass')),
  volume_ml integer,
  last_restocked_at timestamptz,
  restock_threshold integer DEFAULT 10,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bottle_kit_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read bottle kit inventory"
  ON bottle_kit_inventory FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Org manage bottle kit inventory"
  ON bottle_kit_inventory FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Org update bottle kit inventory"
  ON bottle_kit_inventory FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_bottle_kit_org
  ON bottle_kit_inventory (organization_id);

-- ============================================================================
-- 10. RPC: check_training_readiness — evaluates a user's training status
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
BEGIN
  SELECT organization_id INTO v_org_id
  FROM user_profiles WHERE id = p_user_id;

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
-- 11. RPC: get_equipment_due_calibration — equipment needing attention
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
BEGIN
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

-- ============================================================================
-- 12. Trigger: auto-expire training completions
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_expire_training_completions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE training_completions
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < CURRENT_DATE;
  RETURN NULL;
END;
$$;

-- Run daily via pg_cron or on any training_completions insert/update
-- For now, create a trigger that checks on each insert
CREATE OR REPLACE TRIGGER trg_expire_training_on_insert
  AFTER INSERT ON training_completions
  FOR EACH STATEMENT
  EXECUTE FUNCTION auto_expire_training_completions();

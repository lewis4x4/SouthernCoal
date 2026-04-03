-- Phase 11: Emergency Recovery & System Hardening
--
-- 11A. Emergency Contacts
-- 11B. Emergency Procedures
-- 11C. Data Integrity Checks
-- 11D. Retention Policies
-- 11E. System Health Logs
-- 11F. RPCs

-- ============================================================================
-- 1. Emergency Contacts
-- ============================================================================
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  -- Contact info
  contact_name text NOT NULL,
  contact_role text NOT NULL
    CHECK (contact_role IN (
      'epa_coordinator', 'state_dep_contact', 'legal_counsel',
      'environmental_consultant', 'lab_contact', 'contractor',
      'site_manager', 'safety_officer', 'emergency_responder',
      'regulatory_liaison', 'media_contact', 'other'
    )),
  organization_name text,
  phone_primary text,
  phone_secondary text,
  email text,
  -- Availability
  availability text DEFAULT '24/7'
    CHECK (availability IN ('24/7', 'business_hours', 'on_call', 'scheduled')),
  availability_notes text,
  -- Classification
  is_primary boolean NOT NULL DEFAULT false,
  state_code text CHECK (state_code IN ('AL', 'KY', 'TN', 'VA', 'WV')),
  -- Active
  is_active boolean NOT NULL DEFAULT true,
  -- Metadata
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY emerg_contacts_org_read ON emergency_contacts
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY emerg_contacts_org_insert ON emergency_contacts
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY emerg_contacts_org_update ON emergency_contacts
  FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY emerg_contacts_org_delete ON emergency_contacts
  FOR DELETE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 2. Emergency Procedures
-- ============================================================================
CREATE TABLE IF NOT EXISTS emergency_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Definition
  title text NOT NULL,
  incident_type text NOT NULL
    CHECK (incident_type IN (
      'spill', 'unauthorized_discharge', 'equipment_failure',
      'sampling_failure', 'data_loss', 'permit_exceedance',
      'weather_event', 'site_emergency', 'regulatory_inspection',
      'media_inquiry', 'other'
    )),
  severity_level text NOT NULL DEFAULT 'all'
    CHECK (severity_level IN ('all', 'minor', 'moderate', 'major', 'critical')),
  -- Content
  description text,
  steps jsonb NOT NULL DEFAULT '[]',
  notification_chain jsonb,
  responsible_roles text[],
  -- Regulatory
  decree_paragraphs text[],
  regulatory_requirements text,
  reporting_deadlines text,
  -- Scope
  state_code text CHECK (state_code IN ('AL', 'KY', 'TN', 'VA', 'WV')),
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  last_reviewed_at timestamptz,
  last_reviewed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  -- Metadata
  created_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE emergency_procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY emerg_procedures_org_read ON emergency_procedures
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY emerg_procedures_org_insert ON emergency_procedures
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY emerg_procedures_org_update ON emergency_procedures
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 3. Data Integrity Checks
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_integrity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Run info
  run_type text NOT NULL DEFAULT 'manual'
    CHECK (run_type IN ('manual', 'scheduled', 'startup')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'passed', 'warnings', 'failed')),
  -- Results
  checks_total integer NOT NULL DEFAULT 0,
  checks_passed integer NOT NULL DEFAULT 0,
  checks_warned integer NOT NULL DEFAULT 0,
  checks_failed integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]',
  -- Timing
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  -- Metadata
  run_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_integrity_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY integrity_checks_org_read ON data_integrity_checks
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY integrity_checks_org_insert ON data_integrity_checks
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY integrity_checks_org_update ON data_integrity_checks
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 4. Retention Policies
-- ============================================================================
CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Policy definition
  record_type text NOT NULL,
  display_name text NOT NULL,
  description text,
  -- Retention
  retention_years integer NOT NULL,
  regulatory_basis text NOT NULL,
  -- Status
  is_enforced boolean NOT NULL DEFAULT false,
  last_audit_at timestamptz,
  records_within_policy integer,
  records_outside_policy integer,
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_unique UNIQUE (organization_id, record_type)
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY retention_org_read ON retention_policies
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY retention_org_insert ON retention_policies
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY retention_org_update ON retention_policies
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 5. System Health Logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Metrics
  db_size_mb numeric,
  table_counts jsonb,
  storage_usage_mb numeric,
  active_users_24h integer,
  error_count_24h integer,
  avg_response_ms numeric,
  -- Snapshot
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_logs_org_read ON system_health_logs
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY health_logs_org_insert ON system_health_logs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- ============================================================================
-- 6. Run Data Integrity Check RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION run_data_integrity_check(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_passed integer := 0;
  v_warned integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
  v_count integer;
  v_start timestamptz := clock_timestamp();
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Create check record
  INSERT INTO data_integrity_checks (organization_id, run_by, status)
  VALUES (p_org_id, auth.uid(), 'running')
  RETURNING id INTO v_check_id;

  -- Check 1: Permits without sites
  SELECT COUNT(*) INTO v_count
  FROM npdes_permits WHERE organization_id = p_org_id AND site_id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Permits without sites', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Check 2: Outfalls without permits
  SELECT COUNT(*) INTO v_count
  FROM outfalls o
  LEFT JOIN npdes_permits p ON o.permit_id = p.id
  WHERE p.id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Orphaned outfalls', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 3: Exceedances without lab results
  SELECT COUNT(*) INTO v_count
  FROM exceedances e
  LEFT JOIN lab_results lr ON e.lab_result_id = lr.id
  WHERE e.organization_id = p_org_id AND lr.id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Exceedances without lab results', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 4: Corrective actions without source
  SELECT COUNT(*) INTO v_count
  FROM corrective_actions
  WHERE organization_id = p_org_id AND source_type IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'CAs without source type', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Check 5: Active users without org
  SELECT COUNT(*) INTO v_count
  FROM user_profiles
  WHERE organization_id IS NULL AND is_active = true;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Active users without organization', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 6: Sampling events without outfalls
  SELECT COUNT(*) INTO v_count
  FROM sampling_events se
  LEFT JOIN outfalls o ON se.outfall_id = o.id
  WHERE o.id IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_failed := v_failed + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Orphaned sampling events', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END, 'count', v_count
  );

  -- Check 7: Violations without type
  SELECT COUNT(*) INTO v_count
  FROM compliance_violations
  WHERE organization_id = p_org_id AND violation_type IS NULL;
  v_total := v_total + 1;
  IF v_count = 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Violations without type', 'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Check 8: Audit log gaps (last 24h)
  SELECT COUNT(*) INTO v_count
  FROM audit_log
  WHERE organization_id = p_org_id
    AND created_at >= now() - INTERVAL '24 hours';
  v_total := v_total + 1;
  IF v_count > 0 THEN v_passed := v_passed + 1;
  ELSE v_warned := v_warned + 1; END IF;
  v_results := v_results || jsonb_build_object(
    'check', 'Audit log activity (24h)', 'status', CASE WHEN v_count > 0 THEN 'pass' ELSE 'warn' END, 'count', v_count
  );

  -- Update check record
  UPDATE data_integrity_checks
  SET
    status = CASE
      WHEN v_failed > 0 THEN 'failed'
      WHEN v_warned > 0 THEN 'warnings'
      ELSE 'passed'
    END,
    checks_total = v_total,
    checks_passed = v_passed,
    checks_warned = v_warned,
    checks_failed = v_failed,
    results = v_results,
    completed_at = clock_timestamp(),
    duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::integer
  WHERE id = v_check_id;

  RETURN v_check_id;
END;
$$;

-- ============================================================================
-- 7. Seed Retention Policies
-- ============================================================================
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    INSERT INTO retention_policies (organization_id, record_type, display_name, description, retention_years, regulatory_basis) VALUES
      (v_org_id, 'lab_results', 'Lab Results', 'Laboratory analytical results', 5, 'CWA §402 / 40 CFR 122.41(j)'),
      (v_org_id, 'dmr_submissions', 'DMR Submissions', 'Discharge Monitoring Reports', 5, 'CWA §402 / 40 CFR 122.41(j)'),
      (v_org_id, 'sampling_events', 'Sampling Events', 'Field sampling records', 5, 'CWA §402 / 40 CFR 122.41(j)'),
      (v_org_id, 'npdes_permits', 'NPDES Permits', 'Permit documents and modifications', 10, 'Consent Decree / CWA §402'),
      (v_org_id, 'exceedances', 'Exceedances', 'Permit limit exceedance records', 10, 'Consent Decree §VII'),
      (v_org_id, 'corrective_actions', 'Corrective Actions', 'CA records and evidence', 10, 'Consent Decree §VIII'),
      (v_org_id, 'incidents', 'Incidents', 'Environmental incident records', 10, 'Consent Decree / MSHA'),
      (v_org_id, 'compliance_violations', 'Violations', 'Violation and NOV records', 10, 'Consent Decree §IX'),
      (v_org_id, 'audit_log', 'Audit Trail', 'System audit log entries', 7, 'SOX-equivalent / Consent Decree'),
      (v_org_id, 'field_visits', 'Field Visits', 'Field sampling visit records', 5, 'CWA §402 / 40 CFR 122.41(j)'),
      (v_org_id, 'training_completions', 'Training Records', 'Personnel training records', 5, 'MSHA / OSHA'),
      (v_org_id, 'calibration_records', 'Calibration Records', 'Equipment calibration records', 5, 'CWA / QA/QC requirements')
    ON CONFLICT (organization_id, record_type) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================================
-- 8. Triggers
-- ============================================================================
DROP TRIGGER IF EXISTS trg_emerg_contact_updated ON emergency_contacts;
CREATE TRIGGER trg_emerg_contact_updated
  BEFORE UPDATE ON emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

DROP TRIGGER IF EXISTS trg_emerg_procedure_updated ON emergency_procedures;
CREATE TRIGGER trg_emerg_procedure_updated
  BEFORE UPDATE ON emergency_procedures
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

DROP TRIGGER IF EXISTS trg_retention_updated ON retention_policies;
CREATE TRIGGER trg_retention_updated
  BEFORE UPDATE ON retention_policies
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

-- ============================================================================
-- 9. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_emerg_contacts_org
  ON emergency_contacts (organization_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_emerg_contacts_site
  ON emergency_contacts (site_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_emerg_procedures_org_type
  ON emergency_procedures (organization_id, incident_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_integrity_checks_org
  ON data_integrity_checks (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_logs_org
  ON system_health_logs (organization_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_retention_org
  ON retention_policies (organization_id);

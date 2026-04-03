-- Phase 10: Governance Review & Audit Readiness
--
-- 10A. Audit Checklists — configurable audit prep checklists
-- 10B. Audit Checklist Items — line-item tracking
-- 10C. Document Completeness — per-permit document coverage
-- 10D. Obligation Evidence — consent decree evidence mapping
-- 10E. Governance Reviews — periodic review sessions
-- 10F. RPCs for completeness and readiness scoring

-- ============================================================================
-- 1. Audit Checklists
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Definition
  title text NOT NULL,
  audit_type text NOT NULL
    CHECK (audit_type IN (
      'epa_inspection', 'state_dep_audit', 'consent_decree_review',
      'internal_audit', 'msha_inspection', 'osmre_inspection', 'custom'
    )),
  description text,
  -- Target
  target_date date,
  state_code text CHECK (state_code IN ('AL', 'KY', 'TN', 'VA', 'WV')),
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  -- Status
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'in_progress', 'complete', 'archived')),
  -- Progress (denormalized for performance)
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  -- Sign-off
  reviewed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  -- Metadata
  created_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklists_org_read ON audit_checklists
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY checklists_org_insert ON audit_checklists
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY checklists_org_update ON audit_checklists
  FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY checklists_org_delete ON audit_checklists
  FOR DELETE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 2. Audit Checklist Items
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES audit_checklists(id) ON DELETE CASCADE,
  -- Item definition
  category text NOT NULL DEFAULT 'general',
  item_text text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  -- Status
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'complete', 'na', 'blocked')),
  -- Assignment
  assigned_to uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  due_date date,
  -- Evidence
  evidence_notes text,
  evidence_file_path text,
  evidence_record_type text,
  evidence_record_id uuid,
  -- Completion
  completed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_items_read ON audit_checklist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM audit_checklists ac
      WHERE ac.id = audit_checklist_items.checklist_id
        AND ac.organization_id = get_user_org_id()
    )
  );
CREATE POLICY checklist_items_insert ON audit_checklist_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM audit_checklists ac
      WHERE ac.id = audit_checklist_items.checklist_id
        AND ac.organization_id = get_user_org_id()
    )
  );
CREATE POLICY checklist_items_update ON audit_checklist_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM audit_checklists ac
      WHERE ac.id = audit_checklist_items.checklist_id
        AND ac.organization_id = get_user_org_id()
    )
  );
CREATE POLICY checklist_items_delete ON audit_checklist_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM audit_checklists ac
      WHERE ac.id = audit_checklist_items.checklist_id
        AND ac.organization_id = get_user_org_id()
    )
  );

-- ============================================================================
-- 3. Document Completeness
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_completeness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  permit_id uuid NOT NULL REFERENCES npdes_permits(id) ON DELETE CASCADE,
  -- Document requirements
  document_type text NOT NULL
    CHECK (document_type IN (
      'permit_copy', 'dmr_current', 'dmr_archive', 'sampling_schedule',
      'outfall_map', 'site_map', 'om_manual', 'spcc_plan', 'swppp',
      'training_records', 'inspection_logs', 'monitoring_data',
      'corrective_action_log', 'annual_report', 'discharge_log',
      'chain_of_custody', 'lab_certifications', 'calibration_records',
      'emergency_plan', 'consent_decree_copy'
    )),
  -- Status
  is_on_file boolean NOT NULL DEFAULT false,
  is_current boolean NOT NULL DEFAULT false,
  -- Details
  file_path text,
  last_updated date,
  expiry_date date,
  notes text,
  -- Verification
  verified_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doc_completeness_unique UNIQUE (organization_id, permit_id, document_type)
);

ALTER TABLE document_completeness ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_completeness_org_read ON document_completeness
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY doc_completeness_org_insert ON document_completeness
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY doc_completeness_org_update ON document_completeness
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 4. Obligation Evidence
-- ============================================================================
CREATE TABLE IF NOT EXISTS obligation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES consent_decree_obligations(id) ON DELETE CASCADE,
  -- Evidence
  evidence_type text NOT NULL
    CHECK (evidence_type IN (
      'document', 'record', 'report', 'photo', 'certification',
      'training_completion', 'inspection_report', 'lab_result',
      'dmr_submission', 'corrective_action', 'other'
    )),
  title text NOT NULL,
  description text,
  -- Linkage (one of these)
  file_path text,
  record_table text,
  record_id uuid,
  -- Verification
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'expired', 'insufficient', 'disputed')),
  verified_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  -- Validity
  effective_date date,
  expiry_date date,
  -- Metadata
  submitted_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE obligation_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY obligation_evidence_org_read ON obligation_evidence
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY obligation_evidence_org_insert ON obligation_evidence
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY obligation_evidence_org_update ON obligation_evidence
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 5. Governance Reviews
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Review definition
  title text NOT NULL,
  review_type text NOT NULL DEFAULT 'quarterly'
    CHECK (review_type IN ('quarterly', 'annual', 'special', 'consent_decree')),
  review_period_start date NOT NULL,
  review_period_end date NOT NULL,
  -- Status
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'findings_draft', 'under_review', 'finalized', 'closed')),
  -- Content
  findings text,
  action_items jsonb,
  recommendations text,
  -- Scores at time of review
  compliance_score numeric(5,2),
  audit_readiness_score numeric(5,2),
  -- Sign-off chain
  conducted_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  conducted_at timestamptz,
  reviewed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  -- Metadata
  created_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE governance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY gov_reviews_org_read ON governance_reviews
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY gov_reviews_org_insert ON governance_reviews
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY gov_reviews_org_update ON governance_reviews
  FOR UPDATE USING (organization_id = get_user_org_id());

-- ============================================================================
-- 6. Calculate Document Completeness RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_document_completeness(p_org_id uuid)
RETURNS TABLE (
  permit_id uuid,
  permit_number text,
  site_name text,
  total_required integer,
  on_file integer,
  current_docs integer,
  expired_docs integer,
  completeness_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS permit_id,
    p.permit_number,
    s.name AS site_name,
    COUNT(dc.id)::integer AS total_required,
    COUNT(dc.id) FILTER (WHERE dc.is_on_file)::integer AS on_file,
    COUNT(dc.id) FILTER (WHERE dc.is_current)::integer AS current_docs,
    COUNT(dc.id) FILTER (WHERE dc.expiry_date IS NOT NULL AND dc.expiry_date < CURRENT_DATE)::integer AS expired_docs,
    CASE WHEN COUNT(dc.id) > 0
      THEN ROUND((COUNT(dc.id) FILTER (WHERE dc.is_on_file AND dc.is_current)::numeric / COUNT(dc.id)) * 100, 1)
      ELSE 0
    END AS completeness_pct
  FROM npdes_permits p
  JOIN sites s ON p.site_id = s.id
  LEFT JOIN document_completeness dc ON dc.permit_id = p.id AND dc.organization_id = p_org_id
  WHERE p.organization_id = p_org_id
  GROUP BY p.id, p.permit_number, s.name
  ORDER BY completeness_pct ASC;
END;
$$;

-- ============================================================================
-- 7. Audit Readiness Score RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION get_audit_readiness_score(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checklist_score numeric;
  v_doc_score numeric;
  v_evidence_score numeric;
  v_overall numeric;
  v_total_checklist_items integer;
  v_completed_checklist_items integer;
  v_total_docs integer;
  v_current_docs integer;
  v_total_obligations integer;
  v_evidenced_obligations integer;
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Checklist completion across active checklists
  SELECT
    COALESCE(SUM(total_items), 0),
    COALESCE(SUM(completed_items), 0)
  INTO v_total_checklist_items, v_completed_checklist_items
  FROM audit_checklists
  WHERE organization_id = p_org_id
    AND status IN ('active', 'in_progress');

  v_checklist_score := CASE WHEN v_total_checklist_items > 0
    THEN ROUND((v_completed_checklist_items::numeric / v_total_checklist_items) * 100, 1)
    ELSE 100 END;

  -- Document completeness
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_on_file AND is_current)
  INTO v_total_docs, v_current_docs
  FROM document_completeness
  WHERE organization_id = p_org_id;

  v_doc_score := CASE WHEN v_total_docs > 0
    THEN ROUND((v_current_docs::numeric / v_total_docs) * 100, 1)
    ELSE 100 END;

  -- Obligation evidence coverage
  SELECT COUNT(*)
  INTO v_total_obligations
  FROM consent_decree_obligations
  WHERE organization_id = p_org_id
    AND status = 'active';

  SELECT COUNT(DISTINCT oe.obligation_id)
  INTO v_evidenced_obligations
  FROM obligation_evidence oe
  JOIN consent_decree_obligations cdo ON cdo.id = oe.obligation_id
  WHERE oe.organization_id = p_org_id
    AND cdo.status = 'active'
    AND oe.verification_status IN ('verified', 'unverified');

  v_evidence_score := CASE WHEN v_total_obligations > 0
    THEN ROUND((v_evidenced_obligations::numeric / v_total_obligations) * 100, 1)
    ELSE 100 END;

  -- Weighted overall: 35% checklists, 35% documents, 30% evidence
  v_overall := ROUND(
    (v_checklist_score * 0.35) +
    (v_doc_score * 0.35) +
    (v_evidence_score * 0.30),
    1
  );

  RETURN jsonb_build_object(
    'overall_score', v_overall,
    'checklist_score', v_checklist_score,
    'checklist_total', v_total_checklist_items,
    'checklist_completed', v_completed_checklist_items,
    'document_score', v_doc_score,
    'document_total', v_total_docs,
    'document_current', v_current_docs,
    'evidence_score', v_evidence_score,
    'obligations_total', v_total_obligations,
    'obligations_evidenced', v_evidenced_obligations
  );
END;
$$;

-- ============================================================================
-- 8. Checklist template seeder (EPA Inspection template per org)
-- ============================================================================
-- Templates are created on-demand by the UI, not seeded.
-- The UI provides template presets that populate items when creating a checklist.

-- ============================================================================
-- 9. Triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION update_audit_checklist_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate checklist progress when items change
  UPDATE audit_checklists
  SET
    total_items = (SELECT COUNT(*) FROM audit_checklist_items WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id)),
    completed_items = (SELECT COUNT(*) FROM audit_checklist_items WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id) AND status IN ('complete', 'na')),
    updated_at = now()
  WHERE id = COALESCE(NEW.checklist_id, OLD.checklist_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_checklist_item_progress ON audit_checklist_items;
CREATE TRIGGER trg_checklist_item_progress
  AFTER INSERT OR UPDATE OF status OR DELETE ON audit_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_audit_checklist_progress();

CREATE OR REPLACE FUNCTION update_generic_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_checklist_updated ON audit_checklists;
CREATE TRIGGER trg_audit_checklist_updated
  BEFORE UPDATE ON audit_checklists
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

DROP TRIGGER IF EXISTS trg_checklist_item_updated ON audit_checklist_items;
CREATE TRIGGER trg_checklist_item_updated
  BEFORE UPDATE ON audit_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

DROP TRIGGER IF EXISTS trg_doc_completeness_updated ON document_completeness;
CREATE TRIGGER trg_doc_completeness_updated
  BEFORE UPDATE ON document_completeness
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

DROP TRIGGER IF EXISTS trg_obligation_evidence_updated ON obligation_evidence;
CREATE TRIGGER trg_obligation_evidence_updated
  BEFORE UPDATE ON obligation_evidence
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

DROP TRIGGER IF EXISTS trg_governance_review_updated ON governance_reviews;
CREATE TRIGGER trg_governance_review_updated
  BEFORE UPDATE ON governance_reviews
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

-- ============================================================================
-- 10. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_checklists_org_status
  ON audit_checklists (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist
  ON audit_checklist_items (checklist_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_checklist_items_assigned
  ON audit_checklist_items (assigned_to)
  WHERE status NOT IN ('complete', 'na');

CREATE INDEX IF NOT EXISTS idx_doc_completeness_permit
  ON document_completeness (permit_id);

CREATE INDEX IF NOT EXISTS idx_doc_completeness_org
  ON document_completeness (organization_id);

CREATE INDEX IF NOT EXISTS idx_obligation_evidence_obligation
  ON obligation_evidence (obligation_id);

CREATE INDEX IF NOT EXISTS idx_obligation_evidence_org
  ON obligation_evidence (organization_id);

CREATE INDEX IF NOT EXISTS idx_governance_reviews_org
  ON governance_reviews (organization_id, status);

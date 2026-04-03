-- ============================================================================
-- Phase 12 — Go-Live Validation
-- Tables: go_live_checklists, go_live_checklist_items, deployment_stages,
--         smoke_test_runs, go_live_sign_offs
-- RPC:    calculate_go_live_readiness()
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. go_live_checklists — Master readiness checklists per deployment attempt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS go_live_checklists (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  title          text NOT NULL,
  description    text,
  target_date    date,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','in_progress','blocked','ready','deployed','rolled_back')),
  total_items    int NOT NULL DEFAULT 0,
  completed_items int NOT NULL DEFAULT 0,
  readiness_score numeric(5,2) DEFAULT 0,
  deployment_version text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE go_live_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "go_live_checklists_select" ON go_live_checklists
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "go_live_checklists_insert" ON go_live_checklists
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "go_live_checklists_update" ON go_live_checklists
  FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY "go_live_checklists_delete" ON go_live_checklists
  FOR DELETE USING (organization_id = get_user_org_id());

CREATE INDEX idx_go_live_checklists_org ON go_live_checklists(organization_id);
CREATE INDEX idx_go_live_checklists_status ON go_live_checklists(status);

CREATE TRIGGER trg_go_live_checklists_updated
  BEFORE UPDATE ON go_live_checklists
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

-- ---------------------------------------------------------------------------
-- 2. go_live_checklist_items — Individual validation items per module
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS go_live_checklist_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id   uuid NOT NULL REFERENCES go_live_checklists(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  module         text NOT NULL
                   CHECK (module IN (
                     'auth','upload','compliance','field_ops','reporting',
                     'work_orders','violations','dmr','incidents','corrective_actions',
                     'audit','emergency','system_health','infrastructure','security'
                   )),
  title          text NOT NULL,
  description    text,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','passed','failed','blocked','na')),
  priority       text NOT NULL DEFAULT 'required'
                   CHECK (priority IN ('critical','required','recommended','optional')),
  assigned_to    uuid REFERENCES auth.users(id),
  evidence_notes text,
  verified_by    uuid REFERENCES auth.users(id),
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE go_live_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "go_live_checklist_items_select" ON go_live_checklist_items
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "go_live_checklist_items_insert" ON go_live_checklist_items
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "go_live_checklist_items_update" ON go_live_checklist_items
  FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY "go_live_checklist_items_delete" ON go_live_checklist_items
  FOR DELETE USING (organization_id = get_user_org_id());

CREATE INDEX idx_go_live_items_checklist ON go_live_checklist_items(checklist_id);
CREATE INDEX idx_go_live_items_status ON go_live_checklist_items(status);
CREATE INDEX idx_go_live_items_module ON go_live_checklist_items(module);

CREATE TRIGGER trg_go_live_checklist_items_updated
  BEFORE UPDATE ON go_live_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

-- Auto-update parent checklist progress
CREATE OR REPLACE FUNCTION update_go_live_checklist_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE go_live_checklists
  SET total_items = (
        SELECT count(*) FROM go_live_checklist_items
        WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id)
          AND status != 'na'
      ),
      completed_items = (
        SELECT count(*) FROM go_live_checklist_items
        WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id)
          AND status = 'passed'
      )
  WHERE id = COALESCE(NEW.checklist_id, OLD.checklist_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_go_live_item_progress
  AFTER INSERT OR UPDATE OR DELETE ON go_live_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_go_live_checklist_progress();

-- ---------------------------------------------------------------------------
-- 3. deployment_stages — Pipeline stages with sign-off tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deployment_stages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id   uuid NOT NULL REFERENCES go_live_checklists(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  stage_name     text NOT NULL
                   CHECK (stage_name IN ('dev','staging','canary','production')),
  stage_order    int NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','passed','failed','rolled_back')),
  started_at     timestamptz,
  completed_at   timestamptz,
  deployed_by    uuid REFERENCES auth.users(id),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deployment_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deployment_stages_select" ON deployment_stages
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "deployment_stages_insert" ON deployment_stages
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "deployment_stages_update" ON deployment_stages
  FOR UPDATE USING (organization_id = get_user_org_id());
CREATE POLICY "deployment_stages_delete" ON deployment_stages
  FOR DELETE USING (organization_id = get_user_org_id());

CREATE INDEX idx_deployment_stages_checklist ON deployment_stages(checklist_id);

CREATE TRIGGER trg_deployment_stages_updated
  BEFORE UPDATE ON deployment_stages
  FOR EACH ROW EXECUTE FUNCTION update_generic_timestamp();

-- ---------------------------------------------------------------------------
-- 4. smoke_test_runs — Recorded smoke test executions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smoke_test_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id   uuid NOT NULL REFERENCES go_live_checklists(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  test_name      text NOT NULL,
  module         text NOT NULL,
  test_type      text NOT NULL DEFAULT 'manual'
                   CHECK (test_type IN ('manual','automated','integration')),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','passed','failed','skipped')),
  duration_ms    int,
  error_message  text,
  run_by         uuid REFERENCES auth.users(id),
  run_at         timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE smoke_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smoke_test_runs_select" ON smoke_test_runs
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "smoke_test_runs_insert" ON smoke_test_runs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "smoke_test_runs_update" ON smoke_test_runs
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE INDEX idx_smoke_tests_checklist ON smoke_test_runs(checklist_id);
CREATE INDEX idx_smoke_tests_status ON smoke_test_runs(status);

-- ---------------------------------------------------------------------------
-- 5. go_live_sign_offs — Immutable executive sign-off records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS go_live_sign_offs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id   uuid NOT NULL REFERENCES go_live_checklists(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sign_off_type  text NOT NULL
                   CHECK (sign_off_type IN (
                     'technical','compliance','legal','executive','security','operational'
                   )),
  signed_by      uuid NOT NULL REFERENCES auth.users(id),
  signer_name    text NOT NULL,
  signer_role    text NOT NULL,
  conditions     text,
  notes          text,
  signed_at      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- IMMUTABLE — no UPDATE or DELETE policies (litigation-grade)
ALTER TABLE go_live_sign_offs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "go_live_sign_offs_select" ON go_live_sign_offs
  FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "go_live_sign_offs_insert" ON go_live_sign_offs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE INDEX idx_sign_offs_checklist ON go_live_sign_offs(checklist_id);

-- ---------------------------------------------------------------------------
-- RPC: calculate_go_live_readiness()
-- Aggregates checklist completion, smoke tests, sign-offs, system health
-- Returns a composite readiness score 0-100
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_go_live_readiness(p_checklist_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_items int;
  v_passed_items int;
  v_critical_items int;
  v_critical_passed int;
  v_total_tests int;
  v_passed_tests int;
  v_failed_tests int;
  v_sign_off_count int;
  v_required_sign_offs int := 4; -- technical, compliance, legal, executive
  v_actual_sign_off_types text[];
  v_checklist_score numeric;
  v_smoke_score numeric;
  v_sign_off_score numeric;
  v_readiness_score numeric;
  v_blockers int;
  v_stage_status text;
BEGIN
  -- Checklist items
  SELECT
    count(*) FILTER (WHERE status != 'na'),
    count(*) FILTER (WHERE status = 'passed'),
    count(*) FILTER (WHERE priority = 'critical' AND status != 'na'),
    count(*) FILTER (WHERE priority = 'critical' AND status = 'passed'),
    count(*) FILTER (WHERE status = 'blocked')
  INTO v_total_items, v_passed_items, v_critical_items, v_critical_passed, v_blockers
  FROM go_live_checklist_items
  WHERE checklist_id = p_checklist_id;

  -- Smoke tests
  SELECT
    count(*) FILTER (WHERE status != 'skipped'),
    count(*) FILTER (WHERE status = 'passed'),
    count(*) FILTER (WHERE status = 'failed')
  INTO v_total_tests, v_passed_tests, v_failed_tests
  FROM smoke_test_runs
  WHERE checklist_id = p_checklist_id;

  -- Sign-offs (unique types)
  SELECT array_agg(DISTINCT sign_off_type), count(DISTINCT sign_off_type)
  INTO v_actual_sign_off_types, v_sign_off_count
  FROM go_live_sign_offs
  WHERE checklist_id = p_checklist_id;

  -- Current deployment stage
  SELECT status INTO v_stage_status
  FROM deployment_stages
  WHERE checklist_id = p_checklist_id
  ORDER BY stage_order DESC
  LIMIT 1;

  -- Calculate component scores
  v_checklist_score := CASE WHEN v_total_items > 0
    THEN (v_passed_items::numeric / v_total_items) * 100
    ELSE 0 END;

  v_smoke_score := CASE WHEN v_total_tests > 0
    THEN (v_passed_tests::numeric / v_total_tests) * 100
    ELSE 0 END;

  v_sign_off_score := CASE WHEN v_required_sign_offs > 0
    THEN LEAST((v_sign_off_count::numeric / v_required_sign_offs) * 100, 100)
    ELSE 0 END;

  -- Weighted readiness: 40% checklist, 30% smoke tests, 30% sign-offs
  v_readiness_score := (v_checklist_score * 0.40) +
                       (v_smoke_score * 0.30) +
                       (v_sign_off_score * 0.30);

  -- Update the checklist record
  UPDATE go_live_checklists
  SET readiness_score = v_readiness_score
  WHERE id = p_checklist_id;

  RETURN jsonb_build_object(
    'readiness_score', round(v_readiness_score, 1),
    'checklist_score', round(v_checklist_score, 1),
    'smoke_test_score', round(v_smoke_score, 1),
    'sign_off_score', round(v_sign_off_score, 1),
    'total_items', v_total_items,
    'passed_items', v_passed_items,
    'critical_items', v_critical_items,
    'critical_passed', v_critical_passed,
    'blockers', v_blockers,
    'total_tests', v_total_tests,
    'passed_tests', v_passed_tests,
    'failed_tests', v_failed_tests,
    'sign_offs_obtained', COALESCE(v_actual_sign_off_types, ARRAY[]::text[]),
    'sign_offs_required', v_required_sign_offs,
    'sign_off_count', COALESCE(v_sign_off_count, 0),
    'current_stage', COALESCE(v_stage_status, 'none'),
    'is_go', v_readiness_score >= 95
               AND v_critical_items = v_critical_passed
               AND v_failed_tests = 0
               AND v_blockers = 0
  );
END;
$$;

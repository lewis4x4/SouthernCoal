-- =============================================================================
-- v3.0 Governance Features — SQL Prerequisites
-- =============================================================================
-- Run this ENTIRE file in Supabase SQL Editor before using the new UI features.
-- Creates: data_corrections table, roadmap_tasks table, RLS policies, indexes,
-- and a SECURITY DEFINER function for RBAC verification.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. AUDIT LOG INDEX (for Change Log UI — Phase 1)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_query
  ON audit_log(created_at DESC, module, action);

-- ---------------------------------------------------------------------------
-- 2. USER PROFILES — ORG-SCOPED SELECT (for Access Control — Phase 2)
-- Current policy only lets users see their own profile.
-- Replace with org-scoped so admin can see all org members.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can read org member profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can view org profiles" ON user_profiles;

CREATE POLICY "Users can view org profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

-- ---------------------------------------------------------------------------
-- 3. USER PROFILES — ADMIN UPDATE (for role changes + deactivation)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin can update org user profiles" ON user_profiles;

CREATE POLICY "Admin can update org user profiles"
  ON user_profiles FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.name IN ('admin', 'executive')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. ROLE ASSIGNMENTS — ADMIN CRUD (for Access Control user management)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin can insert role assignments" ON user_role_assignments;
DROP POLICY IF EXISTS "Admin can update role assignments" ON user_role_assignments;
DROP POLICY IF EXISTS "Admin can delete role assignments" ON user_role_assignments;

CREATE POLICY "Admin can insert role assignments"
  ON user_role_assignments FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM user_profiles WHERE organization_id = get_user_org_id())
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.name IN ('admin', 'executive')
    )
  );

CREATE POLICY "Admin can update role assignments"
  ON user_role_assignments FOR UPDATE TO authenticated
  USING (
    user_id IN (SELECT id FROM user_profiles WHERE organization_id = get_user_org_id())
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.name IN ('admin', 'executive')
    )
  );

CREATE POLICY "Admin can delete role assignments"
  ON user_role_assignments FOR DELETE TO authenticated
  USING (
    user_id IN (SELECT id FROM user_profiles WHERE organization_id = get_user_org_id())
    AND EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.name IN ('admin', 'executive')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RBAC DIAGNOSTIC FUNCTION (read-only, for verification panel)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_rls_policy_summary()
RETURNS TABLE(tbl_name text, policy_count bigint) AS $$
  SELECT tablename::text, COUNT(*)::bigint
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
  ORDER BY tablename;
$$ LANGUAGE sql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. DATA CORRECTIONS TABLE (for Data Correction Workflow — Phase 3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lab_result', 'permit_limit', 'dmr_line_item', 'exceedance')),
  entity_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  original_value JSONB NOT NULL,
  proposed_value JSONB NOT NULL,
  justification TEXT NOT NULL,
  supporting_evidence_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected')),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  review_comment TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE data_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org corrections"
  ON data_corrections FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Authorized users create corrections"
  ON data_corrections FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND requested_by = auth.uid()
  );

-- TWO-PERSON RULE: reviewer cannot be the requester
CREATE POLICY "Reviewer can approve or reject corrections"
  ON data_corrections FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND requested_by != auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_data_corrections_status
  ON data_corrections(status, organization_id);
CREATE INDEX IF NOT EXISTS idx_data_corrections_entity
  ON data_corrections(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 7. ROADMAP TASKS TABLE (for Implementation Roadmap — Phase 5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roadmap_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  task_id TEXT NOT NULL,
  phase INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 5),
  section TEXT NOT NULL,
  task_description TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('you', 'tom', 'scc_mgmt', 'both', 'legal', 'software')),
  assigned_to UUID REFERENCES auth.users(id),
  depends_on TEXT[],
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'complete', 'na')),
  evidence_paths TEXT[],
  notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  is_new_v3 BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE roadmap_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org roadmap tasks"
  ON roadmap_tasks FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Authorized users manage roadmap tasks"
  ON roadmap_tasks FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Authorized users insert roadmap tasks"
  ON roadmap_tasks FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE UNIQUE INDEX IF NOT EXISTS idx_roadmap_tasks_task_id
  ON roadmap_tasks(organization_id, task_id);

-- ---------------------------------------------------------------------------
-- VERIFICATION: Run after applying to confirm everything was created
-- ---------------------------------------------------------------------------
-- SELECT 'audit_log index' AS check_item, COUNT(*) FROM pg_indexes WHERE indexname = 'idx_audit_log_query';
-- SELECT 'data_corrections' AS check_item, COUNT(*) FROM information_schema.tables WHERE table_name = 'data_corrections';
-- SELECT 'roadmap_tasks' AS check_item, COUNT(*) FROM information_schema.tables WHERE table_name = 'roadmap_tasks';
-- SELECT 'rls_policy_summary function' AS check_item, COUNT(*) FROM pg_proc WHERE proname = 'get_rls_policy_summary';

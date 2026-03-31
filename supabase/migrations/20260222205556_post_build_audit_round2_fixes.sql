-- =============================================================================
-- Post-Build Audit Round 2 Fixes
-- =============================================================================
-- P0: Drop execute_readonly_query (SQL injection + RLS bypass vector)
-- P0: Create missing report_templates table with RLS
-- P1: Add FK on report_role_permissions.role_name → roles.name
-- P1: Grant safety_manager report permissions
-- P1: Add missing indexes on scheduled_reports, generated_reports
-- P1: Fix audit_log INSERT policy (cross-org injection)
-- =============================================================================

-- =============================================================================
-- P0: Drop execute_readonly_query — accepts arbitrary SQL via SECURITY DEFINER,
-- bypasses RLS. String-replace parameter binding is bypassable. No auth check.
-- =============================================================================
DROP FUNCTION IF EXISTS public.execute_readonly_query(text, jsonb);

-- =============================================================================
-- P0: Create missing report_templates table
-- (increment_template_run_count references this but it doesn't exist)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_definition_id uuid NOT NULL REFERENCES report_definitions(id),
  name text NOT NULL,
  description text,
  report_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES user_profiles(id),
  run_count integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org report templates"
  ON public.report_templates FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert own org report templates"
  ON public.report_templates FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org report templates"
  ON public.report_templates FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can delete own org report templates"
  ON public.report_templates FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

CREATE INDEX IF NOT EXISTS idx_report_templates_org_id
  ON public.report_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_report_templates_report_def
  ON public.report_templates(report_definition_id);

-- =============================================================================
-- P1: Add UNIQUE constraint on roles.name, then FK from report_role_permissions
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roles_name_unique'
  ) THEN
    ALTER TABLE public.roles ADD CONSTRAINT roles_name_unique UNIQUE (name);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_role_permissions_role_name_fkey'
  ) THEN
    ALTER TABLE public.report_role_permissions
      ADD CONSTRAINT report_role_permissions_role_name_fkey
      FOREIGN KEY (role_name) REFERENCES roles(name) ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- P1: Grant safety_manager access to safety-relevant reports
-- =============================================================================
INSERT INTO public.report_role_permissions (report_definition_id, role_name)
SELECT rd.id, 'safety_manager'
FROM report_definitions rd
WHERE rd.report_key IN (
  'inspection_prep_package',
  'outfall_inventory',
  'permit_limit_parameter_matrix',
  'consent_decree_obligations',
  'fts_violation_report',
  'permit_inventory',
  'regulatory_deadline_tracker'
)
ON CONFLICT (report_definition_id, role_name) DO NOTHING;

-- =============================================================================
-- P1: Missing indexes on scheduled_reports and generated_reports
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_org_id
  ON public.scheduled_reports(organization_id);

CREATE INDEX IF NOT EXISTS idx_generated_reports_created_at
  ON public.generated_reports(created_at DESC);

-- =============================================================================
-- P1: Fix audit_log INSERT policy — scope to own org + own user_id
-- =============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert audit log" ON public.audit_log;

CREATE POLICY "Authenticated users can insert own org audit log"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND user_id = auth.uid()
  );;

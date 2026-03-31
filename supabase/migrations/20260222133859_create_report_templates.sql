CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  reports JSONB NOT NULL DEFAULT '[]',
  -- reports = [{ report_key, config: { states, date_from, date_to, ... }, format, delivery }]
  last_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Indexes
CREATE INDEX idx_report_templates_org ON report_templates(organization_id);
CREATE INDEX idx_report_templates_created_by ON report_templates(created_by);
-- RLS
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
-- Users see own templates + shared templates in their org
CREATE POLICY "Users can view own and shared templates"
  ON report_templates FOR SELECT
  USING (
    organization_id = get_user_org_id()
    AND (created_by = auth.uid() OR is_shared = true)
  );
-- Users can create templates
CREATE POLICY "Authenticated users can create templates"
  ON report_templates FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND created_by = auth.uid()
  );
-- Users can update own templates; admins can update any in their org
CREATE POLICY "Users can update own templates"
  ON report_templates FOR UPDATE
  USING (
    organization_id = get_user_org_id()
    AND (created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.name = 'admin'
    ))
  );
-- Users can delete own templates; admins can delete any
CREATE POLICY "Users can delete own templates"
  ON report_templates FOR DELETE
  USING (
    organization_id = get_user_org_id()
    AND (created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.name = 'admin'
    ))
  );

-- =============================================================================
-- Migration 002: Create corrective_actions table
-- =============================================================================
-- Implements EMS Document 2015-013 Corrective Action Process
-- 7-step workflow with digital signatures and PDF generation
-- =============================================================================

CREATE TABLE corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- =========================================================================
  -- ORGANIZATION SCOPING (required for RLS)
  -- =========================================================================
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- =========================================================================
  -- LOCATION DETAIL (Document 2015-013 Section 1)
  -- =========================================================================
  site_id uuid REFERENCES sites(id),
  npdes_permit_id uuid REFERENCES npdes_permits(id),
  smcra_permit_number text,
  county text,
  state text,

  -- =========================================================================
  -- SOURCE REFERENCES (what triggered this CA)
  -- =========================================================================
  source_type text NOT NULL CHECK (source_type IN (
    'exceedance',
    'enforcement',
    'audit',
    'inspection',
    'manual'
  )),
  source_id uuid,  -- Polymorphic: exceedance.id or enforcement_action.id
  title text NOT NULL,

  -- =========================================================================
  -- INCIDENT DETAIL (Document 2015-013 Section 2)
  -- =========================================================================
  description text,
  date_issued date,
  date_received date,
  issuing_person text,
  issuing_agency text,
  issued_to text,
  regulation_cited text,

  -- =========================================================================
  -- INCIDENT FOLLOW-UP (Document 2015-013 Sections 3-7)
  -- =========================================================================
  followup_assigned_to uuid REFERENCES user_profiles(id),
  contributing_factors text,
  root_cause text,
  immediate_mitigation text,
  action_taken text,
  preventive_action text,
  documents_requiring_revision text,
  effectiveness_assessment text,
  notes text,

  -- =========================================================================
  -- WORKFLOW (EMS 7-Step Process)
  -- =========================================================================
  workflow_step text NOT NULL DEFAULT 'identification' CHECK (workflow_step IN (
    'identification',
    'root_cause_analysis',
    'corrective_action_plan',
    'preventive_action',
    'implementation',
    'verification',
    'closure'
  )),
  workflow_step_due_date date,
  workflow_step_completed_at timestamptz,

  -- =========================================================================
  -- STATUS & PRIORITY
  -- =========================================================================
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'in_progress',
    'completed',
    'verified',
    'closed'
  )),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'low',
    'medium',
    'high',
    'critical'
  )),
  due_date date,
  completed_date date,

  -- =========================================================================
  -- DIGITAL SIGNATURES
  -- =========================================================================
  responsible_person_id uuid REFERENCES user_profiles(id),
  responsible_person_signed_at timestamptz,
  approved_by_id uuid REFERENCES user_profiles(id),
  approved_by_signed_at timestamptz,

  -- =========================================================================
  -- VERIFICATION
  -- =========================================================================
  verified_by uuid REFERENCES user_profiles(id),
  verified_date date,

  -- =========================================================================
  -- PDF GENERATION
  -- =========================================================================
  generated_pdf_path text,
  generated_pdf_at timestamptz,
  document_id uuid REFERENCES documents(id),

  -- =========================================================================
  -- CLOSURE
  -- =========================================================================
  closed_date date,
  closed_by uuid REFERENCES user_profiles(id),

  -- =========================================================================
  -- AUDIT FIELDS
  -- =========================================================================
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE corrective_actions ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- INDEXES
-- =========================================================================

-- Primary query index (org-scoped list views)
CREATE INDEX idx_corrective_actions_org
  ON corrective_actions(organization_id);

-- Status filtering
CREATE INDEX idx_corrective_actions_status
  ON corrective_actions(status);

-- Workflow step filtering
CREATE INDEX idx_corrective_actions_workflow
  ON corrective_actions(workflow_step);

-- Source lookups (for finding CA from exceedance/enforcement)
CREATE INDEX idx_corrective_actions_source
  ON corrective_actions(source_type, source_id);

-- Assigned user filtering
CREATE INDEX idx_corrective_actions_assigned
  ON corrective_actions(followup_assigned_to)
  WHERE status NOT IN ('closed', 'verified');

-- Due date for overdue queries
CREATE INDEX idx_corrective_actions_due
  ON corrective_actions(due_date)
  WHERE status NOT IN ('closed', 'verified');

-- Site/permit lookups
CREATE INDEX idx_corrective_actions_site
  ON corrective_actions(site_id);

CREATE INDEX idx_corrective_actions_permit
  ON corrective_actions(npdes_permit_id);

-- =========================================================================
-- UPDATED_AT TRIGGER
-- =========================================================================
CREATE OR REPLACE FUNCTION update_corrective_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_corrective_actions_updated_at
  BEFORE UPDATE ON corrective_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_corrective_actions_updated_at();

-- =========================================================================
-- DOCUMENTATION
-- =========================================================================
COMMENT ON TABLE corrective_actions IS
  'EMS Document 2015-013 Corrective Action tracking. Auto-created from exceedances and enforcement actions. 7-step workflow with digital signatures.';

COMMENT ON COLUMN corrective_actions.workflow_step IS
  'Current step in EMS 7-step workflow: identification → root_cause_analysis → corrective_action_plan → preventive_action → implementation → verification → closure';

COMMENT ON COLUMN corrective_actions.source_type IS
  'What triggered this CA: exceedance (permit limit violation), enforcement (NOV/CO), audit, inspection, or manual entry';

-- =========================================================================
-- VERIFICATION QUERIES
-- =========================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'corrective_actions' ORDER BY ordinal_position;
-- SELECT indexname FROM pg_indexes WHERE tablename = 'corrective_actions';

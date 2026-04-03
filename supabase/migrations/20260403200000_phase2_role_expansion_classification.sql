-- Phase 2: Role System Expansion & Record Classification
-- 1. Seed 9 new roles into roles table (idempotent)
-- 2. Add classification_level column to core compliance tables
-- 3. Auto-classification rule: decree paragraphs → compliance_sensitive minimum

-- ============================================================================
-- 1. Seed new roles (ON CONFLICT DO NOTHING for idempotency)
-- ============================================================================
INSERT INTO roles (name) VALUES
  ('wv_supervisor'),
  ('float_sampler'),
  ('courier'),
  ('compliance_reviewer'),
  ('coo'),
  ('ceo_view'),
  ('chief_counsel'),
  ('maintenance_owner'),
  ('lab_liaison')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. Add classification_level to compliance tables
-- ============================================================================
DO $$
BEGIN
  -- Create the enum type for classification
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'record_classification') THEN
    CREATE TYPE record_classification AS ENUM (
      'operational_internal',
      'compliance_sensitive',
      'privileged',
      'public_eligible',
      'regulator_shareable',
      'restricted'
    );
  END IF;
END $$;

-- field_visits
ALTER TABLE field_visits
  ADD COLUMN IF NOT EXISTS classification_level record_classification
    NOT NULL DEFAULT 'operational_internal';

COMMENT ON COLUMN field_visits.classification_level IS
  'Phase 2 record classification. Auto-set by trigger or RPC.';

-- governance_issues
ALTER TABLE governance_issues
  ADD COLUMN IF NOT EXISTS classification_level record_classification
    NOT NULL DEFAULT 'compliance_sensitive';

COMMENT ON COLUMN governance_issues.classification_level IS
  'Phase 2 record classification. Governance issues default to compliance_sensitive.';

-- corrective_actions
ALTER TABLE corrective_actions
  ADD COLUMN IF NOT EXISTS classification_level record_classification
    NOT NULL DEFAULT 'compliance_sensitive';

COMMENT ON COLUMN corrective_actions.classification_level IS
  'Phase 2 record classification. CAs default to compliance_sensitive.';

-- exceedances
ALTER TABLE exceedances
  ADD COLUMN IF NOT EXISTS classification_level record_classification
    NOT NULL DEFAULT 'compliance_sensitive';

COMMENT ON COLUMN exceedances.classification_level IS
  'Phase 2 record classification. Exceedances default to compliance_sensitive.';

-- Indexes for classification filtering
CREATE INDEX IF NOT EXISTS idx_field_visits_classification
  ON field_visits (classification_level);
CREATE INDEX IF NOT EXISTS idx_governance_issues_classification
  ON governance_issues (classification_level);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_classification
  ON corrective_actions (classification_level);
CREATE INDEX IF NOT EXISTS idx_exceedances_classification
  ON exceedances (classification_level);

-- ============================================================================
-- 3. Auto-classification trigger for governance_issues
-- If decree_paragraphs is non-empty, floor is compliance_sensitive.
-- If issue contains "privileged" or "counsel" keywords, elevate to privileged.
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_classify_governance_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Default floor: if decree paragraphs present, at least compliance_sensitive
  IF NEW.decree_paragraphs IS NOT NULL AND array_length(NEW.decree_paragraphs, 1) > 0 THEN
    IF NEW.classification_level = 'operational_internal' THEN
      NEW.classification_level := 'compliance_sensitive';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_classify_governance_issue ON governance_issues;
CREATE TRIGGER trg_auto_classify_governance_issue
  BEFORE INSERT OR UPDATE ON governance_issues
  FOR EACH ROW
  EXECUTE FUNCTION auto_classify_governance_issue();

COMMENT ON FUNCTION auto_classify_governance_issue IS
  'Phase 2 auto-classification: decree_paragraphs present → compliance_sensitive floor.';

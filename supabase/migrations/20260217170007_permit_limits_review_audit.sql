-- =============================================================================
-- Migration 007: Add audit trigger for permit_limits review_status changes
-- =============================================================================
-- COMPLIANCE REQUIREMENT: Per CLAUDE.md, every data edit MUST have an immutable
-- audit trail. This is litigation-grade software under federal Consent Decree oversight.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Function: Log permit_limits review status changes to audit_log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_permit_limit_review_change()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  -- Get organization_id via outfall → site chain
  SELECT s.organization_id INTO v_org_id
  FROM outfalls o
  JOIN sites s ON s.id = o.site_id
  WHERE o.id = NEW.outfall_id;

  -- Get the user making the change (from NEW.reviewed_by or session user)
  v_user_id := COALESCE(NEW.reviewed_by, auth.uid());

  -- Log the review status change
  INSERT INTO audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    v_user_id,
    v_org_id,
    CASE
      WHEN OLD.review_status IS NULL THEN 'permit_limit_review_created'
      WHEN NEW.review_status = 'verified' THEN 'permit_limit_verified'
      WHEN NEW.review_status = 'disputed' THEN 'permit_limit_disputed'
      WHEN NEW.review_status = 'in_review' THEN 'permit_limit_review_started'
      ELSE 'permit_limit_review_updated'
    END,
    'compliance',
    'permit_limits',
    NEW.id,
    jsonb_build_object(
      'review_status', OLD.review_status,
      'reviewed_by', OLD.reviewed_by,
      'reviewed_at', OLD.reviewed_at,
      'review_notes', OLD.review_notes
    ),
    jsonb_build_object(
      'review_status', NEW.review_status,
      'reviewed_by', NEW.reviewed_by,
      'reviewed_at', NEW.reviewed_at,
      'review_notes', NEW.review_notes,
      'extraction_confidence', NEW.extraction_confidence,
      'extraction_source', NEW.extraction_source
    ),
    now()
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block the update (fail-safe)
    RAISE WARNING 'Failed to log permit_limit review change: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- Trigger: Fire on review_status, reviewed_by, or reviewed_at changes
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_permit_limits_review ON permit_limits;

CREATE TRIGGER trg_audit_permit_limits_review
  AFTER UPDATE OF review_status, reviewed_by, reviewed_at ON permit_limits
  FOR EACH ROW
  WHEN (
    OLD.review_status IS DISTINCT FROM NEW.review_status
    OR OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by
    OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
  )
  EXECUTE FUNCTION log_permit_limit_review_change();

-- ---------------------------------------------------------------------------
-- Also log when extraction metadata is first populated (initial import)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_permit_limits_extraction ON permit_limits;

CREATE TRIGGER trg_audit_permit_limits_extraction
  AFTER INSERT ON permit_limits
  FOR EACH ROW
  WHEN (NEW.extraction_source IS NOT NULL)
  EXECUTE FUNCTION log_permit_limit_review_change();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION log_permit_limit_review_change() IS
  'Audit trail for permit limit verification workflow. Logs all review status transitions.';

COMMENT ON TRIGGER trg_audit_permit_limits_review ON permit_limits IS
  'Fires when review_status, reviewed_by, or reviewed_at changes. Required for compliance.';

COMMENT ON TRIGGER trg_audit_permit_limits_extraction ON permit_limits IS
  'Fires on INSERT when AI extraction source is set. Records initial import for audit trail.';

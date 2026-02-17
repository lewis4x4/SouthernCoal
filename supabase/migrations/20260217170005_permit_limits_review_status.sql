-- =============================================================================
-- Migration 005: Add review status columns to permit_limits
-- =============================================================================
-- Implements AI extraction trust layer for imported limits
-- All AI-extracted limits start as 'pending_review' until human verification
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Add review_status column with check constraint
-- ---------------------------------------------------------------------------
ALTER TABLE permit_limits
ADD COLUMN IF NOT EXISTS review_status text
  DEFAULT 'pending_review'
  CHECK (review_status IN ('pending_review', 'in_review', 'verified', 'disputed'));

-- ---------------------------------------------------------------------------
-- Add verification tracking columns
-- ---------------------------------------------------------------------------
ALTER TABLE permit_limits
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES user_profiles(id);

ALTER TABLE permit_limits
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE permit_limits
ADD COLUMN IF NOT EXISTS review_notes text;

-- ---------------------------------------------------------------------------
-- Add extraction metadata columns
-- ---------------------------------------------------------------------------
ALTER TABLE permit_limits
ADD COLUMN IF NOT EXISTS extraction_confidence numeric
  CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1);

ALTER TABLE permit_limits
ADD COLUMN IF NOT EXISTS extraction_source text
  CHECK (extraction_source IN ('ai_excel', 'ai_pdf', 'manual', 'netdmr', 'osmre'));

ALTER TABLE permit_limits
ADD COLUMN IF NOT EXISTS import_batch_id uuid;

-- ---------------------------------------------------------------------------
-- Index for filtering unreviewed limits (dashboard queries)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_permit_limits_review_status
  ON permit_limits(review_status)
  WHERE review_status != 'verified';

-- ---------------------------------------------------------------------------
-- Index for import batch rollback
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_permit_limits_import_batch
  ON permit_limits(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN permit_limits.review_status IS
  'AI extraction trust layer: pending_review (unreviewed), in_review (opened), verified (confirmed), disputed (flagged errors)';

COMMENT ON COLUMN permit_limits.extraction_confidence IS
  'AI confidence score 0-1 for extracted limit value. NULL for manual entries.';

COMMENT ON COLUMN permit_limits.extraction_source IS
  'Source of limit data: ai_excel (parameter sheet), ai_pdf (permit PDF), manual, netdmr (KY), osmre (TN)';

COMMENT ON COLUMN permit_limits.import_batch_id IS
  'References data_imports.id for rollback support. All limits from same import share this ID.';

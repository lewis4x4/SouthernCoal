-- =============================================================================
-- Add Handoff Processor Columns to roadmap_tasks
-- =============================================================================
-- These columns support the Intelligent Handoff Processor feature:
-- - answer_data: Structured answer data extracted from handoffs
-- - evidence_source: Evidence trail with source attribution
-- - unblocks: Inverse of depends_on (tasks this one unblocks)
-- - updated_by: Track who last updated the task
-- =============================================================================

-- Structured answer data from handoff processing
-- Format: { "task_number": { "answer": "...", "source_handoff": "HO-...", "timestamp": "..." } }
ALTER TABLE roadmap_tasks ADD COLUMN IF NOT EXISTS answer_data JSONB DEFAULT '{}';

-- Evidence trail: source attribution for each answer
-- Format: { "task_number": { "quote": "...", "source_type": "email", "source_from": "Tom", "handoff_id": "HO-..." } }
ALTER TABLE roadmap_tasks ADD COLUMN IF NOT EXISTS evidence_source JSONB DEFAULT '{}';

-- Tasks that this task unblocks (inverse of depends_on)
-- When this task completes, these tasks can potentially proceed
ALTER TABLE roadmap_tasks ADD COLUMN IF NOT EXISTS unblocks TEXT[] DEFAULT '{}';

-- Track who last updated this task (for audit trail)
ALTER TABLE roadmap_tasks ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Create index for finding tasks by their unblocks relationships
CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_unblocks ON roadmap_tasks USING GIN (unblocks);

-- Update trigger for updated_at (should already exist, but ensure it's there)
DROP TRIGGER IF EXISTS roadmap_tasks_updated ON roadmap_tasks;
CREATE TRIGGER roadmap_tasks_updated
  BEFORE UPDATE ON roadmap_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Verification Query (run manually to confirm)
-- =============================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'roadmap_tasks'
-- AND column_name IN ('answer_data', 'evidence_source', 'unblocks', 'updated_by');
-- Expected: 4 rows

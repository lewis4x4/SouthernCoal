-- =============================================================================
-- Fix handoff_history Table — Add Missing Columns
-- =============================================================================
-- Adds columns for proper handoff tracking per remediation spec:
-- - handoff_id: Human-readable ID (HO-2026-02-17-001 format)
-- - proposed_updates: What AI proposed (before human review)
-- - approved_updates: What user approved
-- - rejected_updates: What user rejected
-- - source_from: Who sent the handoff (e.g., "Tom", "Email from Jay")
-- - source_reference: Reference ID (email subject, file name, etc.)
-- - tasks_updated: Task numbers that were actually updated
-- - ai_extraction: Full AI response for debugging
-- =============================================================================

-- Human-readable handoff ID (HO-YYYY-MM-DD-NNN format)
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS handoff_id TEXT;

-- Separate tracking of what was proposed vs approved vs rejected
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS proposed_updates JSONB DEFAULT '[]';
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS approved_updates JSONB DEFAULT '[]';
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS rejected_updates JSONB DEFAULT '[]';

-- Source metadata (who sent it, reference ID)
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS source_from TEXT;
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS source_reference TEXT;

-- Tasks that were actually updated (by task_number, not UUID)
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS tasks_updated TEXT[] DEFAULT '{}';

-- Full AI extraction response for debugging
ALTER TABLE handoff_history ADD COLUMN IF NOT EXISTS ai_extraction JSONB;

-- Generate handoff_id for existing records that don't have one
-- Format: HO-YYYY-MM-DD-NNN where NNN is sequence within that day
-- Using CTE because window functions aren't allowed directly in UPDATE
WITH numbered AS (
  SELECT id, 'HO-' || to_char(created_at, 'YYYY-MM-DD') || '-' ||
    LPAD((ROW_NUMBER() OVER (PARTITION BY date_trunc('day', created_at) ORDER BY created_at))::text, 3, '0') AS new_id
  FROM handoff_history
  WHERE handoff_id IS NULL
)
UPDATE handoff_history h SET handoff_id = n.new_id FROM numbered n WHERE h.id = n.id;

-- Create index for querying by handoff_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_handoff_history_handoff_id
  ON handoff_history(handoff_id)
  WHERE handoff_id IS NOT NULL;

-- =============================================================================
-- Update RLS to org-scoped (replacing user-scoped policies)
-- =============================================================================

-- Drop existing user-scoped policies
DROP POLICY IF EXISTS "Users view own handoffs" ON handoff_history;
DROP POLICY IF EXISTS "Users insert own handoffs" ON handoff_history;
DROP POLICY IF EXISTS "Users update own pending handoffs" ON handoff_history;

-- Create org-scoped policies
CREATE POLICY "Org-scoped read" ON handoff_history
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Org-scoped insert" ON handoff_history
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = get_user_org_id()
  );

CREATE POLICY "Org-scoped update" ON handoff_history
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id());

-- =============================================================================
-- Verification Query (run manually to confirm)
-- =============================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'handoff_history'
-- AND column_name IN ('handoff_id', 'proposed_updates', 'approved_updates', 'rejected_updates', 'source_from', 'source_reference', 'tasks_updated', 'ai_extraction');
-- Expected: 8 rows

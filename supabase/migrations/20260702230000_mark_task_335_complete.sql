-- Mark task 3.35 complete (Slice 3 — 149/149 per-permit ECHO detect).
-- Prod updated 2026-07-02 via MCP; this migration keeps repo ledger idempotent.

UPDATE roadmap_tasks
SET
  status = 'complete',
  completed_at = COALESCE(completed_at, now()),
  notes = CASE
    WHEN notes IS NULL OR notes = '' THEN 'Slice 3 — 149/149 per-permit detect complete 2026-07-02.'
    WHEN notes NOT LIKE '%149/149%'
      THEN notes || ' Slice 3 — 149/149 per-permit detect complete 2026-07-02.'
    ELSE notes
  END
WHERE organization_id = '2bffc35c-e2c4-4396-868f-207f80e1e2c4'
  AND task_id = '3.35'
  AND status <> 'complete';

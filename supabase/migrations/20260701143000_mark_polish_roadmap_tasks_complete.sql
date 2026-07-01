-- Mark shipped polish + validation tasks complete (idempotent).

UPDATE roadmap_tasks
SET
  status = 'complete',
  completed_at = COALESCE(completed_at, now()),
  notes = CASE
    WHEN notes IS NULL OR notes = '' THEN 'Shipped in main — auto-closed 2026-07-01 (polish/validation).'
    WHEN notes NOT LIKE '%auto-closed 2026-07-01 (polish/validation)%'
      THEN notes || ' Shipped in main — auto-closed 2026-07-01 (polish/validation).'
    ELSE notes
  END
WHERE organization_id = '2bffc35c-e2c4-4396-868f-207f80e1e2c4'
  AND task_id IN (
    '2.64',
    '3.03',
    '3.43',
    '3.44',
    '3.45',
    '3.46',
    '3.47'
  )
  AND status <> 'complete';

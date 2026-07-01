-- Mark shipped platform modules + ECHO/MSHA/DMR pipeline tasks complete (idempotent).

UPDATE roadmap_tasks
SET
  status = 'complete',
  completed_at = COALESCE(completed_at, now()),
  notes = CASE
    WHEN notes IS NULL OR notes = '' THEN 'Shipped in main — auto-closed 2026-07-01 (platform).'
    WHEN notes NOT LIKE '%auto-closed 2026-07-01 (platform)%'
      THEN notes || ' Shipped in main — auto-closed 2026-07-01 (platform).'
    ELSE notes
  END
WHERE organization_id = '2bffc35c-e2c4-4396-868f-207f80e1e2c4'
  AND task_id IN (
    '3.12',
    '3.13',
    '3.19',
    '3.20',
    '3.21',
    '3.32',
    '3.33',
    '3.34',
    '3.39',
    '3.40',
    '3.41',
    '3.42',
    '3.49',
    '3.50',
    '3.51',
    '3.52',
    '5.14',
    '5.16'
  )
  AND status <> 'complete';

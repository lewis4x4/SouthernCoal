-- Mark shipped Lane B / 2H tasks complete (idempotent — skips already-complete rows).
-- Tables 2.62/2.63 exist since 20260217; Upload Dashboard, ECHO panel, parsers shipped 2026 H1.

UPDATE roadmap_tasks
SET
  status = 'complete',
  completed_at = COALESCE(completed_at, now()),
  notes = CASE
    WHEN notes IS NULL OR notes = '' THEN 'Shipped in main — auto-closed 2026-07-01.'
    WHEN notes NOT LIKE '%auto-closed 2026-07-01%' THEN notes || ' Shipped in main — auto-closed 2026-07-01.'
    ELSE notes
  END
WHERE organization_id = '2bffc35c-e2c4-4396-868f-207f80e1e2c4'
  AND task_id IN (
    '2.62',
    '2.63',
    '3.01',
    '3.02',
    '3.06',
    '3.07',
    '3.08',
    '3.27',
    '3.37',
    '3.38'
  )
  AND status <> 'complete';

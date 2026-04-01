-- =============================================================================
-- Roadmap extension: 2H + 3D + 3E + 5C (27 tasks for SCC org)
-- =============================================================================
-- Brings fresh environments to 207 roadmap_tasks rows (180 from v3 seed + 27).
-- Idempotent: existing production rows (e.g. 3.49–3.52 complete) are unchanged.
-- =============================================================================

INSERT INTO roadmap_tasks (
  organization_id,
  task_id,
  phase,
  section,
  task_description,
  owner_type,
  depends_on,
  status,
  is_new_v3,
  notes
)
VALUES
  -- 2H — Database prep (3)
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '2.62',
    2,
    '2H',
    'Build parameter_aliases table — maps parameter name variations to STORET codes',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '2.63',
    2,
    '2H',
    'Build outfall_aliases table — maps outfall naming conventions across states',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '2.64',
    2,
    '2H',
    'Validate STORET code seed data against real lab/DMR data',
    'you',
    ARRAY['2.62'],
    'not_started',
    false,
    NULL
  ),

  -- 3D — External data pipeline (15)
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.32',
    3,
    '3D',
    'Justice EDD parser Edge Function',
    'you',
    ARRAY['1.24', '2.62', '2.63'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.33',
    3,
    '3D',
    'DMR submission pipeline (dmr_submissions + dmr_line_items)',
    'you',
    ARRAY['3.32', '1.29'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.34',
    3,
    '3D',
    'Wire parsers into Upload Dashboard flow',
    'you',
    ARRAY['3.01', '3.32'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.35',
    3,
    '3D',
    'Full discrepancy detection re-run (all 3 rules with real data)',
    'you',
    ARRAY['3.32', '3.33'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.36',
    3,
    '3D',
    'Triage initial discrepancies through Review Queue',
    'both',
    ARRAY['3.35'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.37',
    3,
    '3D',
    'ECHO sync coverage panel',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.38',
    3,
    '3D',
    'Manual VA NPDES ID override flow (DMLR → NPDES mapping)',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.39',
    3,
    '3D',
    'Obtain MSHA mine ID mapping',
    'you',
    NULL,
    'not_started',
    false,
    'BLOCKED on management / external MSHA mine ID mapping'
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.40',
    3,
    '3D',
    'Implement sync-msha-data pipeline',
    'you',
    ARRAY['3.39'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.41',
    3,
    '3D',
    'MSHA detection rules (Rules 4-6)',
    'you',
    ARRAY['3.40'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.42',
    3,
    '3D',
    'MSHA frontend integration',
    'you',
    ARRAY['3.40'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.49',
    3,
    '3D',
    'ECHO sync pipeline (sync-echo-data + detect-discrepancies Edge Functions)',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.50',
    3,
    '3D',
    'Full ECHO sync: permits, DMRs, discrepancy detection at scale',
    'you',
    ARRAY['3.49'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.51',
    3,
    '3D',
    'Layer 2 code audit fixes (P0/P1/P2) deployed',
    'you',
    ARRAY['3.50'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.52',
    3,
    '3D',
    'ECHO sync coverage CSV export',
    'you',
    ARRAY['3.50'],
    'not_started',
    false,
    NULL
  ),

  -- 3E — Pipeline hardening (6)
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.43',
    3,
    '3E',
    'DiscrepancyTable virtualization (@tanstack/react-virtual)',
    'you',
    ARRAY['3.35'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.44',
    3,
    '3E',
    'reviewed_by tracking on discrepancy actions',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.45',
    3,
    '3E',
    'Split loading states in useExternalData',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.46',
    3,
    '3E',
    'RBAC on sync/resolve action buttons',
    'you',
    ARRAY['3.01'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.47',
    3,
    '3E',
    'Realtime subscription for sync_log changes',
    'you',
    NULL,
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '3.48',
    3,
    '3E',
    'MSHA dedup index',
    'you',
    ARRAY['3.40'],
    'not_started',
    false,
    NULL
  ),

  -- 5C — Automated sync & monitoring (3)
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '5.14',
    5,
    '5C',
    'Cron-based ECHO sync (weekly, permits older than 7 days)',
    'you',
    ARRAY['3.35'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '5.15',
    5,
    '5C',
    'Sync health dashboard (admin: last sync, failures, stale permits)',
    'you',
    ARRAY['5.14'],
    'not_started',
    false,
    NULL
  ),
  (
    '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
    '5.16',
    5,
    '5C',
    'Discrepancy/compliance alert rules (Resend/Twilio)',
    'you',
    ARRAY['3.13', '3.35'],
    'not_started',
    false,
    NULL
  )
ON CONFLICT (organization_id, task_id) DO NOTHING;

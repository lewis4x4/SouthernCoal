-- Counterparty Graph Slice A, Part 6: fold-in seeds from existing SCC identity silos.

-- 1. user_profiles -> tenant-private person parties keyed by user_profile_id.
INSERT INTO public.parties (
  party_kind,
  display_name,
  legal_name,
  organization_id,
  is_shared_reference,
  user_profile_id,
  external_ids
)
SELECT
  'person',
  COALESCE(
    NULLIF(btrim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
    up.email
  ),
  NULL,
  up.organization_id,
  false,
  up.id,
  jsonb_strip_nulls(jsonb_build_object(
    'source', 'user_profiles',
    'source_key', 'user_profile:' || up.id::text,
    'user_profile_id', up.id::text,
    'email', up.email
  ))
FROM public.user_profiles up
WHERE up.organization_id IS NOT NULL
ON CONFLICT (user_profile_id) WHERE user_profile_id IS NOT NULL
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  organization_id = EXCLUDED.organization_id,
  external_ids = public.parties.external_ids || EXCLUDED.external_ids,
  updated_at = now();

INSERT INTO public.party_roles (
  party_id,
  organization_id,
  role_type_code,
  source,
  confidence,
  valid_from
)
SELECT
  p.id,
  up.organization_id,
  'employee',
  'user_profiles:' || up.id::text,
  1,
  up.created_at
FROM public.user_profiles up
JOIN public.parties p
  ON p.user_profile_id = up.id
WHERE up.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.party_roles pr
    WHERE pr.party_id = p.id
      AND pr.organization_id = up.organization_id
      AND pr.role_type_code = 'employee'
      AND pr.source = 'user_profiles:' || up.id::text
      AND pr.valid_to IS NULL
  );

-- 2. emergency_contacts -> tenant-private person parties and source-fidelity roles.
INSERT INTO public.parties (
  party_kind,
  display_name,
  organization_id,
  is_shared_reference,
  external_ids
)
SELECT
  'person',
  ec.contact_name,
  ec.organization_id,
  false,
  jsonb_strip_nulls(jsonb_build_object(
    'source', 'emergency_contacts',
    'source_key', 'emergency_contact:' || ec.id::text,
    'emergency_contact_id', ec.id::text,
    'email', ec.email,
    'phone_primary', ec.phone_primary,
    'phone_secondary', ec.phone_secondary,
    'organization_name', ec.organization_name,
    'state_code', ec.state_code
  ))
FROM public.emergency_contacts ec
ON CONFLICT ((external_ids ->> 'source_key')) WHERE external_ids ? 'source_key'
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  organization_id = EXCLUDED.organization_id,
  external_ids = public.parties.external_ids || EXCLUDED.external_ids,
  updated_at = now();

INSERT INTO public.party_roles (
  party_id,
  organization_id,
  role_type_code,
  site_id,
  source,
  confidence,
  valid_from
)
SELECT
  p.id,
  ec.organization_id,
  ec.contact_role,
  ec.site_id,
  'emergency_contacts:' || ec.id::text,
  1,
  ec.created_at
FROM public.emergency_contacts ec
JOIN public.parties p
  ON p.external_ids ->> 'source_key' = 'emergency_contact:' || ec.id::text
WHERE NOT EXISTS (
  SELECT 1
  FROM public.party_roles pr
  WHERE pr.party_id = p.id
    AND pr.organization_id = ec.organization_id
    AND pr.role_type_code = ec.contact_role
    AND pr.site_id IS NOT DISTINCT FROM ec.site_id
    AND pr.source = 'emergency_contacts:' || ec.id::text
    AND pr.valid_to IS NULL
);

-- 3. State agencies from src/lib/constants.ts STATES -> shared-reference agency parties.
WITH state_agencies(state_code, state_name, agency_code, dmr_system) AS (
  VALUES
    ('AL', 'Alabama', 'ADEM', 'E2DMR'),
    ('KY', 'Kentucky', 'KYDEP', 'NetDMR'),
    ('TN', 'Tennessee', 'TDEC', 'MyTDEC'),
    ('VA', 'Virginia', 'DMLR', 'eDMR'),
    ('WV', 'West Virginia', 'DEP', 'NetDMR')
)
INSERT INTO public.parties (
  party_kind,
  display_name,
  legal_name,
  organization_id,
  is_shared_reference,
  external_ids
)
SELECT
  'organization',
  agency_code,
  agency_code,
  NULL,
  true,
  jsonb_build_object(
    'source', 'src/lib/constants.ts',
    'source_key', 'state_agency:' || state_code || ':' || agency_code,
    'state_code', state_code,
    'state_name', state_name,
    'agency', agency_code,
    'dmr_system', dmr_system
  )
FROM state_agencies
ON CONFLICT ((external_ids ->> 'source_key')) WHERE external_ids ? 'source_key'
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  legal_name = EXCLUDED.legal_name,
  external_ids = public.parties.external_ids || EXCLUDED.external_ids,
  updated_at = now();

WITH state_agency_parties AS (
  SELECT p.id AS party_id, p.external_ids ->> 'source_key' AS source_key
  FROM public.parties p
  WHERE p.external_ids ->> 'source' = 'src/lib/constants.ts'
    AND p.is_shared_reference = true
),
agency_org_roles AS (
  SELECT
    sap.party_id,
    o.id AS organization_id,
    'state_agency_seed:' || sap.source_key AS source
  FROM state_agency_parties sap
  CROSS JOIN public.organizations o
)
INSERT INTO public.party_roles (
  party_id,
  organization_id,
  role_type_code,
  source,
  confidence
)
SELECT
  party_id,
  organization_id,
  'agency',
  source,
  1
FROM agency_org_roles aor
WHERE NOT EXISTS (
  SELECT 1
  FROM public.party_roles pr
  WHERE pr.party_id = aor.party_id
    AND pr.organization_id = aor.organization_id
    AND pr.role_type_code = 'agency'
    AND pr.source = aor.source
    AND pr.valid_to IS NULL
);

-- 4. Named labs from HANDOFF_COUNTERPARTY_GRAPH.md section 6 -> tenant-private lab parties.
WITH canonical_labs(lab_key, display_name, review_required) AS (
  VALUES
    ('aquatic', 'Aquatic', false),
    ('fts', 'FTS', true),
    ('lrs_asheville', 'LRS (Asheville)', false),
    ('waypoint_analytical', 'Waypoint Analytical', false)
)
INSERT INTO public.parties (
  party_kind,
  display_name,
  legal_name,
  organization_id,
  is_shared_reference,
  external_ids
)
SELECT
  'organization',
  cl.display_name,
  cl.display_name,
  o.id,
  false,
  jsonb_build_object(
    'source', 'HANDOFF_COUNTERPARTY_GRAPH.md section 6 labs',
    'source_key', 'lab:' || o.id::text || ':' || cl.lab_key,
    'lab_key', cl.lab_key,
    'review_required', cl.review_required
  )
FROM canonical_labs cl
CROSS JOIN public.organizations o
ON CONFLICT ((external_ids ->> 'source_key')) WHERE external_ids ? 'source_key'
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  legal_name = EXCLUDED.legal_name,
  organization_id = EXCLUDED.organization_id,
  external_ids = public.parties.external_ids || EXCLUDED.external_ids,
  updated_at = now();

WITH lab_parties AS (
  SELECT
    p.id AS party_id,
    p.organization_id,
    p.external_ids ->> 'source_key' AS source_key
  FROM public.parties p
  WHERE p.external_ids ->> 'source' = 'HANDOFF_COUNTERPARTY_GRAPH.md section 6 labs'
)
INSERT INTO public.party_roles (
  party_id,
  organization_id,
  role_type_code,
  source,
  confidence
)
SELECT
  party_id,
  organization_id,
  'lab',
  source_key,
  1
FROM lab_parties lp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.party_roles pr
  WHERE pr.party_id = lp.party_id
    AND pr.organization_id = lp.organization_id
    AND pr.role_type_code = 'lab'
    AND pr.source = lp.source_key
    AND pr.valid_to IS NULL
);

-- 5. Discovery owners and outside counsel -> parent-org private parties/roles.
WITH parent_org AS (
  SELECT id
  FROM public.organizations
  ORDER BY CASE WHEN org_type = 'parent' THEN 0 ELSE 1 END, created_at, id
  LIMIT 1
),
manual_people(owner_key, display_name) AS (
  VALUES
    ('tom_lusk', 'Tom Lusk'),
    ('bill_johnson', 'Bill Johnson'),
    ('steve_ball', 'Steve Ball'),
    ('jon_lawson', 'Jon Lawson'),
    ('brad_morrison', 'Brad Morrison'),
    ('jay_justice', 'Jay Justice'),
    ('steven_r_ruby', 'Steven R. Ruby')
),
matched_profile_parties AS (
  SELECT
    mp.owner_key,
    p.id AS party_id
  FROM manual_people mp
  JOIN parent_org po ON true
  JOIN public.user_profiles up
    ON up.organization_id = po.id
   AND lower(NULLIF(btrim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), '')) = lower(mp.display_name)
  JOIN public.parties p
    ON p.user_profile_id = up.id
)
INSERT INTO public.parties (
  party_kind,
  display_name,
  organization_id,
  is_shared_reference,
  external_ids
)
SELECT
  'person',
  mp.display_name,
  po.id,
  false,
  jsonb_build_object(
    'source', 'HANDOFF_COUNTERPARTY_GRAPH.md section 6 discovery owners',
    'source_key', 'discovery_owner:' || mp.owner_key,
    'owner_key', mp.owner_key
  )
FROM manual_people mp
CROSS JOIN parent_org po
LEFT JOIN matched_profile_parties mpp
  ON mpp.owner_key = mp.owner_key
WHERE mpp.party_id IS NULL
ON CONFLICT ((external_ids ->> 'source_key')) WHERE external_ids ? 'source_key'
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  organization_id = EXCLUDED.organization_id,
  external_ids = public.parties.external_ids || EXCLUDED.external_ids,
  updated_at = now();

WITH parent_org AS (
  SELECT id
  FROM public.organizations
  ORDER BY CASE WHEN org_type = 'parent' THEN 0 ELSE 1 END, created_at, id
  LIMIT 1
),
counsel_org AS (
  INSERT INTO public.parties (
    party_kind,
    display_name,
    legal_name,
    organization_id,
    is_shared_reference,
    external_ids
  )
  SELECT
    'organization',
    'Carey Douglas Kessler & Ruby',
    'Carey Douglas Kessler & Ruby',
    po.id,
    false,
    jsonb_build_object(
      'source', 'HANDOFF_COUNTERPARTY_GRAPH.md section 6 outside counsel',
      'source_key', 'outside_counsel_org:carey_douglas_kessler_ruby'
    )
  FROM parent_org po
  ON CONFLICT ((external_ids ->> 'source_key')) WHERE external_ids ? 'source_key'
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    legal_name = EXCLUDED.legal_name,
    organization_id = EXCLUDED.organization_id,
    external_ids = public.parties.external_ids || EXCLUDED.external_ids,
    updated_at = now()
  RETURNING id, organization_id, external_ids ->> 'source_key' AS source_key
)
INSERT INTO public.party_roles (
  party_id,
  organization_id,
  role_type_code,
  source,
  confidence
)
SELECT
  id,
  organization_id,
  'counsel',
  source_key,
  1
FROM counsel_org co
WHERE NOT EXISTS (
  SELECT 1
  FROM public.party_roles pr
  WHERE pr.party_id = co.id
    AND pr.organization_id = co.organization_id
    AND pr.role_type_code = 'counsel'
    AND pr.source = co.source_key
    AND pr.valid_to IS NULL
);

WITH parent_org AS (
  SELECT id
  FROM public.organizations
  ORDER BY CASE WHEN org_type = 'parent' THEN 0 ELSE 1 END, created_at, id
  LIMIT 1
),
manual_roles(owner_key, role_type_code) AS (
  VALUES
    ('tom_lusk', 'employee'),
    ('bill_johnson', 'employee'),
    ('steve_ball', 'employee'),
    ('steve_ball', 'legal_counsel'),
    ('jon_lawson', 'environmental_consultant'),
    ('brad_morrison', 'environmental_consultant'),
    ('jay_justice', 'employee'),
    ('steven_r_ruby', 'legal_counsel')
),
profile_owner_parties AS (
  SELECT
    lower(NULLIF(btrim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), '')) AS normalized_name,
    p.id AS party_id,
    p.organization_id
  FROM public.user_profiles up
  JOIN public.parties p
    ON p.user_profile_id = up.id
),
manual_owner_parties AS (
  SELECT
    p.external_ids ->> 'owner_key' AS owner_key,
    p.id AS party_id,
    p.organization_id
  FROM public.parties p
  WHERE p.external_ids ->> 'source' IN (
    'HANDOFF_COUNTERPARTY_GRAPH.md section 6 discovery owners',
    'HANDOFF_COUNTERPARTY_GRAPH.md section 6 outside counsel'
  )
),
owner_names(owner_key, display_name) AS (
  VALUES
    ('tom_lusk', 'Tom Lusk'),
    ('bill_johnson', 'Bill Johnson'),
    ('steve_ball', 'Steve Ball'),
    ('jon_lawson', 'Jon Lawson'),
    ('brad_morrison', 'Brad Morrison'),
    ('jay_justice', 'Jay Justice'),
    ('steven_r_ruby', 'Steven R. Ruby')
),
owner_parties AS (
  SELECT
    onames.owner_key,
    COALESCE(pop.party_id, mop.party_id) AS party_id,
    COALESCE(pop.organization_id, mop.organization_id, po.id) AS organization_id
  FROM owner_names onames
  CROSS JOIN parent_org po
  LEFT JOIN profile_owner_parties pop
    ON pop.normalized_name = lower(onames.display_name)
  LEFT JOIN manual_owner_parties mop
    ON mop.owner_key = onames.owner_key
)
INSERT INTO public.party_roles (
  party_id,
  organization_id,
  role_type_code,
  source,
  confidence
)
SELECT
  op.party_id,
  op.organization_id,
  mr.role_type_code,
  'discovery_owner:' || mr.owner_key || ':' || mr.role_type_code,
  1
FROM manual_roles mr
JOIN owner_parties op
  ON op.owner_key = mr.owner_key
WHERE op.party_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.party_roles pr
    WHERE pr.party_id = op.party_id
      AND pr.organization_id = op.organization_id
      AND pr.role_type_code = mr.role_type_code
      AND pr.source = 'discovery_owner:' || mr.owner_key || ':' || mr.role_type_code
      AND pr.valid_to IS NULL
  );

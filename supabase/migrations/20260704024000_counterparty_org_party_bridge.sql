-- Counterparty Graph Slice A, Part 5: organizations.party_id bridge and MSHA-derived control view.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS party_id uuid;

COMMENT ON COLUMN public.organizations.party_id IS
  'Counterparty graph bridge: the tenant organization represented as a private organization-kind party.';

WITH existing_bridge AS (
  SELECT
    o.id AS organization_id,
    p.id AS party_id
  FROM public.organizations o
  JOIN public.parties p
    ON p.id = o.party_id
   AND p.party_kind = 'organization'
   AND p.organization_id = o.id
   AND p.is_shared_reference = false
  WHERE o.party_id IS NOT NULL
  UNION
  SELECT
    o.id AS organization_id,
    p.id AS party_id
  FROM public.organizations o
  JOIN public.parties p
    ON p.external_ids ->> 'scc_org_id' = o.id::text
   AND p.party_kind = 'organization'
   AND p.organization_id = o.id
   AND p.is_shared_reference = false
),
inserted AS (
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
    COALESCE(NULLIF(o.legal_name, ''), o.name),
    o.legal_name,
    o.id,
    false,
    jsonb_build_object(
      'source', 'organizations',
      'source_key', 'organization:' || o.id::text,
      'scc_org_id', o.id::text,
      'org_type', o.org_type
    )
  FROM public.organizations o
  LEFT JOIN existing_bridge eb
    ON eb.organization_id = o.id
  WHERE eb.organization_id IS NULL
  ON CONFLICT ((external_ids ->> 'source_key')) WHERE external_ids ? 'source_key'
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      legal_name = EXCLUDED.legal_name,
      external_ids = public.parties.external_ids || EXCLUDED.external_ids,
      updated_at = now()
  RETURNING organization_id, id AS party_id
),
resolved AS (
  SELECT organization_id, party_id FROM existing_bridge
  UNION
  SELECT organization_id, party_id FROM inserted
)
UPDATE public.organizations o
SET party_id = r.party_id
FROM resolved r
WHERE o.id = r.organization_id
  AND o.party_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_party_id_key'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_party_id_key UNIQUE (party_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_party_id_fkey'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_party_id_fkey
      FOREIGN KEY (party_id) REFERENCES public.parties(id);
  END IF;
END;
$$;

DO $$
DECLARE
  v_expected integer;
  v_actual integer;
BEGIN
  IF to_regclass('public.msha_subsidiary_org') IS NOT NULL THEN
    SELECT COUNT(DISTINCT organization_id)
    INTO v_expected
    FROM public.msha_subsidiary_org;

    SELECT COUNT(*)
    INTO v_actual
    FROM public.msha_subsidiary_org m
    JOIN public.organizations o
      ON o.id = m.organization_id
    JOIN public.parties p
      ON p.id = o.party_id
    WHERE p.party_kind = 'organization'
      AND p.organization_id = o.id
      AND p.is_shared_reference = false;

    IF v_expected <> v_actual THEN
      RAISE EXCEPTION 'organizations.party_id bridge mismatch: expected %, actual %', v_expected, v_actual;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.msha_owns_or_controls_party_relationships
WITH (security_invoker = true) AS
SELECT
  ('msha_owns_or_controls:' || m.mine_id)::text AS derived_relationship_key,
  controller_party.id AS from_party_id,
  o.party_id AS to_party_id,
  'owns_or_controls'::text AS relationship_type_code,
  m.organization_id,
  m.mine_id,
  m.controller_id,
  COALESCE(controller_party.display_name, allowlist.controller_name, m.controller_id) AS controller_name,
  m.operator_name,
  m.mine_name,
  m.state,
  m.first_seen AS valid_from,
  CASE WHEN m.is_active THEN NULL ELSE m.last_seen END AS valid_to,
  m.last_seen AS transaction_time,
  jsonb_build_array(jsonb_build_object(
    'source_table', 'msha_mine_org_map',
    'mine_id', m.mine_id,
    'controller_id', m.controller_id,
    'source', m.source
  )) AS evidence_refs
FROM public.msha_mine_org_map m
JOIN public.organizations o
  ON o.id = m.organization_id
LEFT JOIN public.msha_controller_allowlist allowlist
  ON allowlist.controller_id = m.controller_id
LEFT JOIN public.parties controller_party
  ON controller_party.external_ids ->> 'msha_controller_id' = m.controller_id
WHERE o.party_id IS NOT NULL;

COMMENT ON VIEW public.msha_owns_or_controls_party_relationships IS
  'Derived owns_or_controls surface. The operational source of truth remains msha_mine_org_map; no rows are copied into party_relationships.';

-- Verification:
-- WITH expected AS (
--   SELECT COUNT(DISTINCT organization_id) AS expected_count FROM public.msha_subsidiary_org
-- ), actual AS (
--   SELECT COUNT(*) AS actual_count
--   FROM public.msha_subsidiary_org m
--   JOIN public.organizations o ON o.id = m.organization_id
--   JOIN public.parties p ON p.id = o.party_id
--   WHERE p.party_kind = 'organization'
--     AND p.organization_id = o.id
--     AND p.is_shared_reference = false
-- )
-- SELECT expected.expected_count, actual.actual_count FROM expected, actual;
-- Expected on the SCC seed set: 27 / 27.

-- Counterparty Graph Slice A, Part 3: tenant-private role and relationship assertions.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.party_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  role_type_code text NOT NULL REFERENCES public.party_role_types(code),
  site_id uuid REFERENCES public.sites(id),
  npdes_permit_id uuid REFERENCES public.npdes_permits(id),
  source text NOT NULL,
  confidence numeric,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_roles_valid_time_check CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT party_roles_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT party_roles_single_asset_scope_check CHECK (num_nonnulls(site_id, npdes_permit_id) <= 1)
);

CREATE TABLE IF NOT EXISTS public.party_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_party_id uuid NOT NULL REFERENCES public.parties(id),
  to_party_id uuid NOT NULL REFERENCES public.parties(id),
  relationship_type_code text NOT NULL REFERENCES public.party_relationship_types(code),
  organization_id uuid REFERENCES public.organizations(id),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_relationships_valid_time_check CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT party_relationships_distinct_parties_check CHECK (from_party_id <> to_party_id),
  CONSTRAINT party_relationships_evidence_array_check CHECK (jsonb_typeof(evidence_refs) = 'array')
);

ALTER TABLE public.party_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_relationships ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_party_roles_org_party
  ON public.party_roles(organization_id, party_id);

CREATE INDEX IF NOT EXISTS idx_party_roles_role_type
  ON public.party_roles(role_type_code);

CREATE INDEX IF NOT EXISTS idx_party_relationships_org_from
  ON public.party_relationships(organization_id, from_party_id);

CREATE INDEX IF NOT EXISTS idx_party_relationships_org_to
  ON public.party_relationships(organization_id, to_party_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'party_roles_no_overlap'
      AND conrelid = 'public.party_roles'::regclass
  ) THEN
    ALTER TABLE public.party_roles
      ADD CONSTRAINT party_roles_no_overlap
      EXCLUDE USING gist (
        organization_id WITH =,
        party_id WITH =,
        role_type_code WITH =,
        (COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (COALESCE(npdes_permit_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz), '[)')) WITH &&
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'party_relationships_no_overlap'
      AND conrelid = 'public.party_relationships'::regclass
  ) THEN
    ALTER TABLE public.party_relationships
      ADD CONSTRAINT party_relationships_no_overlap
      EXCLUDE USING gist (
        (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        from_party_id WITH =,
        to_party_id WITH =,
        relationship_type_code WITH =,
        (tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz), '[)')) WITH &&
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_party_role_assertion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_party public.parties%ROWTYPE;
  v_site_org_id uuid;
  v_permit_org_id uuid;
BEGIN
  SELECT *
  INTO v_party
  FROM public.parties
  WHERE id = NEW.party_id;

  IF v_party.id IS NULL THEN
    RAISE EXCEPTION 'Party % was not found', NEW.party_id;
  END IF;

  IF NOT v_party.is_shared_reference AND v_party.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Party % does not belong to organization %', NEW.party_id, NEW.organization_id;
  END IF;

  IF NEW.site_id IS NOT NULL THEN
    SELECT organization_id INTO v_site_org_id
    FROM public.sites
    WHERE id = NEW.site_id;

    IF v_site_org_id IS NULL OR v_site_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Site % does not belong to organization %', NEW.site_id, NEW.organization_id;
    END IF;
  END IF;

  IF NEW.npdes_permit_id IS NOT NULL THEN
    SELECT organization_id INTO v_permit_org_id
    FROM public.npdes_permits
    WHERE id = NEW.npdes_permit_id;

    IF v_permit_org_id IS NULL OR v_permit_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'NPDES permit % does not belong to organization %', NEW.npdes_permit_id, NEW.organization_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_party_relationship_assertion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_from public.parties%ROWTYPE;
  v_to public.parties%ROWTYPE;
  v_is_directed boolean;
  v_swap uuid;
BEGIN
  IF NEW.relationship_type_code = 'owns_or_controls' THEN
    RAISE EXCEPTION 'owns_or_controls relationships derive from msha_mine_org_map';
  END IF;

  SELECT is_directed
  INTO v_is_directed
  FROM public.party_relationship_types
  WHERE code = NEW.relationship_type_code;

  IF v_is_directed IS NULL THEN
    RAISE EXCEPTION 'Unknown relationship type %', NEW.relationship_type_code;
  END IF;

  IF NOT v_is_directed AND NEW.from_party_id::text > NEW.to_party_id::text THEN
    v_swap := NEW.from_party_id;
    NEW.from_party_id := NEW.to_party_id;
    NEW.to_party_id := v_swap;
  END IF;

  SELECT * INTO v_from FROM public.parties WHERE id = NEW.from_party_id;
  SELECT * INTO v_to FROM public.parties WHERE id = NEW.to_party_id;

  IF v_from.id IS NULL OR v_to.id IS NULL THEN
    RAISE EXCEPTION 'Relationship endpoint party was not found';
  END IF;

  IF NEW.organization_id IS NULL THEN
    IF NOT (v_from.is_shared_reference AND v_to.is_shared_reference) THEN
      RAISE EXCEPTION 'Shared structural relationships must connect only shared-reference parties';
    END IF;
  ELSE
    IF NOT v_from.is_shared_reference AND v_from.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'From party % does not belong to organization %', NEW.from_party_id, NEW.organization_id;
    END IF;

    IF NOT v_to.is_shared_reference AND v_to.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'To party % does not belong to organization %', NEW.to_party_id, NEW.organization_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_party_role_assertion ON public.party_roles;
CREATE TRIGGER validate_party_role_assertion
  BEFORE INSERT OR UPDATE ON public.party_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_party_role_assertion();

DROP TRIGGER IF EXISTS validate_party_relationship_assertion ON public.party_relationships;
CREATE TRIGGER validate_party_relationship_assertion
  BEFORE INSERT OR UPDATE ON public.party_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_party_relationship_assertion();

DROP TRIGGER IF EXISTS set_party_roles_updated_at ON public.party_roles;
CREATE TRIGGER set_party_roles_updated_at
  BEFORE UPDATE ON public.party_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_party_relationships_updated_at ON public.party_relationships;
CREATE TRIGGER set_party_relationships_updated_at
  BEFORE UPDATE ON public.party_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "party_roles_select" ON public.party_roles;
CREATE POLICY "party_roles_select" ON public.party_roles
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "party_roles_insert" ON public.party_roles;
CREATE POLICY "party_roles_insert" ON public.party_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
    )
  );

DROP POLICY IF EXISTS "party_roles_update" ON public.party_roles;
CREATE POLICY "party_roles_update" ON public.party_roles
  FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
    )
  )
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "party_roles_service" ON public.party_roles;
CREATE POLICY "party_roles_service" ON public.party_roles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "party_relationships_select" ON public.party_relationships;
CREATE POLICY "party_relationships_select" ON public.party_relationships
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "party_relationships_insert" ON public.party_relationships;
CREATE POLICY "party_relationships_insert" ON public.party_relationships
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
    )
  );

DROP POLICY IF EXISTS "party_relationships_update" ON public.party_relationships;
CREATE POLICY "party_relationships_update" ON public.party_relationships
  FOR UPDATE TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
    )
  )
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "party_relationships_service" ON public.party_relationships;
CREATE POLICY "party_relationships_service" ON public.party_relationships
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

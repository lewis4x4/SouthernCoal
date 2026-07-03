-- Counterparty Graph Slice A, Part 2: parties, tenancy invariant, RLS, and shared-party RPC.

CREATE TABLE IF NOT EXISTS public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_kind text NOT NULL CHECK (party_kind IN ('person', 'organization')),
  display_name text NOT NULL,
  legal_name text,
  organization_id uuid REFERENCES public.organizations(id),
  is_shared_reference boolean NOT NULL DEFAULT false,
  user_profile_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  superseded_by uuid REFERENCES public.parties(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parties_tenancy_invariant CHECK (
    (is_shared_reference AND organization_id IS NULL)
    OR (NOT is_shared_reference AND organization_id IS NOT NULL)
  ),
  CONSTRAINT parties_valid_time_check CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT parties_external_ids_object_check CHECK (jsonb_typeof(external_ids) = 'object')
);

ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parties_user_profile_id
  ON public.parties(user_profile_id)
  WHERE user_profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parties_source_key
  ON public.parties((external_ids ->> 'source_key'))
  WHERE external_ids ? 'source_key';

CREATE INDEX IF NOT EXISTS idx_parties_org_display_name
  ON public.parties(organization_id, lower(display_name));

CREATE INDEX IF NOT EXISTS idx_parties_shared_display_name
  ON public.parties(lower(display_name))
  WHERE is_shared_reference;

DROP POLICY IF EXISTS "parties_select" ON public.parties;
CREATE POLICY "parties_select" ON public.parties
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id() OR is_shared_reference);

DROP POLICY IF EXISTS "parties_insert" ON public.parties;
CREATE POLICY "parties_insert" ON public.parties
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND NOT is_shared_reference
    AND EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
    )
  );

DROP POLICY IF EXISTS "parties_update" ON public.parties;
CREATE POLICY "parties_update" ON public.parties
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id() AND NOT is_shared_reference)
  WITH CHECK (organization_id = get_user_org_id() AND NOT is_shared_reference);

DROP POLICY IF EXISTS "parties_service" ON public.parties;
CREATE POLICY "parties_service" ON public.parties
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS set_parties_updated_at ON public.parties;
CREATE TRIGGER set_parties_updated_at
  BEFORE UPDATE ON public.parties
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.current_user_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    lower(auth.jwt() -> 'app_metadata' ->> 'platform_admin') IN ('true', '1', 'yes'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_shared_party(
  p_party_kind text,
  p_display_name text,
  p_legal_name text DEFAULT NULL,
  p_external_ids jsonb DEFAULT '{}'::jsonb
)
RETURNS public.parties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_external_ids jsonb := COALESCE(p_external_ids, '{}'::jsonb);
  v_row public.parties%ROWTYPE;
  v_source_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.current_user_is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin claim required';
  END IF;

  IF p_party_kind NOT IN ('person', 'organization') THEN
    RAISE EXCEPTION 'Invalid party kind: %', p_party_kind;
  END IF;

  IF NULLIF(btrim(p_display_name), '') IS NULL THEN
    RAISE EXCEPTION 'display_name is required';
  END IF;

  IF jsonb_typeof(v_external_ids) <> 'object' THEN
    RAISE EXCEPTION 'external_ids must be a JSON object';
  END IF;

  v_source_key := v_external_ids ->> 'source_key';

  IF v_source_key IS NOT NULL THEN
    SELECT id
    INTO v_existing_id
    FROM public.parties
    WHERE is_shared_reference
      AND organization_id IS NULL
      AND external_ids ->> 'source_key' = v_source_key
    LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.parties
    SET
      party_kind = p_party_kind,
      display_name = btrim(p_display_name),
      legal_name = NULLIF(btrim(p_legal_name), ''),
      external_ids = public.parties.external_ids || v_external_ids,
      updated_at = now()
    WHERE id = v_existing_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.parties (
      party_kind,
      display_name,
      legal_name,
      organization_id,
      is_shared_reference,
      external_ids
    ) VALUES (
      p_party_kind,
      btrim(p_display_name),
      NULLIF(btrim(p_legal_name), ''),
      NULL,
      true,
      v_external_ids
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_shared_party(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_shared_party(text, text, text, jsonb) TO authenticated;

COMMENT ON CONSTRAINT parties_tenancy_invariant ON public.parties IS
  'Shared-reference parties have no organization_id; tenant-private parties always have one.';

COMMENT ON FUNCTION public.upsert_shared_party(text, text, text, jsonb) IS
  'Platform-admin-only shared party writer. Tenant admins cannot create or update shared-reference parties through table RLS.';

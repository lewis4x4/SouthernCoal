-- Counterparty Graph Slice A, Part 4: append-only merge authority and resolved identity view.

CREATE TABLE IF NOT EXISTS public.party_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_party_id uuid NOT NULL REFERENCES public.parties(id),
  superseded_party_id uuid NOT NULL REFERENCES public.parties(id),
  organization_id uuid REFERENCES public.organizations(id),
  merged_by uuid REFERENCES public.user_profiles(id),
  basis text NOT NULL,
  confidence numeric,
  unmerge_of uuid REFERENCES public.party_merge_events(id),
  transaction_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_merge_events_distinct_parties_check CHECK (surviving_party_id <> superseded_party_id),
  CONSTRAINT party_merge_events_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

ALTER TABLE public.party_merge_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_party_merge_events_surviving
  ON public.party_merge_events(surviving_party_id);

CREATE INDEX IF NOT EXISTS idx_party_merge_events_superseded
  ON public.party_merge_events(superseded_party_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_party_merge_events_active_superseded
  ON public.party_merge_events(superseded_party_id)
  WHERE unmerge_of IS NULL;

CREATE OR REPLACE FUNCTION public.validate_party_merge_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survivor public.parties%ROWTYPE;
  v_superseded public.parties%ROWTYPE;
  v_locked_party public.parties%ROWTYPE;
  v_cycle_found boolean;
BEGIN
  IF NULLIF(btrim(NEW.basis), '') IS NULL THEN
    RAISE EXCEPTION 'Merge basis is required';
  END IF;

  FOR v_locked_party IN
    SELECT *
    FROM public.parties
    WHERE id IN (NEW.surviving_party_id, NEW.superseded_party_id)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_locked_party.id = NEW.surviving_party_id THEN
      v_survivor := v_locked_party;
    END IF;

    IF v_locked_party.id = NEW.superseded_party_id THEN
      v_superseded := v_locked_party;
    END IF;
  END LOOP;

  IF v_survivor.id IS NULL OR v_superseded.id IS NULL THEN
    RAISE EXCEPTION 'Merge parties must both exist';
  END IF;

  IF v_survivor.id = v_superseded.id THEN
    RAISE EXCEPTION 'A party cannot merge into itself';
  END IF;

  IF v_superseded.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Superseded party % is already merged', v_superseded.id;
  END IF;

  IF v_survivor.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Surviving party % is already superseded', v_survivor.id;
  END IF;

  IF v_survivor.is_shared_reference IS DISTINCT FROM v_superseded.is_shared_reference THEN
    RAISE EXCEPTION 'Shared/private party merges are prohibited; use a same_as relationship instead';
  END IF;

  IF v_survivor.is_shared_reference THEN
    IF NEW.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Shared party merge events must have organization_id NULL';
    END IF;

    IF NOT public.current_user_is_platform_admin() THEN
      RAISE EXCEPTION 'Platform admin claim required for shared party merges';
    END IF;
  ELSE
    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'Private party merge events require organization_id';
    END IF;

    IF v_survivor.organization_id <> v_superseded.organization_id
       OR v_survivor.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Private party merges must stay inside one tenant';
    END IF;

    IF auth.uid() IS NOT NULL AND NEW.organization_id <> get_user_org_id() THEN
      RAISE EXCEPTION 'Merge organization does not match authenticated user organization';
    END IF;
  END IF;

  WITH RECURSIVE chain AS (
    SELECT p.id, p.superseded_by
    FROM public.parties p
    WHERE p.id = NEW.surviving_party_id
    UNION ALL
    SELECT p.id, p.superseded_by
    FROM public.parties p
    JOIN chain c ON p.id = c.superseded_by
    WHERE c.superseded_by IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM chain WHERE id = NEW.superseded_party_id
  )
  INTO v_cycle_found;

  IF v_cycle_found THEN
    RAISE EXCEPTION 'Party merge would create a superseded_by cycle';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    NEW.merged_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_party_merge_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.parties%ROWTYPE;
  v_cycle_found boolean;
BEGIN
  IF NEW.superseded_by IS NOT DISTINCT FROM OLD.superseded_by THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.party_merge_authorized', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Party merges must be applied through party_merge_events';
  END IF;

  IF NEW.superseded_by IS NULL THEN
    RAISE EXCEPTION 'Clearing superseded_by requires an explicit unmerge workflow';
  END IF;

  IF OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Party % is already superseded', OLD.id;
  END IF;

  IF NEW.superseded_by = OLD.id THEN
    RAISE EXCEPTION 'A party cannot merge into itself';
  END IF;

  SELECT * INTO v_target
  FROM public.parties
  WHERE id = NEW.superseded_by;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Surviving party % does not exist', NEW.superseded_by;
  END IF;

  IF v_target.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Surviving party % is already superseded', v_target.id;
  END IF;

  IF OLD.is_shared_reference IS DISTINCT FROM v_target.is_shared_reference THEN
    RAISE EXCEPTION 'Shared/private party merges are prohibited; use a same_as relationship instead';
  END IF;

  IF OLD.is_shared_reference THEN
    IF OLD.organization_id IS NOT NULL OR v_target.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Shared party merges require NULL organization_id on both parties';
    END IF;

    IF NOT public.current_user_is_platform_admin() THEN
      RAISE EXCEPTION 'Platform admin claim required for shared party merges';
    END IF;
  ELSE
    IF OLD.organization_id IS NULL
       OR v_target.organization_id IS NULL
       OR OLD.organization_id <> v_target.organization_id THEN
      RAISE EXCEPTION 'Private party merges must stay inside one tenant';
    END IF;

    IF auth.uid() IS NOT NULL AND OLD.organization_id <> get_user_org_id() THEN
      RAISE EXCEPTION 'Merge organization does not match authenticated user organization';
    END IF;
  END IF;

  WITH RECURSIVE chain AS (
    SELECT p.id, p.superseded_by
    FROM public.parties p
    WHERE p.id = NEW.superseded_by
    UNION ALL
    SELECT p.id, p.superseded_by
    FROM public.parties p
    JOIN chain c ON p.id = c.superseded_by
    WHERE c.superseded_by IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM chain WHERE id = OLD.id
  )
  INTO v_cycle_found;

  IF v_cycle_found THEN
    RAISE EXCEPTION 'Party merge would create a superseded_by cycle';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_party_merge_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  PERFORM set_config('app.party_merge_authorized', 'on', true);

  UPDATE public.parties
  SET superseded_by = NEW.surviving_party_id
  WHERE id = NEW.superseded_party_id
    AND superseded_by IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'Party merge event % did not update exactly one superseded party', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_party_merge_event ON public.party_merge_events;
CREATE TRIGGER validate_party_merge_event
  BEFORE INSERT ON public.party_merge_events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_party_merge_event();

DROP TRIGGER IF EXISTS apply_party_merge_event ON public.party_merge_events;
CREATE TRIGGER apply_party_merge_event
  AFTER INSERT ON public.party_merge_events
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_party_merge_event();

DROP TRIGGER IF EXISTS enforce_party_merge_boundary ON public.parties;
CREATE TRIGGER enforce_party_merge_boundary
  BEFORE UPDATE OF superseded_by ON public.parties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_party_merge_boundary();

DROP POLICY IF EXISTS "party_merge_events_select" ON public.party_merge_events;
CREATE POLICY "party_merge_events_select" ON public.party_merge_events
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id() OR organization_id IS NULL);

DROP POLICY IF EXISTS "party_merge_events_insert" ON public.party_merge_events;
REVOKE INSERT, UPDATE, DELETE ON public.party_merge_events FROM authenticated;
GRANT SELECT ON public.party_merge_events TO authenticated;

COMMENT ON TABLE public.party_merge_events IS
  'Append-only merge audit ledger. Authenticated tenants must use apply_party_merge(); direct table inserts have no authenticated RLS policy.';

DROP POLICY IF EXISTS "party_merge_events_service" ON public.party_merge_events;
CREATE POLICY "party_merge_events_service" ON public.party_merge_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.apply_party_merge(
  p_surviving_party_id uuid,
  p_superseded_party_id uuid,
  p_basis text,
  p_confidence numeric DEFAULT NULL,
  p_unmerge_of uuid DEFAULT NULL
)
RETURNS public.party_merge_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survivor public.parties%ROWTYPE;
  v_superseded public.parties%ROWTYPE;
  v_org_id uuid;
  v_row public.party_merge_events%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_survivor FROM public.parties WHERE id = p_surviving_party_id;
  SELECT * INTO v_superseded FROM public.parties WHERE id = p_superseded_party_id;

  IF v_survivor.id IS NULL OR v_superseded.id IS NULL THEN
    RAISE EXCEPTION 'Merge parties must both exist';
  END IF;

  IF v_survivor.is_shared_reference AND v_superseded.is_shared_reference THEN
    IF NOT public.current_user_is_platform_admin() THEN
      RAISE EXCEPTION 'Platform admin claim required for shared party merges';
    END IF;
    v_org_id := NULL;
  ELSE
    v_org_id := get_user_org_id();

    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Organization context required';
    END IF;

    IF NOT (
      v_survivor.organization_id = v_org_id
      AND v_superseded.organization_id = v_org_id
      AND NOT v_survivor.is_shared_reference
      AND NOT v_superseded.is_shared_reference
    ) THEN
      RAISE EXCEPTION 'Private merges must use two same-tenant private parties';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid()
        AND r.name IN ('admin', 'executive', 'environmental_manager', 'site_manager')
    ) THEN
      RAISE EXCEPTION 'Insufficient permissions to merge parties';
    END IF;
  END IF;

  INSERT INTO public.party_merge_events (
    surviving_party_id,
    superseded_party_id,
    organization_id,
    merged_by,
    basis,
    confidence,
    unmerge_of
  ) VALUES (
    p_surviving_party_id,
    p_superseded_party_id,
    v_org_id,
    auth.uid(),
    p_basis,
    p_confidence,
    p_unmerge_of
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_party_merge(uuid, uuid, text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_party_merge(uuid, uuid, text, numeric, uuid) TO authenticated;

CREATE OR REPLACE VIEW public.parties_resolved
WITH (security_invoker = true) AS
WITH RECURSIVE chain AS (
  SELECT
    p.id AS party_id,
    p.id AS current_party_id,
    p.superseded_by,
    0 AS merge_depth,
    ARRAY[p.id] AS path
  FROM public.parties p
  UNION ALL
  SELECT
    c.party_id,
    p.id AS current_party_id,
    p.superseded_by,
    c.merge_depth + 1 AS merge_depth,
    c.path || p.id
  FROM chain c
  JOIN public.parties p
    ON p.id = c.superseded_by
  WHERE c.superseded_by IS NOT NULL
    AND p.id <> ALL(c.path)
    AND c.merge_depth < 50
),
resolved AS (
  SELECT DISTINCT ON (party_id)
    party_id,
    current_party_id AS canonical_party_id,
    merge_depth
  FROM chain
  ORDER BY party_id, (superseded_by IS NULL) DESC, merge_depth DESC
)
SELECT
  observed.id AS party_id,
  resolved.canonical_party_id,
  observed.id = resolved.canonical_party_id AS is_canonical,
  resolved.merge_depth,
  canonical.display_name AS canonical_display_name,
  canonical.legal_name AS canonical_legal_name,
  canonical.external_ids AS canonical_external_ids,
  canonical.organization_id AS canonical_organization_id,
  canonical.is_shared_reference AS canonical_is_shared_reference,
  observed.display_name AS observed_display_name,
  observed.legal_name AS observed_legal_name,
  observed.organization_id AS observed_organization_id,
  observed.is_shared_reference AS observed_is_shared_reference
FROM resolved
JOIN public.parties observed
  ON observed.id = resolved.party_id
JOIN public.parties canonical
  ON canonical.id = resolved.canonical_party_id;

COMMENT ON TABLE public.party_merge_events IS
  'Append-only identity resolution authority. Child party FKs are never repointed; display resolution uses parties_resolved.';

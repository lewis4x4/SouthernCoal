-- MSHA map review queue: allow authorized operators to assign reviewed mines
-- without granting direct table writes from the browser.

DROP POLICY IF EXISTS msha_subsidiary_org_select ON public.msha_subsidiary_org;
CREATE POLICY msha_subsidiary_org_select ON public.msha_subsidiary_org
  FOR SELECT TO authenticated
  USING (
    public.current_user_has_any_role(
      ARRAY['admin', 'executive', 'environmental_manager', 'safety_manager', 'coo']
    )
  );

CREATE OR REPLACE FUNCTION public.assign_msha_mine_org_override(
  p_mine_id text,
  p_organization_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actor_org_id uuid;
  v_mine_id text := NULLIF(trim(p_mine_id), '');
  v_note text := left(NULLIF(trim(COALESCE(p_note, '')), ''), 1000);
  v_review public.msha_mine_review%ROWTYPE;
  v_previous_override public.msha_mine_org_override%ROWTYPE;
  v_target_subsidiary text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_actor_org_id := get_user_org_id();
  IF v_actor_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT current_user_has_any_role(ARRAY['admin', 'executive', 'environmental_manager', 'safety_manager', 'coo']) THEN
    RAISE EXCEPTION 'Insufficient permissions to assign MSHA mine overrides';
  END IF;

  IF v_mine_id IS NULL THEN
    RAISE EXCEPTION 'MSHA mine ID is required';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Target organization is required';
  END IF;

  -- Authorized corporate operators may assign across subsidiaries, but only
  -- to organizations present in this governed MSHA target allowlist.
  SELECT mmo.subsidiary_name
  INTO v_target_subsidiary
  FROM public.msha_subsidiary_org mmo
  WHERE mmo.organization_id = p_organization_id
  ORDER BY mmo.subsidiary_name
  LIMIT 1;

  IF v_target_subsidiary IS NULL THEN
    RAISE EXCEPTION 'Target organization is not configured for MSHA mapping';
  END IF;

  SELECT *
  INTO v_review
  FROM public.msha_mine_review
  WHERE mine_id = v_mine_id
  FOR UPDATE;

  IF v_review.mine_id IS NULL THEN
    RAISE EXCEPTION 'MSHA mine % is not in the review queue', v_mine_id;
  END IF;

  SELECT *
  INTO v_previous_override
  FROM public.msha_mine_org_override
  WHERE mine_id = v_mine_id
  FOR UPDATE;

  INSERT INTO public.msha_mine_org_override (
    mine_id,
    organization_id,
    assigned_by,
    assigned_at,
    note
  ) VALUES (
    v_mine_id,
    p_organization_id,
    v_user_id,
    now(),
    v_note
  )
  ON CONFLICT (mine_id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = EXCLUDED.assigned_at,
      note = EXCLUDED.note;

  INSERT INTO public.msha_mine_org_map (
    mine_id,
    organization_id,
    operator_name,
    controller_id,
    mine_name,
    state,
    mine_status,
    source,
    is_active,
    first_seen,
    last_seen
  ) VALUES (
    v_mine_id,
    p_organization_id,
    COALESCE(NULLIF(v_review.operator_name, ''), 'Unknown operator'),
    COALESCE(NULLIF(v_review.controller_id, ''), 'UNKNOWN'),
    v_review.mine_name,
    v_review.state,
    v_review.mine_status,
    'override',
    true,
    v_review.first_seen,
    v_review.last_seen
  )
  ON CONFLICT (mine_id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      operator_name = EXCLUDED.operator_name,
      controller_id = EXCLUDED.controller_id,
      mine_name = EXCLUDED.mine_name,
      state = EXCLUDED.state,
      mine_status = EXCLUDED.mine_status,
      source = 'override',
      is_active = true,
      last_seen = EXCLUDED.last_seen;

  DELETE FROM public.msha_mine_review
  WHERE mine_id = v_mine_id;

  INSERT INTO public.msha_map_drift_log (
    run_type,
    status,
    summary
  ) VALUES (
    'reconcile',
    'completed',
    jsonb_build_object(
      'action', 'override_assigned',
      'mine_id', v_mine_id,
      'organization_id', p_organization_id,
      'subsidiary_name', v_target_subsidiary,
      'assigned_by', v_user_id,
      'operator_name', v_review.operator_name,
      'controller_id', v_review.controller_id
    )
  );

  INSERT INTO public.audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    old_values,
    new_values,
    description
  ) VALUES (
    v_user_id,
    v_actor_org_id,
    'msha_map_override_assigned',
    'external_data',
    'msha_mine_org_override',
    NULL,
    CASE
      WHEN v_previous_override.mine_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'mine_id', v_previous_override.mine_id,
        'organization_id', v_previous_override.organization_id,
        'assigned_by', v_previous_override.assigned_by,
        'assigned_at', v_previous_override.assigned_at,
        'note', v_previous_override.note
      )
    END,
    jsonb_build_object(
      'mine_id', v_mine_id,
      'organization_id', p_organization_id,
      'target_organization_id', p_organization_id,
      'subsidiary_name', v_target_subsidiary,
      'operator_name', v_review.operator_name,
      'mine_name', v_review.mine_name,
      'state', v_review.state,
      'mine_status', v_review.mine_status,
      'note', v_note,
      'actor_organization_id', v_actor_org_id
    ),
    'MSHA mine override assigned from review queue'
  );

  RETURN jsonb_build_object(
    'success', true,
    'mine_id', v_mine_id,
    'organization_id', p_organization_id,
    'subsidiary_name', v_target_subsidiary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_msha_mine_org_override(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_msha_mine_org_override(text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.assign_msha_mine_org_override(text, uuid, text) IS
  'Assigns an MSHA review-queue mine to a configured subsidiary via audited override and immediately materializes msha_mine_org_map.';

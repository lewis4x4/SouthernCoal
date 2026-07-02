-- Slice 1 — RPC to update permit_limits review_status (AI trust layer for synthetic ECHO limits).

CREATE OR REPLACE FUNCTION public.update_permit_limit_review_status(
  p_limit_id uuid,
  p_review_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS public.permit_limits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.permit_limits%ROWTYPE;
BEGIN
  IF p_review_status NOT IN ('pending_review', 'in_review', 'verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_review_status;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT can_manage_sampling_records() THEN
    RAISE EXCEPTION 'Insufficient permissions to update permit limit review status';
  END IF;

  UPDATE public.permit_limits pl
  SET
    review_status = p_review_status,
    review_notes = COALESCE(p_review_notes, pl.review_notes),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  FROM public.npdes_permits np
  WHERE pl.id = p_limit_id
    AND np.id = pl.permit_id
    AND (
      auth.uid() IS NULL
      OR np.organization_id = get_user_org_id()
    )
  RETURNING pl.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Permit limit not found or not accessible';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_permit_limit_review_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_permit_limit_review_status(uuid, text, text) IS
  'Update permit_limits review_status for org-scoped synthetic/imported limits; audit via trg_audit_permit_limits_review.';

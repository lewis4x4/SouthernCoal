-- P0: Harden SECURITY DEFINER RPCs — require authenticated org context (no auth.uid() IS NULL bypass).
-- P1: Add update_npdes_permit_administrative_disposition for Admin DataQualityPanel (npdes_permits has SELECT-only RLS).

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
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_org_id := get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF p_review_status NOT IN ('pending_review', 'in_review', 'verified', 'disputed') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_review_status;
  END IF;

  IF NOT can_manage_sampling_records() THEN
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
    AND np.organization_id = v_org_id
  RETURNING pl.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Permit limit not found or not accessible';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.align_npdes_permit_status_from_echo(
  p_permit_id uuid,
  p_echo_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS public.npdes_permits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mapped text;
  v_row public.npdes_permits%ROWTYPE;
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_org_id := get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT can_manage_sampling_records() THEN
    RAISE EXCEPTION 'Insufficient permissions to update permit status';
  END IF;

  v_mapped := map_echo_permit_status_to_internal(p_echo_status);
  IF v_mapped IS NULL THEN
    RAISE EXCEPTION 'Unrecognized ECHO permit status: %', p_echo_status;
  END IF;

  UPDATE public.npdes_permits np
  SET
    status = v_mapped,
    updated_at = now()
  WHERE np.id = p_permit_id
    AND np.organization_id = v_org_id
  RETURNING np.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Permit not found or not accessible';
  END IF;

  INSERT INTO audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    auth.uid(),
    v_row.organization_id,
    'permit_status_aligned_from_echo',
    'external_data',
    'npdes_permits',
    v_row.id,
    jsonb_build_object(
      'permit_number', v_row.permit_number,
      'echo_status', p_echo_status,
      'new_status', v_mapped,
      'review_notes', p_review_notes
    ),
    'Internal permit status aligned from ECHO status_mismatch triage'
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_npdes_permit_administrative_disposition(
  p_permit_id uuid,
  p_resolution text
)
RETURNS public.npdes_permits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.npdes_permits%ROWTYPE;
  v_org_id uuid;
  v_continued boolean;
  v_investigate boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_org_id := get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT can_manage_sampling_records() THEN
    RAISE EXCEPTION 'Insufficient permissions to update permit administrative disposition';
  END IF;

  IF p_resolution NOT IN ('continued', 'expired', 'investigate') THEN
    RAISE EXCEPTION 'Invalid resolution: %', p_resolution;
  END IF;

  IF p_resolution = 'continued' THEN
    v_continued := true;
    v_investigate := false;
  ELSIF p_resolution = 'expired' THEN
    v_continued := false;
    v_investigate := false;
  ELSE
    v_continued := false;
    v_investigate := true;
  END IF;

  UPDATE public.npdes_permits np
  SET
    administratively_continued = v_continued,
    requires_administrative_investigation = v_investigate,
    updated_at = now()
  WHERE np.id = p_permit_id
    AND np.organization_id = v_org_id
  RETURNING np.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Permit not found or not accessible';
  END IF;

  INSERT INTO audit_log (
    user_id,
    organization_id,
    action,
    module,
    table_name,
    record_id,
    new_values,
    description
  ) VALUES (
    auth.uid(),
    v_row.organization_id,
    'data_quality_status_changed',
    'admin',
    'npdes_permits',
    v_row.id,
    jsonb_build_object(
      'permit_number', v_row.permit_number,
      'resolution', p_resolution,
      'administratively_continued', v_continued,
      'requires_administrative_investigation', v_investigate
    ),
    'Permit administrative disposition updated'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_permit_limit_review_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.align_npdes_permit_status_from_echo(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_npdes_permit_administrative_disposition(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_permit_limit_review_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.align_npdes_permit_status_from_echo(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_npdes_permit_administrative_disposition(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.update_npdes_permit_administrative_disposition(uuid, text) IS
  'Admin Data Quality panel — set administratively_continued / requires_administrative_investigation on org-scoped permits.';

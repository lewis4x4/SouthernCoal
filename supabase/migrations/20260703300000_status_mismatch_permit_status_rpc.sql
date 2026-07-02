-- Slice 4 — align npdes_permits.status from ECHO status_mismatch triage (SECURITY DEFINER; RLS has SELECT-only on permits).

CREATE OR REPLACE FUNCTION public.map_echo_permit_status_to_internal(p_echo_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(p_echo_status, ''))) LIKE '%terminated%' THEN 'terminated'
    WHEN lower(trim(coalesce(p_echo_status, ''))) LIKE '%expired%' THEN 'expired'
    WHEN lower(trim(coalesce(p_echo_status, ''))) LIKE '%admin continued%' THEN 'administratively_continued'
    WHEN lower(trim(coalesce(p_echo_status, ''))) LIKE '%effective%' THEN 'active'
    WHEN lower(trim(coalesce(p_echo_status, ''))) LIKE '%pending renewal%'
      OR lower(trim(coalesce(p_echo_status, ''))) LIKE '%pending_renewal%' THEN 'pending_renewal'
    WHEN lower(trim(coalesce(p_echo_status, ''))) LIKE '%revoked%' THEN 'revoked'
    WHEN lower(trim(coalesce(p_echo_status, ''))) = 'active' THEN 'active'
    WHEN lower(trim(coalesce(p_echo_status, ''))) = 'draft' THEN 'draft'
    ELSE NULL
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
BEGIN
  IF auth.uid() IS NOT NULL AND NOT can_manage_sampling_records() THEN
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
    AND (
      auth.uid() IS NULL
      OR np.organization_id = get_user_org_id()
    )
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

GRANT EXECUTE ON FUNCTION public.map_echo_permit_status_to_internal(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.align_npdes_permit_status_from_echo(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.align_npdes_permit_status_from_echo(uuid, text, text) IS
  'Update npdes_permits.status from ECHO label during Review Queue status_mismatch triage; audit-logged.';

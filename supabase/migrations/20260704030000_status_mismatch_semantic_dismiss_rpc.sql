-- Slice 4 closeout: safely dismiss legacy status_mismatch rows whose ECHO
-- permit_status label already maps to the current internal npdes_permits.status.

CREATE OR REPLACE FUNCTION public.bulk_dismiss_semantic_status_mismatches(
  p_limit integer DEFAULT 1000,
  p_review_notes text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_user uuid;
  v_limit integer;
  v_ids uuid[];
  v_count bigint;
  v_note text;
  v_reason text := 'Internal status already matches ECHO semantic status';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_org := get_user_org_id();
  v_user := auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT can_manage_sampling_records() THEN
    RAISE EXCEPTION 'Insufficient permissions to dismiss status mismatches';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 10000);
  v_note := COALESCE(
    NULLIF(trim(p_review_notes), ''),
    'Auto-dismissed: ECHO permit_status maps to the current internal npdes_permits.status; no permit lifecycle change required.'
  );

  SELECT array_agg(sub.id)
  INTO v_ids
  FROM (
    SELECT dr.id
    FROM discrepancy_reviews dr
    WHERE dr.organization_id = v_org
      AND dr.status = 'pending'
      AND dr.source = 'echo'
      AND dr.discrepancy_type = 'status_mismatch'
      AND dr.internal_source_table = 'npdes_permits'
      AND public.map_echo_permit_status_to_internal(dr.external_value) IS NOT NULL
      AND public.map_echo_permit_status_to_internal(dr.external_value) = lower(trim(coalesce(dr.internal_value, '')))
    ORDER BY dr.detected_at ASC
    LIMIT v_limit
  ) sub;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE discrepancy_reviews dr
  SET
    status = 'dismissed',
    reviewed_at = now(),
    reviewed_by = v_user,
    updated_at = now(),
    dismiss_reason = v_reason,
    review_notes = trim(both E'\n' from concat_ws(E'\n', NULLIF(trim(dr.review_notes), ''), v_note))
  WHERE dr.id = ANY (v_ids)
    AND dr.organization_id = v_org
    AND dr.status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

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
    v_user,
    v_org,
    'discrepancy_dismissed',
    'external_data',
    'discrepancy_reviews',
    NULL,
    jsonb_build_object(
      'bulk', true,
      'semantic_status_mismatch', true,
      'count', v_count,
      'limit', v_limit,
      'dismiss_reason', v_reason
    ),
    'Bulk dismissed semantic ECHO status_mismatch rows'
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_dismiss_semantic_status_mismatches(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_dismiss_semantic_status_mismatches(integer, text) TO authenticated;

COMMENT ON FUNCTION public.bulk_dismiss_semantic_status_mismatches(integer, text) IS
  'Dismiss pending ECHO status_mismatch rows only when the ECHO permit_status maps to the existing internal npdes_permits.status.';

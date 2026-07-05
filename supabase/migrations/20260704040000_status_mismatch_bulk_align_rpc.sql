-- Slice 4 closeout: bulk-align pending ECHO status_mismatch rows that have
-- a mapped target status and verified npdes_permits context.

CREATE OR REPLACE FUNCTION public.bulk_align_status_mismatches_from_echo(
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
  v_count bigint := 0;
  v_now timestamptz := now();
  v_reason text := 'Internal status bulk-aligned to ECHO permit_status';
  v_note text;
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
    RAISE EXCEPTION 'Insufficient permissions to bulk align status mismatches';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 10000);
  v_note := COALESCE(
    NULLIF(trim(p_review_notes), ''),
    'Bulk-aligned from Review Queue: ECHO permit_status mapped to a target internal status, permit context matched npdes_permits, and the current permit status still matched the discrepancy snapshot.'
  );

  WITH base AS (
    SELECT
      dr.id AS discrepancy_id,
      dr.organization_id,
      dr.npdes_id,
      dr.internal_value,
      dr.external_value,
      dr.internal_source_table,
      dr.internal_source_id,
      dr.detected_at,
      public.map_echo_permit_status_to_internal(dr.external_value) AS mapped_status,
      np.id AS permit_id,
      np.permit_number,
      np.status AS current_status
    FROM public.discrepancy_reviews dr
    LEFT JOIN public.npdes_permits np
      ON np.id = dr.internal_source_id
      AND np.organization_id = v_org
    WHERE dr.organization_id = v_org
      AND dr.status = 'pending'
      AND dr.source = 'echo'
      AND dr.discrepancy_type = 'status_mismatch'
    ORDER BY dr.detected_at ASC
    LIMIT v_limit
  ),
  target_counts AS (
    SELECT
      internal_source_id,
      count(DISTINCT mapped_status) AS target_status_count
    FROM base
    WHERE mapped_status IS NOT NULL
    GROUP BY internal_source_id
  ),
  eligible AS (
    SELECT b.*
    FROM base b
    LEFT JOIN target_counts tc ON tc.internal_source_id = b.internal_source_id
    WHERE b.internal_source_table = 'npdes_permits'
      AND b.internal_source_id IS NOT NULL
      AND b.mapped_status IS NOT NULL
      AND b.permit_id IS NOT NULL
      AND b.npdes_id IS NOT NULL
      AND btrim(b.npdes_id) <> ''
      AND upper(btrim(b.npdes_id)) = upper(btrim(b.permit_number))
      AND COALESCE(tc.target_status_count, 0) = 1
      AND lower(btrim(COALESCE(b.current_status, ''))) = lower(btrim(COALESCE(b.internal_value, '')))
      AND b.mapped_status <> lower(btrim(COALESCE(b.current_status, '')))
  ),
  eligible_permits AS (
    SELECT
      e.permit_id,
      e.mapped_status,
      max(e.current_status) AS old_status,
      max(e.permit_number) AS permit_number,
      jsonb_agg(e.discrepancy_id ORDER BY e.detected_at ASC) AS discrepancy_ids,
      count(*) AS discrepancy_count
    FROM eligible e
    GROUP BY e.permit_id, e.mapped_status
  ),
  updated_permits AS (
    UPDATE public.npdes_permits np
    SET
      status = ep.mapped_status,
      updated_at = v_now
    FROM eligible_permits ep
    WHERE np.id = ep.permit_id
      AND np.organization_id = v_org
      AND lower(btrim(COALESCE(np.status, ''))) = lower(btrim(COALESCE(ep.old_status, '')))
    RETURNING
      np.id,
      np.organization_id,
      np.permit_number,
      ep.old_status,
      ep.mapped_status,
      ep.discrepancy_ids,
      ep.discrepancy_count
  ),
  dismissed AS (
    UPDATE public.discrepancy_reviews dr
    SET
      status = 'dismissed',
      reviewed_at = v_now,
      reviewed_by = v_user,
      updated_at = v_now,
      dismiss_reason = v_reason,
      review_notes = trim(both E'\n' from concat_ws(
        E'\n',
        NULLIF(trim(dr.review_notes), ''),
        format(
          'Bulk-aligned from Review Queue: permit %s status changed from %s to %s based on ECHO permit_status "%s"; discrepancy %s dismissed.',
          COALESCE(e.permit_number, e.npdes_id, 'unknown'),
          COALESCE(e.current_status, ''),
          e.mapped_status,
          COALESCE(e.external_value, ''),
          e.discrepancy_id
        ),
        v_note
      ))
    FROM eligible e
    JOIN updated_permits up
      ON up.id = e.permit_id
      AND up.mapped_status = e.mapped_status
    WHERE dr.id = e.discrepancy_id
      AND dr.organization_id = v_org
      AND dr.status = 'pending'
    RETURNING
      dr.id AS discrepancy_id,
      dr.organization_id,
      dr.npdes_id,
      e.permit_id,
      e.permit_number,
      e.current_status AS old_status,
      e.mapped_status,
      e.external_value
  ),
  permit_audit AS (
    INSERT INTO public.audit_log (
      user_id,
      organization_id,
      action,
      module,
      table_name,
      record_id,
      new_values,
      description
    )
    SELECT
      v_user,
      up.organization_id,
      'permit_status_aligned_from_echo',
      'external_data',
      'npdes_permits',
      up.id,
      jsonb_build_object(
        'bulk', true,
        'permit_number', up.permit_number,
        'old_status', up.old_status,
        'new_status', up.mapped_status,
        'discrepancy_ids', up.discrepancy_ids,
        'discrepancy_count', up.discrepancy_count,
        'review_notes', v_note
      ),
      'Internal permit status bulk-aligned from ECHO status_mismatch triage'
    FROM updated_permits up
    RETURNING 1
  ),
  discrepancy_audit AS (
    INSERT INTO public.audit_log (
      user_id,
      organization_id,
      action,
      module,
      table_name,
      record_id,
      new_values,
      description
    )
    SELECT
      v_user,
      d.organization_id,
      'discrepancy_dismissed',
      'external_data',
      'discrepancy_reviews',
      d.discrepancy_id,
      jsonb_build_object(
        'bulk', true,
        'status_mismatch_bulk_align', true,
        'permit_id', d.permit_id,
        'permit_number', d.permit_number,
        'old_status', d.old_status,
        'new_status', d.mapped_status,
        'echo_status', d.external_value,
        'dismiss_reason', v_reason,
        'review_notes', v_note
      ),
      'Status mismatch dismissed after bulk permit status alignment'
    FROM dismissed d
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM dismissed;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_align_status_mismatches_from_echo(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_align_status_mismatches_from_echo(integer, text) TO authenticated;

COMMENT ON FUNCTION public.bulk_align_status_mismatches_from_echo(integer, text) IS
  'Bulk-align pending ECHO status_mismatch rows only when ECHO status maps to an internal status and verified npdes_permits context is still current.';

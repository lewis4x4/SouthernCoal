-- Task 3.36 — server-side bulk triage for post-rerun Review Queue volume

CREATE OR REPLACE FUNCTION public.bulk_mark_discrepancies_reviewed(
  p_severity text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_discrepancy_type text DEFAULT NULL,
  p_limit integer DEFAULT 5000,
  p_review_notes text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_user uuid;
  v_limit integer;
  v_ids uuid[];
  v_count bigint;
BEGIN
  v_org := get_user_org_id();
  v_user := auth.uid();
  IF v_org IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 10000);

  SELECT array_agg(sub.id)
  INTO v_ids
  FROM (
    SELECT dr.id
    FROM discrepancy_reviews dr
    WHERE dr.organization_id = v_org
      AND dr.status = 'pending'
      AND (p_severity IS NULL OR dr.severity = p_severity)
      AND (p_source IS NULL OR dr.source = p_source)
      AND (p_discrepancy_type IS NULL OR dr.discrepancy_type = p_discrepancy_type)
    ORDER BY dr.severity ASC, dr.detected_at DESC
    LIMIT v_limit
  ) sub;

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE discrepancy_reviews dr
  SET
    status = 'reviewed',
    reviewed_at = now(),
    reviewed_by = v_user,
    updated_at = now(),
    review_notes = COALESCE(NULLIF(trim(p_review_notes), ''), dr.review_notes)
  WHERE dr.id = ANY (v_ids)
    AND dr.organization_id = v_org
    AND dr.status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_mark_discrepancies_reviewed IS
  'Mark up to 10K pending discrepancy_reviews as reviewed (org-scoped, filterable). Task 3.36.';

GRANT EXECUTE ON FUNCTION public.bulk_mark_discrepancies_reviewed(text, text, text, integer, text)
  TO authenticated;

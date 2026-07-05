-- Lane C QW2: harden CD ¶49 EDD SECURITY DEFINER RPCs.
--
-- The ingest evaluator and work-order opener are pipeline internals. Keep them
-- service-role only, and enforce the same sampling-management permission inside
-- the triage RPC that the UI already applies before showing triage controls.

REVOKE ALL ON FUNCTION public.evaluate_edd_import_paragraph49(
  uuid, timestamptz, uuid, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_edd_import_paragraph49(
  uuid, timestamptz, uuid, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_edd_import_paragraph49(
  uuid, timestamptz, uuid, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.open_edd_paragraph49_with_work_order(
  uuid, uuid, boolean, boolean, text, text, numeric
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_edd_paragraph49_with_work_order(
  uuid, uuid, boolean, boolean, text, text, numeric
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_edd_paragraph49_with_work_order(
  uuid, uuid, boolean, boolean, text, text, numeric
) TO service_role;

REVOKE ALL ON FUNCTION public.log_edd_paragraph49_evaluation_failure(
  uuid, uuid, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_edd_paragraph49_evaluation_failure(
  uuid, uuid, text, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_edd_paragraph49_evaluation_failure(
  uuid, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.update_edd_paragraph49_review_status(
  p_evaluation_id uuid,
  p_review_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS public.edd_paragraph49_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.edd_paragraph49_evaluations%ROWTYPE;
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
    RAISE EXCEPTION 'Insufficient permissions to update ¶49 EDD triage status';
  END IF;

  IF p_review_status NOT IN ('pending', 'acknowledged', 'disputed', 'resolved') THEN
    RAISE EXCEPTION 'Invalid review status: %', p_review_status;
  END IF;

  UPDATE public.edd_paragraph49_evaluations
  SET review_status = p_review_status,
      review_notes = COALESCE(p_review_notes, review_notes),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      transaction_time = now(),
      updated_at = now()
  WHERE id = p_evaluation_id
    AND organization_id = v_org_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found or not accessible';
  END IF;

  INSERT INTO public.audit_log (
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
    'edd_paragraph49_review_updated',
    'environmental_compliance',
    'edd_paragraph49_evaluations',
    v_row.id,
    jsonb_build_object(
      'review_status', p_review_status,
      'import_id', v_row.import_id,
      'is_late_48h', v_row.is_late_48h,
      'is_exceedance_only', v_row.is_exceedance_only
    ),
    'EDD ¶49 triage updated'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_edd_paragraph49_review_status(
  uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_edd_paragraph49_review_status(
  uuid, text, text
) TO authenticated;

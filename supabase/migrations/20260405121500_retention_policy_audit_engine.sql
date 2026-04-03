ALTER TABLE public.retention_policies
  ADD COLUMN IF NOT EXISTS records_on_hold integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.run_retention_policy_audit(
  p_org_id uuid DEFAULT get_user_org_id()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid := get_user_org_id();
  v_policy RECORD;
  v_cutoff timestamptz;
  v_sql text;
  v_within integer := 0;
  v_outside integer := 0;
  v_on_hold integer := 0;
  v_updated integer := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  IF v_caller_org IS NOT NULL AND v_caller_org <> p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_policy IN
    SELECT *
    FROM public.retention_policies
    WHERE organization_id = p_org_id
    ORDER BY record_type
  LOOP
    v_cutoff := now() - make_interval(years => GREATEST(v_policy.retention_years, 0));
    v_within := 0;
    v_outside := 0;
    v_on_hold := 0;

    CASE v_policy.record_type
      WHEN 'audit_log' THEN
        SELECT
          COUNT(*) FILTER (WHERE al.created_at >= v_cutoff),
          COUNT(*) FILTER (WHERE al.created_at < v_cutoff)
        INTO v_within, v_outside
        FROM public.audit_log al
        WHERE al.organization_id = p_org_id;

      WHEN 'calibration_records' THEN
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(cl.calibrated_at, cl.created_at) >= v_cutoff),
          COUNT(*) FILTER (WHERE COALESCE(cl.calibrated_at, cl.created_at) < v_cutoff)
        INTO v_within, v_outside
        FROM public.calibration_logs cl
        JOIN public.equipment_catalog ec ON ec.id = cl.equipment_id
        WHERE ec.organization_id = p_org_id;

      WHEN 'compliance_violations' THEN
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(cv.violation_date::timestamptz, cv.created_at) >= v_cutoff),
          COUNT(*) FILTER (WHERE COALESCE(cv.violation_date::timestamptz, cv.created_at) < v_cutoff)
        INTO v_within, v_outside
        FROM public.compliance_violations cv
        WHERE cv.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.compliance_violations cv ON cv.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'violation'
          AND lh.is_active = true
          AND cv.organization_id = p_org_id;

      WHEN 'corrective_actions' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(
              ca.closed_date::timestamptz,
              ca.completed_date::timestamptz,
              ca.date_received::timestamptz,
              ca.created_at
            ) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(
              ca.closed_date::timestamptz,
              ca.completed_date::timestamptz,
              ca.date_received::timestamptz,
              ca.created_at
            ) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.corrective_actions ca
        WHERE ca.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.corrective_actions ca ON ca.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'corrective_action'
          AND lh.is_active = true
          AND ca.organization_id = p_org_id;

      WHEN 'dmr_submissions' THEN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dmr_submissions'
            AND column_name = 'monitoring_period_end'
        ) THEN
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(ds.monitoring_period_end::timestamptz, ds.created_at) >= $1
              ),
              COUNT(*) FILTER (
                WHERE COALESCE(ds.monitoring_period_end::timestamptz, ds.created_at) < $1
              )
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        ELSIF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dmr_submissions'
            AND column_name = 'period_end'
        ) THEN
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_end::timestamptz, ds.created_at) >= $1
              ),
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_end::timestamptz, ds.created_at) < $1
              )
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        ELSIF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dmr_submissions'
            AND column_name = 'period_start'
        ) THEN
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_start::timestamptz, ds.created_at) >= $1
              ),
              COUNT(*) FILTER (
                WHERE COALESCE(ds.period_start::timestamptz, ds.created_at) < $1
              )
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        ELSE
          v_sql := $sql$
            SELECT
              COUNT(*) FILTER (WHERE ds.created_at >= $1),
              COUNT(*) FILTER (WHERE ds.created_at < $1)
            FROM public.dmr_submissions ds
            JOIN public.npdes_permits p ON p.id = ds.permit_id
            WHERE p.organization_id = $2
          $sql$;
        END IF;

        EXECUTE v_sql
          INTO v_within, v_outside
          USING v_cutoff, p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.dmr_submissions ds ON ds.id = lh.entity_id
        JOIN public.npdes_permits p ON p.id = ds.permit_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'dmr_submission'
          AND lh.is_active = true
          AND p.organization_id = p_org_id;

      WHEN 'exceedances' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(
              e.detected_at,
              e.sample_date::timestamptz,
              e.created_at
            ) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(
              e.detected_at,
              e.sample_date::timestamptz,
              e.created_at
            ) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.exceedances e
        WHERE e.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.exceedances e ON e.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'exceedance'
          AND lh.is_active = true
          AND e.organization_id = p_org_id;

      WHEN 'field_visits' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(fv.completed_at, fv.started_at, fv.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(fv.completed_at, fv.started_at, fv.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.field_visits fv
        WHERE fv.organization_id = p_org_id;

      WHEN 'incidents' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(i.resolved_at, i.reported_at, i.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(i.resolved_at, i.reported_at, i.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.incidents i
        WHERE i.organization_id = p_org_id;

        SELECT COUNT(*)
        INTO v_on_hold
        FROM public.legal_holds lh
        JOIN public.incidents i ON i.id = lh.entity_id
        WHERE lh.organization_id = p_org_id
          AND lh.entity_type = 'incident'
          AND lh.is_active = true
          AND i.organization_id = p_org_id;

      WHEN 'lab_results' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(lr.analyzed_date::timestamptz, lr.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(lr.analyzed_date::timestamptz, lr.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.lab_results lr
        JOIN public.sampling_events se ON se.id = lr.sampling_event_id
        JOIN public.outfalls o ON o.id = se.outfall_id
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = p_org_id;

      WHEN 'npdes_permits' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(
              p.expiration_date::timestamptz,
              p.effective_date::timestamptz,
              p.issued_date::timestamptz,
              p.created_at
            ) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(
              p.expiration_date::timestamptz,
              p.effective_date::timestamptz,
              p.issued_date::timestamptz,
              p.created_at
            ) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.npdes_permits p
        WHERE p.organization_id = p_org_id;

      WHEN 'sampling_events' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(se.sample_date::timestamptz, se.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(se.sample_date::timestamptz, se.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.sampling_events se
        JOIN public.outfalls o ON o.id = se.outfall_id
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = p_org_id;

      WHEN 'training_completions' THEN
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(tc.completed_at::timestamptz, tc.created_at) >= v_cutoff
          ),
          COUNT(*) FILTER (
            WHERE COALESCE(tc.completed_at::timestamptz, tc.created_at) < v_cutoff
          )
        INTO v_within, v_outside
        FROM public.training_completions tc
        WHERE tc.organization_id = p_org_id;

      ELSE
        v_within := 0;
        v_outside := 0;
        v_on_hold := 0;
    END CASE;

    UPDATE public.retention_policies
    SET
      last_audit_at = now(),
      records_within_policy = COALESCE(v_within, 0),
      records_outside_policy = COALESCE(v_outside, 0),
      records_on_hold = COALESCE(v_on_hold, 0)
    WHERE id = v_policy.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN
    SELECT id
    FROM public.organizations
  LOOP
    PERFORM public.run_retention_policy_audit(v_org_id);
  END LOOP;
END;
$$;

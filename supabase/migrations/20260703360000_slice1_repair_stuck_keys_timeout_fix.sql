-- Slice 1 — repair stuck mirror keys timeout fix: scoped permit, CTE materialization, smaller batches.

DROP FUNCTION IF EXISTS public.repair_slice1_stuck_mirror_keys(uuid, integer);

CREATE OR REPLACE FUNCTION public.repair_slice1_stuck_mirror_keys(
  p_organization_id uuid,
  p_limit integer DEFAULT 50,
  p_permit_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_limit integer;
  v_repaired integer := 0;
  v_mirror_keys integer := 0;
  rec record;
  v_dedup_key text;
  v_limit_value numeric;
  v_lab_id uuid;
  v_bump_value numeric;
  v_repaired_this boolean;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  CREATE TEMP TABLE _slice1_repair_candidates ON COMMIT DROP AS
  WITH viol AS (
    SELECT DISTINCT ON (
      upper(ed.npdes_id),
      ed.outfall,
      ed.parameter_code,
      to_char(ed.monitoring_period_end, 'YYYY-MM')
    )
      upper(ed.npdes_id) AS npdes_id,
      ed.outfall,
      ed.parameter_code,
      ed.monitoring_period_end,
      ed.limit_value AS echo_limit_value
    FROM external_echo_dmrs ed
    WHERE ed.organization_id = p_organization_id
      AND ed.violation_code IS NOT NULL
      AND ed.monitoring_period_end IS NOT NULL
      AND ed.outfall IS NOT NULL
      AND ed.parameter_code IS NOT NULL
      AND (
        p_permit_number IS NULL
        OR upper(ed.npdes_id) = upper(trim(p_permit_number))
      )
    ORDER BY
      upper(ed.npdes_id),
      ed.outfall,
      ed.parameter_code,
      to_char(ed.monitoring_period_end, 'YYYY-MM'),
      ed.monitoring_period_end DESC
    LIMIT v_limit * 4
  ),
  resolved AS (
    SELECT
      v.npdes_id,
      v.outfall,
      v.parameter_code,
      v.monitoring_period_end,
      v.echo_limit_value,
      p.id AS permit_id,
      p.metadata AS permit_metadata,
      o.id AS outfall_id,
      pr.id AS parameter_id,
      pl.limit_max,
      pl.limit_value AS pl_limit_value,
      upper(
        coalesce(
          nullif(trim(p.metadata->>'federal_npdes_id_override'), ''),
          v.npdes_id
        )
      ) AS npdes_key
    FROM viol v
    JOIN npdes_permits p
      ON p.organization_id = p_organization_id
     AND (
       upper(p.permit_number) = v.npdes_id
       OR upper(
         coalesce(nullif(trim(p.metadata->>'federal_npdes_id_override'), ''), '')
       ) = v.npdes_id
     )
    JOIN outfalls o
      ON o.permit_id = p.id
     AND (
       o.outfall_number = v.outfall
       OR ltrim(o.outfall_number, '0') = ltrim(v.outfall, '0')
     )
    JOIN parameters pr
      ON ltrim(pr.storet_code, '0') = ltrim(v.parameter_code, '0')
    JOIN permit_limits pl
      ON pl.outfall_id = o.id
     AND pl.parameter_id = pr.id
     AND pl.is_active = true
     AND pl.limit_type <> 'report_only'
     AND (pl.limit_value IS NOT NULL OR pl.limit_max IS NOT NULL)
    WHERE (
      p_permit_number IS NULL
      OR upper(p.permit_number) = upper(trim(p_permit_number))
      OR upper(
        coalesce(nullif(trim(p.metadata->>'federal_npdes_id_override'), ''), '')
      ) = upper(trim(p_permit_number))
    )
  )
  SELECT *
  FROM resolved r
  WHERE NOT EXISTS (
    SELECT 1
    FROM slice1_echo_mirror_keys mk
    WHERE mk.organization_id = p_organization_id
      AND mk.dedup_key = r.npdes_key || ':' || r.outfall || ':' || r.parameter_code || ':'
        || to_char(r.monitoring_period_end, 'YYYY-MM')
  )
  LIMIT v_limit;

  FOR rec IN
    SELECT * FROM _slice1_repair_candidates
  LOOP
    v_dedup_key := rec.npdes_key || ':' || rec.outfall || ':' || rec.parameter_code || ':'
      || to_char(rec.monitoring_period_end, 'YYYY-MM');

    v_repaired_this := false;
    v_limit_value := coalesce(rec.limit_max, rec.pl_limit_value, rec.echo_limit_value, 1);

    SELECT lr.id
    INTO v_lab_id
    FROM lab_results lr
    JOIN sampling_events se ON se.id = lr.sampling_event_id
    WHERE se.outfall_id = rec.outfall_id
      AND lr.parameter_id = rec.parameter_id
      AND se.sample_date = rec.monitoring_period_end
    ORDER BY lr.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_lab_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM exceedances e WHERE e.lab_result_id = v_lab_id
      ) THEN
        v_bump_value := greatest(v_limit_value * 1.25, v_limit_value + 0.01);
        UPDATE lab_results
        SET result_value = v_bump_value
        WHERE id = v_lab_id;
        v_repaired_this := true;
        v_repaired := v_repaired + 1;
      END IF;
    END IF;

    IF v_repaired_this OR EXISTS (
      SELECT 1
      FROM exceedances e
      WHERE e.organization_id = p_organization_id
        AND e.outfall_id = rec.outfall_id
        AND e.parameter_id = rec.parameter_id
        AND to_char(e.sample_date, 'YYYY-MM') = to_char(rec.monitoring_period_end, 'YYYY-MM')
    ) THEN
      INSERT INTO slice1_echo_mirror_keys (organization_id, dedup_key)
      VALUES (p_organization_id, v_dedup_key)
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        v_mirror_keys := v_mirror_keys + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'limit', v_limit,
    'repaired_lab_results', v_repaired,
    'mirror_keys_inserted', v_mirror_keys,
    'permit_number', p_permit_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_slice1_stuck_mirror_keys(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_slice1_stuck_mirror_keys(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.repair_slice1_stuck_mirror_keys(uuid, integer, text) TO authenticated;

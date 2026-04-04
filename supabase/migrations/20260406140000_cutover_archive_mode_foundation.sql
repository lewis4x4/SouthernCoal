CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS public.cutover_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  effective_at timestamptz NOT NULL,
  executed_at timestamptz,
  executed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'executing', 'executed', 'failed')),
  writes_frozen boolean NOT NULL DEFAULT false,
  notes text,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cutover_batches_org_status
  ON public.cutover_batches (organization_id, status, effective_at DESC);

DROP TRIGGER IF EXISTS trg_cutover_batches_updated ON public.cutover_batches;
CREATE TRIGGER trg_cutover_batches_updated
  BEFORE UPDATE ON public.cutover_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_generic_timestamp();

ALTER TABLE public.cutover_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY cutover_batches_select ON public.cutover_batches
  FOR SELECT USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_batches_insert ON public.cutover_batches
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_batches_update ON public.cutover_batches
  FOR UPDATE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_batches_delete ON public.cutover_batches
  FOR DELETE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE TABLE IF NOT EXISTS public.cutover_matrix_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.cutover_batches(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size_bytes bigint,
  file_format text NOT NULL DEFAULT 'xlsx'
    CHECK (file_format IN ('xlsx', 'csv')),
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  parsed_row_count integer NOT NULL DEFAULT 0,
  resolution_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cutover_matrix_uploads_batch
  ON public.cutover_matrix_uploads (batch_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_cutover_matrix_uploads_updated ON public.cutover_matrix_uploads;
CREATE TRIGGER trg_cutover_matrix_uploads_updated
  BEFORE UPDATE ON public.cutover_matrix_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_generic_timestamp();

ALTER TABLE public.cutover_matrix_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY cutover_matrix_uploads_select ON public.cutover_matrix_uploads
  FOR SELECT USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_matrix_uploads_insert ON public.cutover_matrix_uploads
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_matrix_uploads_update ON public.cutover_matrix_uploads
  FOR UPDATE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_matrix_uploads_delete ON public.cutover_matrix_uploads
  FOR DELETE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE TABLE IF NOT EXISTS public.cutover_matrix_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.cutover_batches(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES public.cutover_matrix_uploads(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  state_code text,
  site_name text,
  permit_number text,
  outfall_number text,
  external_npdes_id text,
  facility_name text,
  mine_id text,
  disposition text NOT NULL
    CHECK (disposition IN ('live', 'archive', 'exclude')),
  notes text,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  resolved_permit_id uuid REFERENCES public.npdes_permits(id) ON DELETE SET NULL,
  resolved_outfall_id uuid REFERENCES public.outfalls(id) ON DELETE SET NULL,
  resolution_status text NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN ('pending', 'matched', 'unresolved', 'ambiguous', 'excluded')),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_cutover_matrix_rows_batch_status
  ON public.cutover_matrix_rows (batch_id, disposition, resolution_status, row_number);

DROP TRIGGER IF EXISTS trg_cutover_matrix_rows_updated ON public.cutover_matrix_rows;
CREATE TRIGGER trg_cutover_matrix_rows_updated
  BEFORE UPDATE ON public.cutover_matrix_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_generic_timestamp();

ALTER TABLE public.cutover_matrix_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY cutover_matrix_rows_select ON public.cutover_matrix_rows
  FOR SELECT USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_matrix_rows_insert ON public.cutover_matrix_rows
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_matrix_rows_update ON public.cutover_matrix_rows
  FOR UPDATE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY cutover_matrix_rows_delete ON public.cutover_matrix_rows
  FOR DELETE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE TABLE IF NOT EXISTS public.live_program_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cutover_batch_id uuid NOT NULL REFERENCES public.cutover_batches(id) ON DELETE CASCADE,
  state_code text,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  permit_id uuid REFERENCES public.npdes_permits(id) ON DELETE SET NULL,
  outfall_id uuid REFERENCES public.outfalls(id) ON DELETE SET NULL,
  source_row_id uuid REFERENCES public.cutover_matrix_rows(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_program_roster_org_site
  ON public.live_program_roster (organization_id, site_id);
CREATE INDEX IF NOT EXISTS idx_live_program_roster_org_batch
  ON public.live_program_roster (organization_id, cutover_batch_id, state_code);

DROP TRIGGER IF EXISTS trg_live_program_roster_updated ON public.live_program_roster;
CREATE TRIGGER trg_live_program_roster_updated
  BEFORE UPDATE ON public.live_program_roster
  FOR EACH ROW EXECUTE FUNCTION public.update_generic_timestamp();

ALTER TABLE public.live_program_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY live_program_roster_select ON public.live_program_roster
  FOR SELECT USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY live_program_roster_insert ON public.live_program_roster
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY live_program_roster_update ON public.live_program_roster
  FOR UPDATE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY live_program_roster_delete ON public.live_program_roster
  FOR DELETE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE TABLE IF NOT EXISTS public.archive_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.cutover_batches(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  archived_row_count integer NOT NULL DEFAULT 0,
  checksum_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_archive_manifest_batch
  ON public.archive_manifest (batch_id, table_name);

ALTER TABLE public.archive_manifest ENABLE ROW LEVEL SECURITY;

CREATE POLICY archive_manifest_select ON public.archive_manifest
  FOR SELECT USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY archive_manifest_insert ON public.archive_manifest
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY archive_manifest_update ON public.archive_manifest
  FOR UPDATE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

CREATE POLICY archive_manifest_delete ON public.archive_manifest
  FOR DELETE USING (
    organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
  );

DO $$
DECLARE
  target_table text;
  target_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'consent_decree_obligations',
    'compliance_snapshots',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews',
    'legal_holds'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS archive.%I AS TABLE public.%I WITH NO DATA',
      target_table,
      target_table
    );
    EXECUTE format(
      'ALTER TABLE archive.%I ADD COLUMN IF NOT EXISTS cutover_batch_id uuid NOT NULL REFERENCES public.cutover_batches(id) ON DELETE CASCADE',
      target_table
    );
    EXECUTE format(
      'ALTER TABLE archive.%I ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now()',
      target_table
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_archive_%I_batch ON archive.%I (cutover_batch_id, archived_at DESC)',
      target_table,
      target_table
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.in_live_program_scope(
  p_org_id uuid,
  p_site_id uuid DEFAULT NULL,
  p_permit_id uuid DEFAULT NULL,
  p_outfall_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_id uuid := p_site_id;
  v_permit_id uuid := p_permit_id;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.live_program_roster lpr
    WHERE lpr.organization_id = p_org_id
  ) THEN
    RETURN true;
  END IF;

  IF v_permit_id IS NULL AND p_outfall_id IS NOT NULL THEN
    SELECT o.permit_id
    INTO v_permit_id
    FROM public.outfalls o
    WHERE o.id = p_outfall_id;
  END IF;

  IF v_site_id IS NULL AND v_permit_id IS NOT NULL THEN
    SELECT p.site_id
    INTO v_site_id
    FROM public.npdes_permits p
    WHERE p.id = v_permit_id;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.live_program_roster lpr
    WHERE lpr.organization_id = p_org_id
      AND (
        (p_outfall_id IS NOT NULL AND lpr.outfall_id = p_outfall_id)
        OR (
          v_permit_id IS NOT NULL
          AND lpr.permit_id = v_permit_id
          AND lpr.outfall_id IS NULL
        )
        OR (
          v_site_id IS NOT NULL
          AND lpr.site_id = v_site_id
          AND lpr.permit_id IS NULL
          AND lpr.outfall_id IS NULL
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_cutover_batch_rows(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
  v_row RECORD;
  v_site_id uuid;
  v_permit_id uuid;
  v_outfall_id uuid;
  v_derived_site_id uuid;
  v_match_count integer;
  v_resolution_status text;
  v_resolution_notes text;
  target_table text;
  target_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'consent_decree_obligations',
    'compliance_snapshots',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews',
    'legal_holds'
  ];
  v_archive_preview jsonb := '{}'::jsonb;
  v_table_count bigint;
  v_summary jsonb;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cutover_batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cutover batch % not found', p_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.cutover_matrix_rows
    WHERE batch_id = p_batch_id
    ORDER BY row_number
  LOOP
    v_site_id := NULL;
    v_permit_id := NULL;
    v_outfall_id := NULL;
    v_resolution_notes := NULL;

    IF v_row.disposition = 'exclude' THEN
      UPDATE public.cutover_matrix_rows
      SET
        resolution_status = 'excluded',
        resolution_notes = 'Excluded from live roster',
        resolved_site_id = NULL,
        resolved_permit_id = NULL,
        resolved_outfall_id = NULL
      WHERE id = v_row.id;
      CONTINUE;
    END IF;

    IF v_row.site_name IS NOT NULL AND btrim(v_row.site_name) <> '' THEN
      SELECT COUNT(*), MIN(id)
      INTO v_match_count, v_site_id
      FROM public.sites
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(name)) = lower(btrim(v_row.site_name));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple site matches';
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.facility_name IS NOT NULL
       AND btrim(v_row.facility_name) <> ''
       AND v_site_id IS NULL THEN
      SELECT COUNT(*), MIN(id)
      INTO v_match_count, v_site_id
      FROM public.sites
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(name)) = lower(btrim(v_row.facility_name));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple facility/site matches';
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.permit_number IS NOT NULL
       AND btrim(v_row.permit_number) <> '' THEN
      SELECT COUNT(*), MIN(id), MIN(site_id)
      INTO v_match_count, v_permit_id, v_derived_site_id
      FROM public.npdes_permits
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(permit_number)) = lower(btrim(v_row.permit_number));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple permit matches';
      ELSIF v_match_count = 1 THEN
        IF v_site_id IS NULL THEN
          v_site_id := v_derived_site_id;
        ELSIF v_site_id <> v_derived_site_id THEN
          v_resolution_status := 'ambiguous';
          v_resolution_notes := 'Site and permit resolved to different facilities';
        END IF;
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.external_npdes_id IS NOT NULL
       AND btrim(v_row.external_npdes_id) <> ''
       AND v_permit_id IS NULL THEN
      SELECT COUNT(*), MIN(id), MIN(site_id)
      INTO v_match_count, v_permit_id, v_derived_site_id
      FROM public.npdes_permits
      WHERE organization_id = v_batch.organization_id
        AND lower(btrim(permit_number)) = lower(btrim(v_row.external_npdes_id));

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple NPDES permit matches';
      ELSIF v_match_count = 1 AND v_site_id IS NULL THEN
        v_site_id := v_derived_site_id;
      END IF;
    END IF;

    IF (v_resolution_status IS NULL OR v_resolution_status = 'pending')
       AND v_row.outfall_number IS NOT NULL
       AND btrim(v_row.outfall_number) <> '' THEN
      IF v_permit_id IS NOT NULL THEN
        SELECT COUNT(*), MIN(id)
        INTO v_match_count, v_outfall_id
        FROM public.outfalls
        WHERE permit_id = v_permit_id
          AND lower(btrim(outfall_number)) = lower(btrim(v_row.outfall_number));
      ELSE
        SELECT COUNT(*), MIN(o.id), MIN(p.id), MIN(p.site_id)
        INTO v_match_count, v_outfall_id, v_permit_id, v_derived_site_id
        FROM public.outfalls o
        JOIN public.npdes_permits p ON p.id = o.permit_id
        WHERE p.organization_id = v_batch.organization_id
          AND lower(btrim(o.outfall_number)) = lower(btrim(v_row.outfall_number));
      END IF;

      IF v_match_count > 1 THEN
        v_resolution_status := 'ambiguous';
        v_resolution_notes := 'Multiple outfall matches';
      ELSIF v_match_count = 1 AND v_site_id IS NULL THEN
        IF v_derived_site_id IS NULL AND v_permit_id IS NOT NULL THEN
          SELECT site_id INTO v_derived_site_id FROM public.npdes_permits WHERE id = v_permit_id;
        END IF;
        v_site_id := v_derived_site_id;
      END IF;
    END IF;

    IF v_resolution_status IS NULL THEN
      IF v_site_id IS NOT NULL THEN
        v_resolution_status := 'matched';
        v_resolution_notes := 'Resolved successfully';
      ELSE
        v_resolution_status := 'unresolved';
        v_resolution_notes := 'No site/permit/outfall match found';
      END IF;
    END IF;

    UPDATE public.cutover_matrix_rows
    SET
      resolved_site_id = v_site_id,
      resolved_permit_id = v_permit_id,
      resolved_outfall_id = v_outfall_id,
      resolution_status = v_resolution_status,
      resolution_notes = v_resolution_notes
    WHERE id = v_row.id;
  END LOOP;

  FOREACH target_table IN ARRAY target_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target_table
        AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE organization_id = $1', target_table)
        INTO v_table_count
        USING v_batch.organization_id;
    ELSE
      EXECUTE format('SELECT COUNT(*) FROM public.%I', target_table)
        INTO v_table_count;
    END IF;

    v_archive_preview := v_archive_preview || jsonb_build_object(target_table, v_table_count);
  END LOOP;

  v_summary := jsonb_build_object(
    'batch_id', p_batch_id,
    'row_counts', jsonb_build_object(
      'total_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id),
      'matched_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND resolution_status = 'matched'),
      'unresolved_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition <> 'exclude' AND resolution_status = 'unresolved'),
      'ambiguous_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition <> 'exclude' AND resolution_status = 'ambiguous'),
      'excluded_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition = 'exclude'),
      'live_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition = 'live'),
      'archive_rows', (SELECT COUNT(*) FROM public.cutover_matrix_rows WHERE batch_id = p_batch_id AND disposition = 'archive')
    ),
    'live_roster_counts', jsonb_build_object(
      'site_count', (
        SELECT COUNT(DISTINCT resolved_site_id)
        FROM public.cutover_matrix_rows
        WHERE batch_id = p_batch_id
          AND disposition = 'live'
          AND resolution_status = 'matched'
      ),
      'permit_count', (
        SELECT COUNT(DISTINCT resolved_permit_id)
        FROM public.cutover_matrix_rows
        WHERE batch_id = p_batch_id
          AND disposition = 'live'
          AND resolution_status = 'matched'
          AND resolved_permit_id IS NOT NULL
      ),
      'outfall_count', (
        SELECT COUNT(DISTINCT resolved_outfall_id)
        FROM public.cutover_matrix_rows
        WHERE batch_id = p_batch_id
          AND disposition = 'live'
          AND resolution_status = 'matched'
          AND resolved_outfall_id IS NOT NULL
      )
    ),
    'archive_preview', v_archive_preview
  );

  UPDATE public.cutover_batches
  SET
    summary_json = v_summary,
    status = CASE
      WHEN ((v_summary -> 'row_counts' ->> 'unresolved_rows')::integer > 0)
        OR ((v_summary -> 'row_counts' ->> 'ambiguous_rows')::integer > 0)
      THEN 'draft'
      ELSE 'ready'
    END
  WHERE id = p_batch_id;

  RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_cutover_batch(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.resolve_cutover_batch_rows(p_batch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_org_table(
  p_batch_id uuid,
  p_org_id uuid,
  p_table_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint := 0;
  v_checksum text := NULL;
  v_metadata jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = 'organization_id'
  ) THEN
    EXECUTE format(
      'INSERT INTO archive.%I SELECT *, $1::uuid AS cutover_batch_id, now() AS archived_at FROM public.%I WHERE organization_id = $2',
      p_table_name,
      p_table_name
    )
    USING p_batch_id, p_org_id;

    EXECUTE format(
      'SELECT COUNT(*), md5(COUNT(*)::text || ''|'' || COALESCE(MIN(id)::text, '''') || ''|'' || COALESCE(MAX(id)::text, '''')) FROM public.%I WHERE organization_id = $1',
      p_table_name
    )
    INTO v_count, v_checksum
    USING p_org_id;

    EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', p_table_name)
    USING p_org_id;
  ELSE
    EXECUTE format(
      'INSERT INTO archive.%I SELECT *, $1::uuid AS cutover_batch_id, now() AS archived_at FROM public.%I',
      p_table_name,
      p_table_name
    )
    USING p_batch_id;

    EXECUTE format(
      'SELECT COUNT(*), md5(COUNT(*)::text || ''|'' || COALESCE(MIN(id)::text, '''') || ''|'' || COALESCE(MAX(id)::text, '''')) FROM public.%I',
      p_table_name
    )
    INTO v_count, v_checksum;

    EXECUTE format('DELETE FROM public.%I', p_table_name);
  END IF;

  v_metadata := jsonb_build_object(
    'organization_id', p_org_id,
    'table_name', p_table_name
  );

  INSERT INTO public.archive_manifest (
    batch_id,
    organization_id,
    table_name,
    archived_row_count,
    checksum_text,
    metadata
  )
  VALUES (
    p_batch_id,
    p_org_id,
    p_table_name,
    COALESCE(v_count, 0)::integer,
    v_checksum,
    v_metadata
  )
  ON CONFLICT (batch_id, table_name)
  DO UPDATE SET
    archived_row_count = EXCLUDED.archived_row_count,
    checksum_text = EXCLUDED.checksum_text,
    metadata = EXCLUDED.metadata;

  RETURN jsonb_build_object(
    'table_name', p_table_name,
    'archived_row_count', COALESCE(v_count, 0),
    'checksum', v_checksum
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rebuild_live_compliance_snapshots(
  p_org_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
BEGIN
  IF p_org_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.compliance_snapshots
  WHERE organization_id = p_org_id;

  SELECT public.generate_compliance_snapshot(p_org_id, CURRENT_DATE)
  INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_cutover_batch(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
  v_preview jsonb;
  v_manifest jsonb := '[]'::jsonb;
  target_table text;
  target_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'consent_decree_obligations',
    'compliance_snapshots',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews'
  ];
  v_snapshot_id uuid;
  v_summary jsonb;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cutover_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cutover batch % not found', p_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_preview := public.resolve_cutover_batch_rows(p_batch_id);

  IF ((v_preview -> 'row_counts' ->> 'unresolved_rows')::integer > 0)
     OR ((v_preview -> 'row_counts' ->> 'ambiguous_rows')::integer > 0) THEN
    RAISE EXCEPTION 'Cutover batch still has unresolved or ambiguous matrix rows';
  END IF;

  UPDATE public.cutover_batches
  SET
    status = 'executing',
    writes_frozen = true
  WHERE id = p_batch_id;

  DELETE FROM public.archive_manifest
  WHERE batch_id = p_batch_id;

  FOREACH target_table IN ARRAY target_tables LOOP
    v_manifest := v_manifest || jsonb_build_array(
      public.archive_org_table(
        p_batch_id,
        v_batch.organization_id,
        target_table
      )
    );
  END LOOP;

  INSERT INTO archive.legal_holds
  SELECT *, p_batch_id AS cutover_batch_id, now() AS archived_at
  FROM public.legal_holds
  WHERE organization_id = v_batch.organization_id
    AND entity_type IN ('violation', 'corrective_action', 'dmr_submission', 'incident');

  INSERT INTO public.archive_manifest (
    batch_id,
    organization_id,
    table_name,
    archived_row_count,
    checksum_text,
    metadata
  )
  SELECT
    p_batch_id,
    v_batch.organization_id,
    'legal_holds',
    COUNT(*)::integer,
    md5(COUNT(*)::text || '|' || COALESCE(MIN(id)::text, '') || '|' || COALESCE(MAX(id)::text, '')),
    jsonb_build_object('organization_id', v_batch.organization_id, 'table_name', 'legal_holds')
  FROM public.legal_holds
  WHERE organization_id = v_batch.organization_id
    AND entity_type IN ('violation', 'corrective_action', 'dmr_submission', 'incident')
  ON CONFLICT (batch_id, table_name)
  DO UPDATE SET
    archived_row_count = EXCLUDED.archived_row_count,
    checksum_text = EXCLUDED.checksum_text,
    metadata = EXCLUDED.metadata;

  DELETE FROM public.legal_holds
  WHERE organization_id = v_batch.organization_id
    AND entity_type IN ('violation', 'corrective_action', 'dmr_submission', 'incident');

  DELETE FROM public.live_program_roster
  WHERE organization_id = v_batch.organization_id;

  INSERT INTO public.live_program_roster (
    organization_id,
    cutover_batch_id,
    state_code,
    site_id,
    permit_id,
    outfall_id,
    source_row_id
  )
  SELECT DISTINCT
    v_batch.organization_id,
    p_batch_id,
    cmr.state_code,
    cmr.resolved_site_id,
    cmr.resolved_permit_id,
    cmr.resolved_outfall_id,
    cmr.id
  FROM public.cutover_matrix_rows cmr
  WHERE cmr.batch_id = p_batch_id
    AND cmr.disposition = 'live'
    AND cmr.resolution_status = 'matched'
    AND cmr.resolved_site_id IS NOT NULL;

  SELECT public.rebuild_live_compliance_snapshots(v_batch.organization_id)
  INTO v_snapshot_id;

  v_summary := COALESCE(v_batch.summary_json, '{}'::jsonb) || jsonb_build_object(
    'execution', jsonb_build_object(
      'executed_at', now(),
      'executed_by', auth.uid(),
      'manifest', v_manifest,
      'live_roster_site_count', (
        SELECT COUNT(DISTINCT site_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
      ),
      'snapshot_id', v_snapshot_id
    )
  );

  UPDATE public.cutover_batches
  SET
    status = 'executed',
    writes_frozen = false,
    executed_at = now(),
    executed_by = auth.uid(),
    summary_json = v_summary
  WHERE id = p_batch_id;

  RETURN v_summary;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.cutover_batches
    SET
      status = 'failed',
      writes_frozen = false,
      summary_json = COALESCE(summary_json, '{}'::jsonb) || jsonb_build_object(
        'last_error', jsonb_build_object(
          'message', SQLERRM,
          'at', now()
        )
      )
    WHERE id = p_batch_id;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_archive_batches()
RETURNS SETOF public.cutover_batches
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.cutover_batches
  WHERE organization_id = get_user_org_id()
    AND current_user_has_any_role(ARRAY['admin'])
    AND status = 'executed'
  ORDER BY executed_at DESC NULLS LAST, created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_archive_batch_summary(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cutover_batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cutover batch % not found', p_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN jsonb_build_object(
    'batch', to_jsonb(v_batch),
    'uploads', COALESCE((
      SELECT jsonb_agg(to_jsonb(cmu) ORDER BY cmu.created_at DESC)
      FROM public.cutover_matrix_uploads cmu
      WHERE cmu.batch_id = p_batch_id
    ), '[]'::jsonb),
    'manifest', COALESCE((
      SELECT jsonb_agg(to_jsonb(am) ORDER BY am.table_name)
      FROM public.archive_manifest am
      WHERE am.batch_id = p_batch_id
    ), '[]'::jsonb),
    'roster_counts', jsonb_build_object(
      'sites', (
        SELECT COUNT(DISTINCT site_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
      ),
      'permits', (
        SELECT COUNT(DISTINCT permit_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
          AND permit_id IS NOT NULL
      ),
      'outfalls', (
        SELECT COUNT(DISTINCT outfall_id)
        FROM public.live_program_roster
        WHERE cutover_batch_id = p_batch_id
          AND outfall_id IS NOT NULL
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_archive_table_preview(
  p_batch_id uuid,
  p_table_name text,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
  v_rows jsonb;
  v_allowed_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'consent_decree_obligations',
    'compliance_snapshots',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews',
    'legal_holds'
  ];
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cutover_batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cutover batch % not found', p_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT (p_table_name = ANY (v_allowed_tables)) THEN
    RAISE EXCEPTION 'Unsupported archive table %', p_table_name;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (
       SELECT *
       FROM archive.%I
       WHERE cutover_batch_id = $1
       ORDER BY archived_at DESC
       LIMIT $2
     ) t',
    p_table_name
  )
  INTO v_rows
  USING p_batch_id, GREATEST(COALESCE(p_limit, 25), 1);

  RETURN jsonb_build_object(
    'table_name', p_table_name,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_archive_batch(
  p_batch_id uuid,
  p_mode text DEFAULT 'archive_only_preview'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cutover_batches%ROWTYPE;
  target_table text;
  target_tables text[] := ARRAY[
    'fts_uploads',
    'fts_violations',
    'fts_monthly_totals',
    'compliance_violations',
    'nov_records',
    'enforcement_actions',
    'consent_decree_obligations',
    'compliance_snapshots',
    'external_echo_facilities',
    'external_echo_dmrs',
    'external_msha_inspections',
    'external_sync_log',
    'discrepancy_reviews',
    'legal_holds'
  ];
  v_columns text;
  v_restore_counts jsonb := '{}'::jsonb;
  v_count bigint;
BEGIN
  SELECT *
  INTO v_batch
  FROM public.cutover_batches
  WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cutover batch % not found', p_batch_id;
  END IF;

  IF v_batch.organization_id <> get_user_org_id() OR NOT current_user_has_any_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_mode NOT IN ('archive_only_preview', 'merge_back') THEN
    RAISE EXCEPTION 'Unsupported restore mode %', p_mode;
  END IF;

  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM archive.%I WHERE cutover_batch_id = $1',
      target_table
    )
    INTO v_count
    USING p_batch_id;

    v_restore_counts := v_restore_counts || jsonb_build_object(target_table, COALESCE(v_count, 0));
  END LOOP;

  IF p_mode = 'merge_back' THEN
    FOREACH target_table IN ARRAY target_tables LOOP
      SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO v_columns
      FROM information_schema.columns
      WHERE table_schema = 'archive'
        AND table_name = target_table
        AND column_name NOT IN ('cutover_batch_id', 'archived_at');

      IF v_columns IS NULL THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        'INSERT INTO public.%I (%s)
         SELECT %s
         FROM archive.%I
         WHERE cutover_batch_id = $1
         ON CONFLICT (id) DO NOTHING',
        target_table,
        v_columns,
        v_columns,
        target_table
      )
      USING p_batch_id;
    END LOOP;

    RETURN jsonb_build_object(
      'mode', p_mode,
      'restored', true,
      'restore_counts', v_restore_counts
    );
  END IF;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'restored', false,
    'restore_counts', v_restore_counts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_compliance_snapshot(
  p_org_id uuid,
  p_snapshot_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id uuid;
  v_total_permits integer;
  v_active_permits integer;
  v_total_outfalls integer;
  v_active_outfalls integer;
  v_sampling_due integer;
  v_sampling_completed integer;
  v_sampling_pct numeric;
  v_total_exceedances integer;
  v_open_exceedances integer;
  v_exceedance_rate numeric;
  v_total_violations integer;
  v_open_violations integer;
  v_critical_violations integer;
  v_total_cas integer;
  v_open_cas integer;
  v_overdue_cas integer;
  v_avg_ca_days numeric;
  v_total_wos integer;
  v_open_wos integer;
  v_overdue_wos integer;
  v_dmr_due integer;
  v_dmr_completed integer;
  v_dmr_rate numeric;
  v_total_incidents integer;
  v_open_incidents integer;
  v_total_penalties numeric;
  v_compliance_score numeric;
  v_state_breakdown jsonb;
BEGIN
  IF get_user_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active')
  INTO v_total_permits, v_active_permits
  FROM public.npdes_permits
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, id, NULL);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE o.is_active = true)
  INTO v_total_outfalls, v_active_outfalls
  FROM public.outfalls o
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE se.status = 'completed')
  INTO v_sampling_due, v_sampling_completed
  FROM public.sampling_events se
  JOIN public.outfalls o ON se.outfall_id = o.id
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id)
    AND se.scheduled_date >= p_snapshot_date - INTERVAL '30 days'
    AND se.scheduled_date <= p_snapshot_date;

  v_sampling_pct := CASE WHEN v_sampling_due > 0
    THEN ROUND((v_sampling_completed::numeric / v_sampling_due) * 100, 2)
    ELSE 100 END;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE e.status = 'open')
  INTO v_total_exceedances, v_open_exceedances
  FROM public.exceedances e
  JOIN public.outfalls o ON e.outfall_id = o.id
  JOIN public.npdes_permits p ON o.permit_id = p.id
  WHERE e.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, p.id, o.id);

  v_exceedance_rate := CASE WHEN v_sampling_completed > 0
    THEN ROUND((v_total_exceedances::numeric / v_sampling_completed) * 100, 2)
    ELSE 0 END;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('open', 'under_investigation')),
    COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved', 'closed'))
  INTO v_total_violations, v_open_violations, v_critical_violations
  FROM public.compliance_violations
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, NULL, NULL);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('closed', 'verified', 'cancelled')),
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('closed', 'verified', 'cancelled')),
    ROUND(AVG(
      CASE WHEN closed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400
      END
    )::numeric, 1)
  INTO v_total_cas, v_open_cas, v_overdue_cas, v_avg_ca_days
  FROM public.corrective_actions
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, npdes_permit_id, NULL);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'verified', 'cancelled')),
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'verified', 'cancelled'))
  INTO v_total_wos, v_open_wos, v_overdue_wos
  FROM public.work_orders
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, permit_id, outfall_id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ds.status IN ('submitted', 'accepted'))
  INTO v_dmr_due, v_dmr_completed
  FROM public.dmr_submissions ds
  JOIN public.npdes_permits p ON p.id = ds.permit_id
  WHERE p.organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, p.site_id, ds.permit_id, NULL)
    AND ds.period_start >= date_trunc('quarter', p_snapshot_date::timestamp)::date;

  v_dmr_rate := CASE WHEN v_dmr_due > 0
    THEN ROUND((v_dmr_completed::numeric / v_dmr_due) * 100, 2)
    ELSE 100 END;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('open', 'investigating'))
  INTO v_total_incidents, v_open_incidents
  FROM public.incidents
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, NULL, permit_id, outfall_id);

  SELECT COALESCE(SUM(COALESCE(actual_penalty, estimated_penalty, 0)), 0)
  INTO v_total_penalties
  FROM public.compliance_violations
  WHERE organization_id = p_org_id
    AND public.in_live_program_scope(p_org_id, site_id, NULL, NULL);

  v_compliance_score := ROUND(
    (v_sampling_pct * 0.40) +
    ((100 - LEAST(v_exceedance_rate, 100)) * 0.25) +
    (CASE WHEN v_total_cas > 0
      THEN ((v_total_cas - v_overdue_cas)::numeric / v_total_cas) * 100
      ELSE 100 END * 0.20) +
    (v_dmr_rate * 0.15),
    2
  );

  SELECT jsonb_agg(jsonb_build_object(
    'state', sub.state_code,
    'permits', sub.permit_count,
    'outfalls', sub.outfall_count,
    'exceedances', sub.exc_count,
    'violations', sub.viol_count
  ))
  INTO v_state_breakdown
  FROM (
    SELECT
      s.state_code,
      COUNT(DISTINCT p.id) AS permit_count,
      COUNT(DISTINCT o.id) AS outfall_count,
      COUNT(DISTINCT e.id) AS exc_count,
      COUNT(DISTINCT cv.id) AS viol_count
    FROM public.sites s
    LEFT JOIN public.npdes_permits p
      ON p.site_id = s.id
      AND p.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, p.id, NULL)
    LEFT JOIN public.outfalls o
      ON o.permit_id = p.id
      AND public.in_live_program_scope(p_org_id, s.id, p.id, o.id)
    LEFT JOIN public.exceedances e
      ON e.outfall_id = o.id
      AND e.organization_id = p_org_id
    LEFT JOIN public.compliance_violations cv
      ON cv.site_id = s.id
      AND cv.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, NULL, NULL)
    WHERE s.organization_id = p_org_id
      AND public.in_live_program_scope(p_org_id, s.id, NULL, NULL)
    GROUP BY s.state_code
  ) sub;

  INSERT INTO public.compliance_snapshots (
    organization_id, snapshot_date, snapshot_type,
    total_permits, active_permits, total_outfalls, active_outfalls,
    sampling_events_due, sampling_events_completed, sampling_compliance_pct,
    total_exceedances, open_exceedances, exceedance_rate_pct,
    total_violations, open_violations, critical_violations,
    total_corrective_actions, open_corrective_actions, overdue_corrective_actions, avg_ca_closure_days,
    total_work_orders, open_work_orders, overdue_work_orders,
    dmr_submissions_due, dmr_submissions_completed, dmr_submission_rate_pct,
    total_incidents, open_incidents,
    total_penalties, compliance_score, state_breakdown,
    generated_by
  ) VALUES (
    p_org_id, p_snapshot_date, 'daily',
    v_total_permits, v_active_permits, v_total_outfalls, v_active_outfalls,
    v_sampling_due, v_sampling_completed, v_sampling_pct,
    v_total_exceedances, v_open_exceedances, v_exceedance_rate,
    v_total_violations, v_open_violations, v_critical_violations,
    v_total_cas, v_open_cas, v_overdue_cas, v_avg_ca_days,
    v_total_wos, v_open_wos, v_overdue_wos,
    v_dmr_due, v_dmr_completed, v_dmr_rate,
    v_total_incidents, v_open_incidents,
    v_total_penalties, v_compliance_score, v_state_breakdown,
    auth.uid()
  )
  ON CONFLICT (organization_id, snapshot_date, snapshot_type)
  DO UPDATE SET
    total_permits = EXCLUDED.total_permits,
    active_permits = EXCLUDED.active_permits,
    total_outfalls = EXCLUDED.total_outfalls,
    active_outfalls = EXCLUDED.active_outfalls,
    sampling_events_due = EXCLUDED.sampling_events_due,
    sampling_events_completed = EXCLUDED.sampling_events_completed,
    sampling_compliance_pct = EXCLUDED.sampling_compliance_pct,
    total_exceedances = EXCLUDED.total_exceedances,
    open_exceedances = EXCLUDED.open_exceedances,
    exceedance_rate_pct = EXCLUDED.exceedance_rate_pct,
    total_violations = EXCLUDED.total_violations,
    open_violations = EXCLUDED.open_violations,
    critical_violations = EXCLUDED.critical_violations,
    total_corrective_actions = EXCLUDED.total_corrective_actions,
    open_corrective_actions = EXCLUDED.open_corrective_actions,
    overdue_corrective_actions = EXCLUDED.overdue_corrective_actions,
    avg_ca_closure_days = EXCLUDED.avg_ca_closure_days,
    total_work_orders = EXCLUDED.total_work_orders,
    open_work_orders = EXCLUDED.open_work_orders,
    overdue_work_orders = EXCLUDED.overdue_work_orders,
    dmr_submissions_due = EXCLUDED.dmr_submissions_due,
    dmr_submissions_completed = EXCLUDED.dmr_submissions_completed,
    dmr_submission_rate_pct = EXCLUDED.dmr_submission_rate_pct,
    total_incidents = EXCLUDED.total_incidents,
    open_incidents = EXCLUDED.open_incidents,
    total_penalties = EXCLUDED.total_penalties,
    compliance_score = EXCLUDED.compliance_score,
    state_breakdown = EXCLUDED.state_breakdown,
    generated_by = EXCLUDED.generated_by,
    created_at = now()
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

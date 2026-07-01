-- Lane B — Upload Dashboard v6: org-scoped RLS on file_processing_queue.organization_id
-- Depends on 20260701195000_file_queue_org_scoped_dedup.sql (column + unique constraint).

-- Backfill any rows still missing org (idempotent)
UPDATE public.file_processing_queue fpq
SET organization_id = up.organization_id
FROM public.user_profiles up
WHERE fpq.organization_id IS NULL
  AND fpq.uploaded_by = up.id
  AND up.organization_id IS NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.file_processing_queue WHERE organization_id IS NULL
  ) THEN
    ALTER TABLE public.file_processing_queue
      ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END
$migration$;

DROP POLICY IF EXISTS "Users can view own org queue entries" ON public.file_processing_queue;
CREATE POLICY "Users can view own org queue entries"
ON public.file_processing_queue FOR SELECT
TO authenticated
USING (
  organization_id = (
    SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert queue entries" ON public.file_processing_queue;
CREATE POLICY "Users can insert queue entries"
ON public.file_processing_queue FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND organization_id = (
    SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own org queue entries" ON public.file_processing_queue;
CREATE POLICY "Users can update own org queue entries"
ON public.file_processing_queue FOR UPDATE
TO authenticated
USING (
  organization_id = (
    SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  organization_id = (
    SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
  )
);

COMMENT ON COLUMN public.file_processing_queue.organization_id IS
  'v6 tenant scope — Realtime filter organization_id=eq.{org}; dedup unique with file_hash + storage_bucket';

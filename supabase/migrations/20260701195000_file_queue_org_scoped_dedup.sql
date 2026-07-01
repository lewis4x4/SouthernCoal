-- v6 §3: Tenant-scoped file dedup on file_processing_queue.
-- Same file hash may exist once per organization per storage bucket.

ALTER TABLE public.file_processing_queue
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Backfill org from uploader profile where missing
UPDATE public.file_processing_queue fpq
SET organization_id = up.organization_id
FROM public.user_profiles up
WHERE fpq.organization_id IS NULL
  AND fpq.uploaded_by = up.id
  AND up.organization_id IS NOT NULL;

-- Drop legacy global constraint if present (pre-multi-tenant)
ALTER TABLE public.file_processing_queue
  DROP CONSTRAINT IF EXISTS file_processing_queue_file_hash_storage_bucket_key;

-- Ensure org-scoped uniqueness (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_processing_queue_org_hash_bucket_key'
      AND conrelid = 'public.file_processing_queue'::regclass
  ) THEN
    ALTER TABLE public.file_processing_queue
      ADD CONSTRAINT file_processing_queue_org_hash_bucket_key
      UNIQUE (organization_id, file_hash, storage_bucket);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fpq_organization_id
  ON public.file_processing_queue (organization_id);

COMMENT ON CONSTRAINT file_processing_queue_org_hash_bucket_key ON public.file_processing_queue IS
  'v6: dedup scoped per organization — same regulatory PDF may exist for different tenants';

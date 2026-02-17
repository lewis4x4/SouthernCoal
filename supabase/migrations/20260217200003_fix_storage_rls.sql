-- =============================================================================
-- Fix handoff-attachments Storage RLS — User-Scoped → Org-Scoped
-- =============================================================================
-- Changes storage path from {user_id}/... to {org_id}/...
-- This allows team members to see each other's handoff attachments.
-- =============================================================================

-- Drop existing user-scoped policies
DROP POLICY IF EXISTS "Users upload own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users view own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own attachments" ON storage.objects;

-- Create org-scoped policies
-- Path format: {org_id}/{YYYY-MM-DD}/{timestamp}_{filename}

CREATE POLICY "Org upload handoff attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'handoff-attachments'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

CREATE POLICY "Org read handoff attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'handoff-attachments'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

CREATE POLICY "Org delete handoff attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'handoff-attachments'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

-- =============================================================================
-- Update accepted MIME types to include more document formats
-- =============================================================================
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv', 'text/plain', 'text/markdown'
]
WHERE id = 'handoff-attachments';

-- =============================================================================
-- Verification Query (run manually to confirm)
-- =============================================================================
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'objects' AND policyname LIKE 'Org%handoff%';
-- Expected: 3 rows (upload, read, delete)

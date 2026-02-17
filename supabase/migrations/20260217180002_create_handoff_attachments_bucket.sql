-- Create storage bucket for handoff attachments
-- Part of Intelligent Handoff Processor feature

-- Insert bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'handoff-attachments',
  'handoff-attachments',
  false,  -- Private bucket
  26214400, -- 25MB limit
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for handoff attachments
-- Storage path format: {user_id}/{timestamp}_{filename}

-- Users can upload to their own folder
CREATE POLICY "Users upload own attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'handoff-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view files in their own folder
CREATE POLICY "Users view own attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'handoff-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete files in their own folder
CREATE POLICY "Users delete own attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'handoff-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

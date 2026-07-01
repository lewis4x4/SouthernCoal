-- Lane C QW3: Defensible-miss packet storage + PDF bucket

CREATE TABLE IF NOT EXISTS defensible_miss_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gap_id uuid NOT NULL REFERENCES sampling_gap_records(id) ON DELETE CASCADE,
  generated_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  format text NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'markdown')),
  storage_path text,
  file_name text NOT NULL,
  sha256_hash text,
  packet_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defensible_miss_packets_org_gap
  ON defensible_miss_packets(organization_id, gap_id, created_at DESC);

ALTER TABLE defensible_miss_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own org defensible miss packets"
  ON defensible_miss_packets FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Service role full access defensible miss packets"
  ON defensible_miss_packets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'defensible-miss-packets',
  'defensible-miss-packets',
  false,
  26214400,
  ARRAY['application/pdf', 'text/markdown']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY defensible_miss_packets_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'defensible-miss-packets'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
  );

CREATE POLICY defensible_miss_packets_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'defensible-miss-packets'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
    AND current_user_has_any_role(ARRAY[
      'admin', 'executive', 'environmental_manager', 'coo',
      'compliance_reviewer', 'chief_counsel'
    ])
  );

CREATE POLICY defensible_miss_packets_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'defensible-miss-packets'
    AND (storage.foldername(name))[1] = get_user_org_id()::text
    AND current_user_has_any_role(ARRAY['admin'])
  );

COMMENT ON TABLE defensible_miss_packets IS
  'Stored defensible-miss counsel packets (PDF/markdown) with storage path and content hash.';

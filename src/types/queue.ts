import type { FileStatus } from '@/lib/constants';

export interface QueueEntry {
  id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  file_hash: string | null;
  file_category: string;
  state_code: string | null;
  status: FileStatus;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  records_extracted: number;
  records_imported: number;
  records_failed: number;
  error_log: unknown[] | null;
  extracted_data: Record<string, unknown> | null;
  document_id: string | null;
  data_import_id: string | null;
  uploaded_by: string | null;
  organization_id: string | null;
  r2_archived: boolean;
  r2_archive_path: string | null;
  r2_archived_at: string | null;
  created_at: string;
  updated_at: string;
}

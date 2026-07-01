/**
 * Tenant-scoped upload deduplication helpers (v6 §3).
 */

export interface QueueDuplicateRow {
  id: string;
}

/** True when a prior queue row exists for the same org + hash + bucket. */
export function hasOrgScopedDuplicate(rows: QueueDuplicateRow[] | null | undefined): boolean {
  return (rows?.length ?? 0) > 0;
}

/** Postgres unique violation on org-scoped file hash constraint. */
export function isOrgScopedDedupViolation(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('file_processing_queue_org_hash_bucket') ||
    msg.includes('duplicate key') && msg.includes('file_hash');
}

export const DUPLICATE_UPLOAD_MESSAGE =
  'This file has already been uploaded for your organization (matching file hash).';

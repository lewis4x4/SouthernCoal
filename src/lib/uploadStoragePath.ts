/** Client-side upload path guards — org isolation is enforced on queue insert + RLS. */

const TRAVERSAL_PATTERN = /\.\.|\\|\0|^\/+/;

export function assertSafeUploadStoragePath(storagePath: string, organizationId: string): void {
  if (!organizationId?.trim()) {
    throw new Error('Upload blocked: missing organization_id');
  }
  const path = storagePath.trim();
  if (!path) {
    throw new Error('Upload blocked: empty storage path');
  }
  if (TRAVERSAL_PATTERN.test(path)) {
    throw new Error('Upload blocked: invalid storage path');
  }
}

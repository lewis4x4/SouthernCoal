import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_UPLOAD_MESSAGE,
  hasOrgScopedDuplicate,
  isOrgScopedDedupViolation,
} from '@/lib/uploadDedup';

describe('uploadDedup', () => {
  it('detects org-scoped duplicate rows', () => {
    expect(hasOrgScopedDuplicate([])).toBe(false);
    expect(hasOrgScopedDuplicate(null)).toBe(false);
    expect(hasOrgScopedDuplicate([{ id: 'abc' }])).toBe(true);
  });

  it('recognizes Postgres unique violations on org hash constraint', () => {
    expect(isOrgScopedDedupViolation({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(
      isOrgScopedDedupViolation({
        code: '23505',
        message: 'duplicate key value violates unique constraint "file_processing_queue_org_hash_bucket_key"',
      }),
    ).toBe(true);
    expect(isOrgScopedDedupViolation({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  it('exports a stable duplicate toast message', () => {
    expect(DUPLICATE_UPLOAD_MESSAGE).toContain('organization');
  });
});

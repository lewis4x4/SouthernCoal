import { describe, expect, it } from 'vitest';
import { assertSafeUploadStoragePath } from '@/lib/uploadStoragePath';

describe('uploadStoragePath', () => {
  it('accepts normal paths when org is set', () => {
    expect(() =>
      assertSafeUploadStoragePath('West_Virginia/abc123_report.pdf', 'org-uuid'),
    ).not.toThrow();
  });

  it('rejects traversal and missing org', () => {
    expect(() => assertSafeUploadStoragePath('../etc/passwd', 'org-uuid')).toThrow(
      'invalid storage path',
    );
    expect(() => assertSafeUploadStoragePath('ok.pdf', '')).toThrow('missing organization_id');
  });
});

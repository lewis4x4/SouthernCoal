import { describe, expect, it } from 'vitest';
import { buildFieldEvidenceStoragePath } from '@/lib/fieldEvidenceStoragePath';

describe('buildFieldEvidenceStoragePath', () => {
  it('sanitizes iPad screenshot file names into safe storage keys', () => {
    const path = buildFieldEvidenceStoragePath({
      pathPrefix: 'f0000001-0001-4001-8001-000000000001/field-visits/',
      referenceId: 'f00000c1-0001-4001-8001-000000000001',
      fileName: 'Screenshot 2026-04-01 at 9.28.03 AM.png',
      timestamp: 1775080069741,
    });

    expect(path).toBe(
      'f0000001-0001-4001-8001-000000000001/field-visits/f00000c1-0001-4001-8001-000000000001/1775080069741_Screenshot-2026-04-01-at-9.28.03-AM.png',
    );
  });
});


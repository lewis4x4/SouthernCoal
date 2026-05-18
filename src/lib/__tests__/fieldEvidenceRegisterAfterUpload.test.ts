import { describe, expect, it, vi } from 'vitest';
import { registerFieldEvidenceAfterUpload } from '../fieldEvidenceDrafts';

const baseInput = {
  organizationId: 'org-1',
  userId: 'user-1',
  fieldVisitId: 'visit-1',
  storagePath: 'prefix/visit-1/photo.jpg',
  bucket: 'field-inspections',
  evidenceType: 'photo' as const,
};

function makeClient(insertError: { message: string } | null, removeError: { message: string } | null = null) {
  const remove = vi.fn().mockResolvedValue({ error: removeError });
  return {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
    })),
    storage: {
      from: vi.fn(() => ({ remove })),
    },
    _remove: remove,
  };
}

describe('registerFieldEvidenceAfterUpload', () => {
  it('inserts without calling storage.remove on success', async () => {
    const client = makeClient(null);
    await registerFieldEvidenceAfterUpload(client as never, baseInput);
    expect(client._remove).not.toHaveBeenCalled();
  });

  it('removes storage and rethrows when insert fails', async () => {
    const client = makeClient({ message: 'insert failed' });
    await expect(registerFieldEvidenceAfterUpload(client as never, baseInput)).rejects.toThrow(
      'insert failed',
    );
    expect(client._remove).toHaveBeenCalledWith([baseInput.storagePath]);
  });

  it('throws compound error when insert and remove both fail', async () => {
    const client = makeClient({ message: 'insert failed' }, { message: 'remove failed' });
    await expect(registerFieldEvidenceAfterUpload(client as never, baseInput)).rejects.toThrow(
      /Could not register evidence/,
    );
    expect(client._remove).toHaveBeenCalled();
  });
});

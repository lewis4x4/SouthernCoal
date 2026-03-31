import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../fieldEvidenceDrafts', () => ({
  countFieldEvidenceDrafts: vi.fn(),
}));

vi.mock('../fieldOutboundQueue', () => ({
  getFieldOutboundQueueLength: vi.fn(),
}));

import { countFieldEvidenceDrafts } from '../fieldEvidenceDrafts';
import { getFieldOutboundQueueLength } from '../fieldOutboundQueue';
import { getFieldSyncPendingCount } from '../fieldSyncPending';

describe('getFieldSyncPendingCount', () => {
  beforeEach(() => {
    vi.mocked(countFieldEvidenceDrafts).mockResolvedValue(0);
    vi.mocked(getFieldOutboundQueueLength).mockReturnValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sums outbound queue length and IndexedDB evidence draft count', async () => {
    vi.mocked(getFieldOutboundQueueLength).mockReturnValue(2);
    vi.mocked(countFieldEvidenceDrafts).mockResolvedValue(5);
    await expect(getFieldSyncPendingCount()).resolves.toBe(7);
  });

  it('returns queue length only when no drafts', async () => {
    vi.mocked(getFieldOutboundQueueLength).mockReturnValue(3);
    vi.mocked(countFieldEvidenceDrafts).mockResolvedValue(0);
    await expect(getFieldSyncPendingCount()).resolves.toBe(3);
  });
});

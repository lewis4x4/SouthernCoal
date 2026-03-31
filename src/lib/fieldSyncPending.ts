import { countFieldEvidenceDrafts } from '@/lib/fieldEvidenceDrafts';
import { getFieldOutboundQueueLength } from '@/lib/fieldOutboundQueue';

/**
 * Phase 4 sync health: outbound JSON queue (localStorage) + evidence blobs (IndexedDB).
 */
export async function getFieldSyncPendingCount(): Promise<number> {
  const queueLen = getFieldOutboundQueueLength();
  const draftCount = await countFieldEvidenceDrafts();
  return queueLen + draftCount;
}

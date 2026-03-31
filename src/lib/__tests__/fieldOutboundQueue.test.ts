import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enqueueFieldMeasurementInsert,
  getFieldOutboundQueue,
  getFieldOutboundQueueLength,
  getPendingMeasurementInsertsForVisit,
  optimisticMeasurementsFromQueue,
  processFieldOutboundQueue,
} from '@/lib/fieldOutboundQueue';

describe('fieldOutboundQueue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('enqueue and read queue', () => {
    expect(getFieldOutboundQueueLength()).toBe(0);
    expect(
      enqueueFieldMeasurementInsert({
        id: 'a1',
        visitId: 'v1',
        parameterName: 'pH',
        measuredValue: 7,
        measuredText: null,
        unit: null,
      }),
    ).toBe(true);
    expect(getFieldOutboundQueueLength()).toBe(1);
    const q = getFieldOutboundQueue();
    expect(q[0]?.parameterName).toBe('pH');
    expect(getPendingMeasurementInsertsForVisit('v1')).toHaveLength(1);
    expect(getPendingMeasurementInsertsForVisit('other')).toHaveLength(0);
  });

  it('optimisticMeasurementsFromQueue builds records', () => {
    enqueueFieldMeasurementInsert({
      id: 'op-1',
      visitId: 'v1',
      parameterName: 'Temp',
      measuredValue: 12,
      measuredText: null,
      unit: 'C',
    });
    const rows = optimisticMeasurementsFromQueue('v1', 'user-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('local-op-1');
    expect(rows[0]?.metadata?.pending_sync).toBe(true);
    expect(rows[0]?.created_by).toBe('user-1');
  });

  it('processFieldOutboundQueue runs inserts FIFO and clears queue', async () => {
    enqueueFieldMeasurementInsert({
      id: '1',
      visitId: 'v1',
      parameterName: 'A',
      measuredValue: null,
      measuredText: 'x',
      unit: null,
    });
    enqueueFieldMeasurementInsert({
      id: '2',
      visitId: 'v1',
      parameterName: 'B',
      measuredValue: 1,
      measuredText: null,
      unit: null,
    });

    const insert = vi.fn().mockResolvedValue({ error: null });
    const fake = {
      from: () => ({ insert }),
    } as unknown as SupabaseClient;

    const result = await processFieldOutboundQueue(fake);
    expect(result.failed).toBeNull();
    expect(result.processed).toBe(2);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(getFieldOutboundQueueLength()).toBe(0);
  });

  it('processFieldOutboundQueue stops on insert error and leaves queue intact', async () => {
    enqueueFieldMeasurementInsert({
      id: '1',
      visitId: 'v1',
      parameterName: 'A',
      measuredValue: null,
      measuredText: null,
      unit: null,
    });
    const insert = vi.fn().mockResolvedValue({ error: { message: 'RLS' } });
    const fake = { from: () => ({ insert }) } as unknown as SupabaseClient;
    const result = await processFieldOutboundQueue(fake);
    expect(result.failed?.message).toContain('RLS');
    expect(result.processed).toBe(0);
    expect(getFieldOutboundQueueLength()).toBe(1);
  });

  it('returns false when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const ok = enqueueFieldMeasurementInsert({
      id: 'x',
      visitId: 'v',
      parameterName: 'p',
      measuredValue: null,
      measuredText: null,
      unit: null,
    });
    expect(ok).toBe(false);
    vi.restoreAllMocks();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FieldVisitListItem } from '@/types';
import {
  enqueueFieldMeasurementInsert,
  enqueueFieldVisitStart,
  enqueueOutletInspectionUpsert,
  getFieldOutboundQueue,
  getFieldOutboundQueueLength,
  getPendingMeasurementInsertsForVisit,
  mergeOutletInspectionWithQueue,
  mergeVisitWithQueuedStart,
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
    expect(q[0]?.kind === 'field_measurement_insert' && q[0].parameterName).toBe('pH');
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
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const fake = {
      from: () => ({ insert, upsert }),
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
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const fake = { from: () => ({ insert, upsert }) } as unknown as SupabaseClient;
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

  it('mergeOutletInspectionWithQueue overlays latest pending upsert', () => {
    expect(mergeOutletInspectionWithQueue('v1', null, 'u1')).toBeNull();
    enqueueOutletInspectionUpsert({
      id: 'i1',
      visitId: 'v1',
      flowStatus: 'no_flow',
      signageCondition: 'ok',
      pipeCondition: null,
      erosionObserved: false,
      obstructionObserved: true,
      obstructionDetails: 'gate',
      inspectorNotes: 'n1',
    });
    enqueueOutletInspectionUpsert({
      id: 'i2',
      visitId: 'v1',
      flowStatus: 'flowing',
      signageCondition: null,
      pipeCondition: 'cracked',
      erosionObserved: true,
      obstructionObserved: false,
      obstructionDetails: null,
      inspectorNotes: 'n2',
    });
    const merged = mergeOutletInspectionWithQueue('v1', null, 'u1');
    expect(merged?.flow_status).toBe('flowing');
    expect(merged?.inspector_notes).toBe('n2');
    expect(merged?.id).toBe('local-i2');
  });

  it('mergeVisitWithQueuedStart overlays pending start', () => {
    const visit = {
      id: 'v1',
      visit_status: 'assigned' as const,
      started_at: null,
      started_latitude: null,
      started_longitude: null,
      permit_number: 'P1',
      outfall_number: 'O1',
      assigned_to_name: 'A',
      route_stop_sequence: null,
    } as FieldVisitListItem;
    expect(mergeVisitWithQueuedStart(visit).visit_status).toBe('assigned');
    enqueueFieldVisitStart({
      id: 's1',
      visitId: 'v1',
      startedAt: '2026-03-31T12:00:00.000Z',
      latitude: 1,
      longitude: 2,
    });
    const merged = mergeVisitWithQueuedStart(visit);
    expect(merged.visit_status).toBe('in_progress');
    expect(merged.started_latitude).toBe(1);
    expect(merged.started_longitude).toBe(2);
  });

  it('processFieldOutboundQueue processes field_visit_start', async () => {
    enqueueFieldVisitStart({
      id: 'st1',
      visitId: 'v1',
      startedAt: '2026-03-31T12:00:00.000Z',
      latitude: 38.1,
      longitude: -81.2,
    });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === 'field_visits') return { update };
      return { insert, upsert };
    });
    const fake = { from } as unknown as SupabaseClient;
    const result = await processFieldOutboundQueue(fake);
    expect(result.failed).toBeNull();
    expect(result.processed).toBe(1);
    expect(update).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'v1');
  });

  it('processFieldOutboundQueue processes inspection upsert', async () => {
    enqueueOutletInspectionUpsert({
      id: 'in1',
      visitId: 'v1',
      flowStatus: 'unknown',
      signageCondition: null,
      pipeCondition: null,
      erosionObserved: false,
      obstructionObserved: false,
      obstructionDetails: null,
      inspectorNotes: null,
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const fake = { from: () => ({ insert, upsert }) } as unknown as SupabaseClient;
    const result = await processFieldOutboundQueue(fake);
    expect(result.failed).toBeNull();
    expect(result.processed).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });
});

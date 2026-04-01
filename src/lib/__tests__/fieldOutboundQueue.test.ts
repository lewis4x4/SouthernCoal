import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import type { FieldVisitListItem } from '@/types';
import { FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER } from '@/lib/fieldOpsConstants';
import type { FieldMeasurementRecord } from '@/types';
import {
  enqueueCocPrimaryUpsert,
  enqueueFieldVisitComplete,
  enqueueFieldMeasurementInsert,
  enqueueFieldVisitStart,
  enqueueOutletInspectionUpsert,
  countOutboundQueueOpsForVisit,
  getFieldOutboundQueue,
  getFieldOutboundQueueLength,
  getPendingMeasurementInsertsForVisit,
  mergeMeasurementsWithQueuedCoc,
  mergeOutletInspectionWithQueue,
  mergeVisitWithQueuedCompletion,
  mergeVisitWithQueuedLifecycle,
  mergeVisitWithQueuedStart,
  optimisticMeasurementsFromQueue,
  processFieldOutboundQueue,
  shouldQueueFieldOutboundFailure,
} from '@/lib/fieldOutboundQueue';

type NavigatorLocks = {
  request: <T>(name: string, callback: () => Promise<T> | T) => Promise<T>;
};

function setNavigatorLocks(locks: NavigatorLocks | undefined) {
  Object.defineProperty(navigator, 'locks', {
    value: locks,
    configurable: true,
    writable: true,
  });
}

describe('fieldOutboundQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    setNavigatorLocks(undefined);
  });

  afterEach(() => {
    localStorage.clear();
    setNavigatorLocks(undefined);
    vi.restoreAllMocks();
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

  it('countOutboundQueueOpsForVisit counts ops for visit', () => {
    enqueueFieldMeasurementInsert({
      id: 'a1',
      visitId: 'v1',
      parameterName: 'pH',
      measuredValue: 7,
      measuredText: null,
      unit: null,
    });
    enqueueFieldVisitStart({
      id: 's1',
      visitId: 'v2',
      startedAt: new Date().toISOString(),
      latitude: 1,
      longitude: 2,
    });
    expect(countOutboundQueueOpsForVisit('v1')).toBe(1);
    expect(countOutboundQueueOpsForVisit('v2')).toBe(1);
    expect(countOutboundQueueOpsForVisit('v3')).toBe(0);
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
    expect(result.blockedOp).toBeNull();
    expect(result.processed).toBe(2);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(getFieldOutboundQueueLength()).toBe(0);
  });

  it('processFieldOutboundQueue preserves ops enqueued during an in-flight flush', async () => {
    enqueueFieldMeasurementInsert({
      id: 'existing-op',
      visitId: 'v1',
      parameterName: 'A',
      measuredValue: 1,
      measuredText: null,
      unit: null,
    });

    const insert = vi.fn().mockImplementation(async () => {
      enqueueFieldMeasurementInsert({
        id: 'new-op',
        visitId: 'v2',
        parameterName: 'B',
        measuredValue: 2,
        measuredText: null,
        unit: null,
      });
      return { error: null };
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const fake = {
      from: () => ({ insert, upsert }),
    } as unknown as SupabaseClient;

    const result = await processFieldOutboundQueue(fake);
    expect(result.failed).toBeNull();
    expect(result.processed).toBe(2);
    expect(getFieldOutboundQueueLength()).toBe(0);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('processFieldOutboundQueue prevents duplicate writes across overlapping runtimes', async () => {
    enqueueFieldMeasurementInsert({
      id: 'shared-op',
      visitId: 'v1',
      parameterName: 'A',
      measuredValue: 1,
      measuredText: null,
      unit: null,
    });

    let lockChain = Promise.resolve();
    const requestImpl: NavigatorLocks['request'] = async <T,>(
      _name: string,
      callback: () => Promise<T> | T,
    ) => {
      const run = lockChain.then(() => callback());
      lockChain = run.then(() => undefined, () => undefined);
      return run;
    };
    const request = vi.fn(requestImpl) as NavigatorLocks['request'];
    setNavigatorLocks({ request });

    const runtimeAPath = pathToFileURL(`${import.meta.dirname}/../fieldOutboundQueue.ts`).href;
    const runtimeBPath = pathToFileURL(`${import.meta.dirname}/../fieldOutboundQueue.ts`).href;
    const runtimeA = await import(`${runtimeAPath}?runtime=a`);
    const runtimeB = await import(`${runtimeBPath}?runtime=b`);

    const insert = vi.fn().mockResolvedValue({ error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const fake = {
      from: () => ({ insert, upsert }),
    } as unknown as SupabaseClient;

    const [resultA, resultB] = await Promise.all([
      runtimeA.processFieldOutboundQueue(fake),
      runtimeB.processFieldOutboundQueue(fake),
    ]);

    expect(resultA.failed).toBeNull();
    expect(resultB.failed).toBeNull();
    expect(resultA.processed + resultB.processed).toBe(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(getFieldOutboundQueueLength()).toBe(0);
    expect(request).toHaveBeenCalledTimes(2);
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
    expect(result.blockedOp).toEqual({ kind: 'field_measurement_insert', visitId: 'v1' });
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
  });

  it('detects transient outbound failures that should queue locally', () => {
    expect(shouldQueueFieldOutboundFailure(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(shouldQueueFieldOutboundFailure(new DOMException('Timeout', 'AbortError'))).toBe(true);
    expect(shouldQueueFieldOutboundFailure({ message: 'Load failed', status: 503 })).toBe(true);
  });

  it('does not queue permanent outbound failures', () => {
    expect(shouldQueueFieldOutboundFailure(new Error('new row violates row-level security policy'))).toBe(false);
    expect(shouldQueueFieldOutboundFailure({ message: 'invalid input syntax for type uuid', status: 400 })).toBe(false);
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

  it('mergeVisitWithQueuedCompletion overlays pending completion', () => {
    const visit = {
      id: 'v1',
      visit_status: 'in_progress' as const,
      outcome: null,
      started_at: '2026-03-31T12:00:00.000Z',
      completed_at: null,
      completed_latitude: null,
      completed_longitude: null,
      weather_conditions: null,
      field_notes: null,
      potential_force_majeure: false,
      potential_force_majeure_notes: null,
      permit_number: 'P1',
      outfall_number: 'O1',
      assigned_to_name: 'A',
      route_stop_sequence: null,
    } as FieldVisitListItem;

    enqueueFieldVisitComplete({
      id: 'fc1',
      visitId: 'v1',
      outcome: 'access_issue',
      completedAt: '2026-03-31T14:00:00.000Z',
      completedLatitude: 38.2,
      completedLongitude: -81.4,
      weatherConditions: 'Rain',
      fieldNotes: 'Locked gate',
      potentialForceMajeure: true,
      potentialForceMajeureNotes: 'Road washed out',
      noDischargeNarrative: null,
      noDischargeObservedCondition: null,
      noDischargeObstructionObserved: false,
      noDischargeObstructionDetails: null,
      accessIssueType: 'locked_gate',
      accessIssueObstructionNarrative: 'Gate chained',
      accessIssueContactAttempted: true,
      accessIssueContactName: 'Guard',
      accessIssueContactOutcome: 'No answer',
      actorName: 'Sampler',
    });

    const merged = mergeVisitWithQueuedCompletion(visit);
    expect(merged.visit_status).toBe('completed');
    expect(merged.outcome).toBe('access_issue');
    expect(merged.completed_latitude).toBe(38.2);
    expect(merged.weather_conditions).toBe('Rain');
    expect(merged.potential_force_majeure).toBe(true);
  });

  it('mergeVisitWithQueuedLifecycle prefers queued completion over start', () => {
    const visit = {
      id: 'v1',
      visit_status: 'assigned' as const,
      started_at: null,
      outcome: null,
      completed_at: null,
      started_latitude: null,
      started_longitude: null,
      completed_latitude: null,
      completed_longitude: null,
      weather_conditions: null,
      field_notes: null,
      potential_force_majeure: false,
      potential_force_majeure_notes: null,
      permit_number: 'P1',
      outfall_number: 'O1',
      assigned_to_name: 'A',
      route_stop_sequence: null,
    } as FieldVisitListItem;

    enqueueFieldVisitStart({
      id: 's1',
      visitId: 'v1',
      startedAt: '2026-03-31T12:00:00.000Z',
      latitude: 1,
      longitude: 2,
    });
    enqueueFieldVisitComplete({
      id: 'fc2',
      visitId: 'v1',
      outcome: 'sample_collected',
      completedAt: '2026-03-31T14:00:00.000Z',
      completedLatitude: 3,
      completedLongitude: 4,
      weatherConditions: null,
      fieldNotes: null,
      potentialForceMajeure: false,
      potentialForceMajeureNotes: null,
      noDischargeNarrative: null,
      noDischargeObservedCondition: null,
      noDischargeObstructionObserved: false,
      noDischargeObstructionDetails: null,
      accessIssueType: null,
      accessIssueObstructionNarrative: null,
      accessIssueContactAttempted: false,
      accessIssueContactName: null,
      accessIssueContactOutcome: null,
      actorName: 'Sampler',
    });

    const merged = mergeVisitWithQueuedLifecycle(visit);
    expect(merged.visit_status).toBe('completed');
    expect(merged.started_latitude).toBe(1);
    expect(merged.completed_latitude).toBe(3);
  });

  it('mergeMeasurementsWithQueuedCoc replaces server CoC row', () => {
    const serverCoc: FieldMeasurementRecord = {
      id: 'db-coc',
      field_visit_id: 'v1',
      parameter_name: FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER,
      measured_text: 'OLD',
      measured_value: null,
      unit: null,
      measured_at: '2026-01-01T00:00:00.000Z',
      metadata: {},
      created_by: 'u',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const ph: FieldMeasurementRecord = {
      id: 'm1',
      field_visit_id: 'v1',
      parameter_name: 'pH',
      measured_text: null,
      measured_value: 7,
      unit: null,
      measured_at: '2026-01-02T00:00:00.000Z',
      metadata: {},
      created_by: 'u',
      created_at: '2026-01-02T00:00:00.000Z',
    };
    expect(mergeMeasurementsWithQueuedCoc('v1', 'u', [serverCoc, ph])).toEqual([serverCoc, ph]);
    enqueueCocPrimaryUpsert({
      id: 'c1',
      visitId: 'v1',
      containerText: 'NEW-JAR',
      preservativeConfirmed: true,
    });
    const merged = mergeMeasurementsWithQueuedCoc('v1', 'u', [serverCoc, ph]);
    expect(merged.some((m) => m.measured_text === 'OLD')).toBe(false);
    const coc = merged.find((m) => m.parameter_name === FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER);
    expect(coc?.measured_text).toBe('NEW-JAR');
    expect(coc?.metadata?.preservative_confirmed).toBe(true);
  });

  it('processFieldOutboundQueue processes coc_primary_upsert insert', async () => {
    enqueueCocPrimaryUpsert({
      id: 'c1',
      visitId: 'v1',
      containerText: 'JAR-9',
      preservativeConfirmed: true,
    });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
      insert,
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }));
    const fake = { from } as unknown as SupabaseClient;
    const result = await processFieldOutboundQueue(fake);
    expect(result.failed).toBeNull();
    expect(result.processed).toBe(1);
    expect(insert).toHaveBeenCalled();
  });

  it('processFieldOutboundQueue processes coc_primary_upsert update', async () => {
    localStorage.clear();
    enqueueCocPrimaryUpsert({
      id: 'c2',
      visitId: 'v1',
      containerText: 'JAR-UPD',
      preservativeConfirmed: false,
    });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'existing-row' }, error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn();
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
      insert,
      update: () => ({ eq: updateEq }),
    }));
    const fake = { from } as unknown as SupabaseClient;
    const result = await processFieldOutboundQueue(fake);
    expect(result.failed).toBeNull();
    expect(insert).not.toHaveBeenCalled();
    expect(updateEq).toHaveBeenCalledWith('id', 'existing-row');
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

  it('processFieldOutboundQueue processes field_visit_complete via rpc', async () => {
    enqueueFieldVisitComplete({
      id: 'fc3',
      visitId: 'v1',
      outcome: 'no_discharge',
      completedAt: '2026-03-31T14:00:00.000Z',
      completedLatitude: 38.3,
      completedLongitude: -81.3,
      weatherConditions: 'Cloudy',
      fieldNotes: 'Dry channel',
      potentialForceMajeure: false,
      potentialForceMajeureNotes: null,
      noDischargeNarrative: 'No flow at sample point',
      noDischargeObservedCondition: 'Dry bed',
      noDischargeObstructionObserved: true,
      noDischargeObstructionDetails: 'Debris',
      accessIssueType: null,
      accessIssueObstructionNarrative: null,
      accessIssueContactAttempted: false,
      accessIssueContactName: null,
      accessIssueContactOutcome: null,
      actorName: 'Sampler',
    });

    const rpc = vi.fn().mockResolvedValue({ data: { governance_issue_id: null }, error: null });
    const fake = { rpc } as unknown as SupabaseClient;
    const result = await processFieldOutboundQueue(fake);

    expect(result.failed).toBeNull();
    expect(result.processed).toBe(1);
    expect(rpc).toHaveBeenCalledWith('complete_field_visit', expect.objectContaining({
      p_field_visit_id: 'v1',
      p_outcome: 'no_discharge',
      p_no_discharge_narrative: 'No flow at sample point',
      p_actor_name: 'Sampler',
    }));
  });
});

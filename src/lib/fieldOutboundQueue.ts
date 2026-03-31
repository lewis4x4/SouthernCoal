import type { SupabaseClient } from '@supabase/supabase-js';
import type { FieldMeasurementRecord, FieldVisitListItem, OutletInspectionRecord } from '@/types';

const STORAGE_KEY = 'scc.fieldOutboundQueue.v1';

const FLOW_STATUSES = new Set(['flowing', 'no_flow', 'obstructed', 'unknown']);

export type FieldOutboundOp =
  | {
      kind: 'field_measurement_insert';
      id: string;
      visitId: string;
      parameterName: string;
      measuredValue: number | null;
      measuredText: string | null;
      unit: string | null;
      enqueuedAt: string;
    }
  | {
      kind: 'outlet_inspection_upsert';
      id: string;
      visitId: string;
      flowStatus: 'flowing' | 'no_flow' | 'obstructed' | 'unknown';
      signageCondition: string | null;
      pipeCondition: string | null;
      erosionObserved: boolean;
      obstructionObserved: boolean;
      obstructionDetails: string | null;
      inspectorNotes: string | null;
      enqueuedAt: string;
    }
  | {
      kind: 'field_visit_start';
      id: string;
      visitId: string;
      startedAt: string;
      latitude: number;
      longitude: number;
      enqueuedAt: string;
    };

function isMeasurementInsertOp(
  o: Record<string, unknown>,
): o is Extract<FieldOutboundOp, { kind: 'field_measurement_insert' }> {
  return (
    o.kind === 'field_measurement_insert' &&
    typeof o.id === 'string' &&
    typeof o.visitId === 'string' &&
    typeof o.parameterName === 'string' &&
    typeof o.enqueuedAt === 'string'
  );
}

function isNullableString(v: unknown): v is string | null {
  return typeof v === 'string' || v === null;
}

function isFieldVisitStartOp(
  o: Record<string, unknown>,
): o is Extract<FieldOutboundOp, { kind: 'field_visit_start' }> {
  return (
    o.kind === 'field_visit_start' &&
    typeof o.id === 'string' &&
    typeof o.visitId === 'string' &&
    typeof o.startedAt === 'string' &&
    typeof o.enqueuedAt === 'string' &&
    typeof o.latitude === 'number' &&
    Number.isFinite(o.latitude) &&
    typeof o.longitude === 'number' &&
    Number.isFinite(o.longitude)
  );
}

function isOutletInspectionUpsertOp(
  o: Record<string, unknown>,
): o is Extract<FieldOutboundOp, { kind: 'outlet_inspection_upsert' }> {
  return (
    o.kind === 'outlet_inspection_upsert' &&
    typeof o.id === 'string' &&
    typeof o.visitId === 'string' &&
    typeof o.flowStatus === 'string' &&
    FLOW_STATUSES.has(o.flowStatus) &&
    typeof o.enqueuedAt === 'string' &&
    typeof o.erosionObserved === 'boolean' &&
    typeof o.obstructionObserved === 'boolean' &&
    isNullableString(o.signageCondition) &&
    isNullableString(o.pipeCondition) &&
    isNullableString(o.obstructionDetails) &&
    isNullableString(o.inspectorNotes)
  );
}

function isOutboundOp(v: unknown): v is FieldOutboundOp {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const k = o.kind;
  if (k === 'field_measurement_insert') return isMeasurementInsertOp(o);
  if (k === 'outlet_inspection_upsert') return isOutletInspectionUpsertOp(o);
  if (k === 'field_visit_start') return isFieldVisitStartOp(o);
  return false;
}

function parseQueue(raw: string | null): FieldOutboundOp[] {
  if (raw == null || raw === '') return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(isOutboundOp);
  } catch {
    return [];
  }
}

function readQueue(): FieldOutboundOp[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return parseQueue(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeQueue(ops: FieldOutboundOp[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
    return true;
  } catch {
    return false;
  }
}

export function getFieldOutboundQueue(): FieldOutboundOp[] {
  return readQueue();
}

export function getFieldOutboundQueueLength(): number {
  return readQueue().length;
}

export function getPendingMeasurementInsertsForVisit(
  visitId: string,
): Extract<FieldOutboundOp, { kind: 'field_measurement_insert' }>[] {
  return readQueue().filter(
    (op): op is Extract<FieldOutboundOp, { kind: 'field_measurement_insert' }> =>
      op.kind === 'field_measurement_insert' && op.visitId === visitId,
  );
}

export function enqueueFieldMeasurementInsert(params: {
  id: string;
  visitId: string;
  parameterName: string;
  measuredValue?: number | null;
  measuredText?: string | null;
  unit?: string | null;
}): boolean {
  const queue = readQueue();
  queue.push({
    kind: 'field_measurement_insert',
    id: params.id,
    visitId: params.visitId,
    parameterName: params.parameterName,
    measuredValue: params.measuredValue ?? null,
    measuredText: params.measuredText ?? null,
    unit: params.unit ?? null,
    enqueuedAt: new Date().toISOString(),
  });
  return writeQueue(queue);
}

export function enqueueOutletInspectionUpsert(params: {
  id: string;
  visitId: string;
  flowStatus: 'flowing' | 'no_flow' | 'obstructed' | 'unknown';
  signageCondition: string | null;
  pipeCondition: string | null;
  erosionObserved: boolean;
  obstructionObserved: boolean;
  obstructionDetails: string | null;
  inspectorNotes: string | null;
}): boolean {
  const queue = readQueue();
  queue.push({
    kind: 'outlet_inspection_upsert',
    id: params.id,
    visitId: params.visitId,
    flowStatus: params.flowStatus,
    signageCondition: params.signageCondition,
    pipeCondition: params.pipeCondition,
    erosionObserved: params.erosionObserved,
    obstructionObserved: params.obstructionObserved,
    obstructionDetails: params.obstructionDetails,
    inspectorNotes: params.inspectorNotes,
    enqueuedAt: new Date().toISOString(),
  });
  return writeQueue(queue);
}

export function enqueueFieldVisitStart(params: {
  id: string;
  visitId: string;
  startedAt: string;
  latitude: number;
  longitude: number;
}): boolean {
  const queue = readQueue();
  queue.push({
    kind: 'field_visit_start',
    id: params.id,
    visitId: params.visitId,
    startedAt: params.startedAt,
    latitude: params.latitude,
    longitude: params.longitude,
    enqueuedAt: new Date().toISOString(),
  });
  return writeQueue(queue);
}

function getLatestPendingStartForVisit(
  visitId: string,
): Extract<FieldOutboundOp, { kind: 'field_visit_start' }> | null {
  const ops = readQueue().filter(
    (op): op is Extract<FieldOutboundOp, { kind: 'field_visit_start' }> =>
      op.kind === 'field_visit_start' && op.visitId === visitId,
  );
  if (ops.length === 0) return null;
  return ops[ops.length - 1]!;
}

/** Overlay queued start onto visit row for detail UI (latest wins; replay FIFO). */
export function mergeVisitWithQueuedStart<V extends FieldVisitListItem>(visit: V): V {
  const pending = getLatestPendingStartForVisit(visit.id);
  if (!pending) return visit;
  return {
    ...visit,
    visit_status: 'in_progress',
    started_at: pending.startedAt,
    started_latitude: pending.latitude,
    started_longitude: pending.longitude,
  };
}

export function optimisticMeasurementsFromQueue(
  visitId: string,
  userId: string | null,
): FieldMeasurementRecord[] {
  return getPendingMeasurementInsertsForVisit(visitId).map((op) => ({
    id: `local-${op.id}`,
    field_visit_id: visitId,
    parameter_name: op.parameterName,
    measured_value: op.measuredValue,
    measured_text: op.measuredText,
    unit: op.unit,
    measured_at: op.enqueuedAt,
    metadata: { outbound_queue_id: op.id, pending_sync: true },
    created_by: userId ?? '',
    created_at: op.enqueuedAt,
  }));
}

/** Latest pending inspection upsert for visit wins for UI overlay (replay still FIFO). */
export function mergeOutletInspectionWithQueue(
  visitId: string,
  server: OutletInspectionRecord | null,
  userId: string | null,
): OutletInspectionRecord | null {
  const ops = readQueue().filter(
    (op): op is Extract<FieldOutboundOp, { kind: 'outlet_inspection_upsert' }> =>
      op.kind === 'outlet_inspection_upsert' && op.visitId === visitId,
  );
  if (ops.length === 0) return server;
  const last = ops[ops.length - 1]!;
  const now = last.enqueuedAt;
  return {
    id: `local-${last.id}`,
    field_visit_id: visitId,
    flow_status: last.flowStatus,
    signage_condition: last.signageCondition,
    pipe_condition: last.pipeCondition,
    erosion_observed: last.erosionObserved,
    obstruction_observed: last.obstructionObserved,
    obstruction_details: last.obstructionDetails,
    inspector_notes: last.inspectorNotes,
    created_by: userId ?? server?.created_by ?? '',
    created_at: server?.created_at ?? now,
    updated_at: now,
  };
}

let outboundProcessChain: Promise<{ processed: number; failed: Error | null }> | null = null;

export async function processFieldOutboundQueue(
  client: SupabaseClient,
): Promise<{ processed: number; failed: Error | null }> {
  if (outboundProcessChain) {
    return outboundProcessChain;
  }

  outboundProcessChain = (async () => {
    let processed = 0;
    for (;;) {
      const queue = readQueue();
      if (queue.length === 0) {
        return { processed, failed: null };
      }
      const op = queue[0]!;
      try {
        if (op.kind === 'field_measurement_insert') {
          const { error } = await client.from('field_measurements').insert({
            field_visit_id: op.visitId,
            parameter_name: op.parameterName,
            measured_value: op.measuredValue,
            measured_text: op.measuredText,
            unit: op.unit,
          });
          if (error) throw new Error(error.message);
        } else if (op.kind === 'outlet_inspection_upsert') {
          const { error } = await client.from('outlet_inspections').upsert(
            {
              field_visit_id: op.visitId,
              flow_status: op.flowStatus,
              signage_condition: op.signageCondition,
              pipe_condition: op.pipeCondition,
              erosion_observed: op.erosionObserved,
              obstruction_observed: op.obstructionObserved,
              obstruction_details: op.obstructionDetails,
              inspector_notes: op.inspectorNotes,
            },
            { onConflict: 'field_visit_id' },
          );
          if (error) throw new Error(error.message);
        } else if (op.kind === 'field_visit_start') {
          const { error } = await client
            .from('field_visits')
            .update({
              visit_status: 'in_progress',
              started_at: op.startedAt,
              started_latitude: op.latitude,
              started_longitude: op.longitude,
            })
            .eq('id', op.visitId);
          if (error) throw new Error(error.message);
        }
        const next = queue.slice(1);
        if (!writeQueue(next)) {
          throw new Error('Failed to update outbound queue after upload');
        }
        processed += 1;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return { processed, failed: err };
      }
    }
  })();

  try {
    return await outboundProcessChain;
  } finally {
    outboundProcessChain = null;
  }
}

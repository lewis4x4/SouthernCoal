import type { SupabaseClient } from '@supabase/supabase-js';
import type { FieldMeasurementRecord } from '@/types';

const STORAGE_KEY = 'scc.fieldOutboundQueue.v1';

export type FieldOutboundOp = {
  kind: 'field_measurement_insert';
  id: string;
  visitId: string;
  parameterName: string;
  measuredValue: number | null;
  measuredText: string | null;
  unit: string | null;
  enqueuedAt: string;
};

function isOutboundOp(v: unknown): v is FieldOutboundOp {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.kind === 'field_measurement_insert' &&
    typeof o.id === 'string' &&
    typeof o.visitId === 'string' &&
    typeof o.parameterName === 'string' &&
    typeof o.enqueuedAt === 'string'
  );
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

export function getPendingMeasurementInsertsForVisit(visitId: string): FieldOutboundOp[] {
  return readQueue().filter((op) => op.kind === 'field_measurement_insert' && op.visitId === visitId);
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

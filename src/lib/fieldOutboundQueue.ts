import type { SupabaseClient } from '@supabase/supabase-js';
import { FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER } from '@/lib/fieldOpsConstants';
import type {
  AccessIssueRecord,
  FieldMeasurementRecord,
  FieldVisitListItem,
  FieldVisitOutcome,
  NoDischargeRecord,
  OutletInspectionRecord,
} from '@/types';

const STORAGE_KEY = 'scc.fieldOutboundQueue.v1';

const FLOW_STATUSES = new Set(['flowing', 'no_flow', 'obstructed', 'unknown']);
const TRANSIENT_OUTBOUND_ERROR_PATTERNS = [
  'failed to fetch',
  'fetch failed',
  'load failed',
  'networkerror',
  'network request failed',
  'network connection was lost',
  'timeout',
  'timed out',
];
const TRANSIENT_OUTBOUND_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

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
    }
  | {
      kind: 'coc_primary_upsert';
      id: string;
      visitId: string;
      containerText: string;
      preservativeConfirmed: boolean;
      enqueuedAt: string;
    }
  | {
      kind: 'field_visit_complete';
      id: string;
      visitId: string;
      outcome: FieldVisitOutcome;
      completedAt: string;
      completedLatitude: number;
      completedLongitude: number;
      weatherConditions: string | null;
      fieldNotes: string | null;
      potentialForceMajeure: boolean;
      potentialForceMajeureNotes: string | null;
      noDischargeNarrative: string | null;
      noDischargeObservedCondition: string | null;
      noDischargeObstructionObserved: boolean;
      noDischargeObstructionDetails: string | null;
      accessIssueType: string | null;
      accessIssueObstructionNarrative: string | null;
      accessIssueContactAttempted: boolean;
      accessIssueContactName: string | null;
      accessIssueContactOutcome: string | null;
      actorName: string;
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

function isCocPrimaryUpsertOp(
  o: Record<string, unknown>,
): o is Extract<FieldOutboundOp, { kind: 'coc_primary_upsert' }> {
  return (
    o.kind === 'coc_primary_upsert' &&
    typeof o.id === 'string' &&
    typeof o.visitId === 'string' &&
    typeof o.containerText === 'string' &&
    typeof o.preservativeConfirmed === 'boolean' &&
    typeof o.enqueuedAt === 'string'
  );
}

function isFieldVisitCompleteOp(
  o: Record<string, unknown>,
): o is Extract<FieldOutboundOp, { kind: 'field_visit_complete' }> {
  return (
    o.kind === 'field_visit_complete' &&
    typeof o.id === 'string' &&
    typeof o.visitId === 'string' &&
    typeof o.outcome === 'string' &&
    ['sample_collected', 'no_discharge', 'access_issue'].includes(o.outcome) &&
    typeof o.completedAt === 'string' &&
    typeof o.completedLatitude === 'number' &&
    Number.isFinite(o.completedLatitude) &&
    typeof o.completedLongitude === 'number' &&
    Number.isFinite(o.completedLongitude) &&
    typeof o.potentialForceMajeure === 'boolean' &&
    typeof o.noDischargeObstructionObserved === 'boolean' &&
    typeof o.accessIssueContactAttempted === 'boolean' &&
    typeof o.actorName === 'string' &&
    typeof o.enqueuedAt === 'string' &&
    isNullableString(o.weatherConditions) &&
    isNullableString(o.fieldNotes) &&
    isNullableString(o.potentialForceMajeureNotes) &&
    isNullableString(o.noDischargeNarrative) &&
    isNullableString(o.noDischargeObservedCondition) &&
    isNullableString(o.noDischargeObstructionDetails) &&
    isNullableString(o.accessIssueType) &&
    isNullableString(o.accessIssueObstructionNarrative) &&
    isNullableString(o.accessIssueContactName) &&
    isNullableString(o.accessIssueContactOutcome)
  );
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
  if (k === 'coc_primary_upsert') return isCocPrimaryUpsertOp(o);
  if (k === 'field_visit_complete') return isFieldVisitCompleteOp(o);
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

function mergeQueueById(existing: FieldOutboundOp[], incoming: FieldOutboundOp[]): FieldOutboundOp[] {
  if (incoming.length === 0) return existing;
  const merged = [...existing];
  const seen = new Set(existing.map((op) => op.id));
  for (const op of incoming) {
    if (seen.has(op.id)) continue;
    merged.push(op);
    seen.add(op.id);
  }
  return merged;
}

function updateQueue(mutator: (latest: FieldOutboundOp[]) => FieldOutboundOp[]): boolean {
  const latest = readQueue();
  const next = mutator(latest);
  return writeQueue(next);
}

export function getFieldOutboundQueue(): FieldOutboundOp[] {
  return readQueue();
}

export function shouldQueueFieldOutboundFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeStatus = 'status' in error ? Number(error.status) : NaN;
    if (Number.isFinite(maybeStatus) && TRANSIENT_OUTBOUND_STATUS_CODES.has(maybeStatus)) {
      return true;
    }
  }

  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';

  const normalized = message.toLowerCase();
  return TRANSIENT_OUTBOUND_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function getFieldOutboundQueueLength(): number {
  return readQueue().length;
}

export function countOutboundQueueOpsForVisit(visitId: string): number {
  return readQueue().filter((op) => op.visitId === visitId).length;
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
  const op: FieldOutboundOp = {
    kind: 'field_measurement_insert',
    id: params.id,
    visitId: params.visitId,
    parameterName: params.parameterName,
    measuredValue: params.measuredValue ?? null,
    measuredText: params.measuredText ?? null,
    unit: params.unit ?? null,
    enqueuedAt: new Date().toISOString(),
  };
  return updateQueue((latest) => mergeQueueById(latest, [op]));
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
  const op: FieldOutboundOp = {
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
  };
  return updateQueue((latest) => mergeQueueById(latest, [op]));
}

export function enqueueFieldVisitStart(params: {
  id: string;
  visitId: string;
  startedAt: string;
  latitude: number;
  longitude: number;
}): boolean {
  const op: FieldOutboundOp = {
    kind: 'field_visit_start',
    id: params.id,
    visitId: params.visitId,
    startedAt: params.startedAt,
    latitude: params.latitude,
    longitude: params.longitude,
    enqueuedAt: new Date().toISOString(),
  };
  return updateQueue((latest) => mergeQueueById(latest, [op]));
}

export function enqueueCocPrimaryUpsert(params: {
  id: string;
  visitId: string;
  containerText: string;
  preservativeConfirmed: boolean;
}): boolean {
  const op: FieldOutboundOp = {
    kind: 'coc_primary_upsert',
    id: params.id,
    visitId: params.visitId,
    containerText: params.containerText,
    preservativeConfirmed: params.preservativeConfirmed,
    enqueuedAt: new Date().toISOString(),
  };
  return updateQueue((latest) => mergeQueueById(latest, [op]));
}

export function enqueueFieldVisitComplete(params: {
  id: string;
  visitId: string;
  outcome: FieldVisitOutcome;
  completedAt: string;
  completedLatitude: number;
  completedLongitude: number;
  weatherConditions: string | null;
  fieldNotes: string | null;
  potentialForceMajeure: boolean;
  potentialForceMajeureNotes: string | null;
  noDischargeNarrative: string | null;
  noDischargeObservedCondition: string | null;
  noDischargeObstructionObserved: boolean;
  noDischargeObstructionDetails: string | null;
  accessIssueType: string | null;
  accessIssueObstructionNarrative: string | null;
  accessIssueContactAttempted: boolean;
  accessIssueContactName: string | null;
  accessIssueContactOutcome: string | null;
  actorName: string;
}): boolean {
  const op: FieldOutboundOp = {
    kind: 'field_visit_complete',
    id: params.id,
    visitId: params.visitId,
    outcome: params.outcome,
    completedAt: params.completedAt,
    completedLatitude: params.completedLatitude,
    completedLongitude: params.completedLongitude,
    weatherConditions: params.weatherConditions,
    fieldNotes: params.fieldNotes,
    potentialForceMajeure: params.potentialForceMajeure,
    potentialForceMajeureNotes: params.potentialForceMajeureNotes,
    noDischargeNarrative: params.noDischargeNarrative,
    noDischargeObservedCondition: params.noDischargeObservedCondition,
    noDischargeObstructionObserved: params.noDischargeObstructionObserved,
    noDischargeObstructionDetails: params.noDischargeObstructionDetails,
    accessIssueType: params.accessIssueType,
    accessIssueObstructionNarrative: params.accessIssueObstructionNarrative,
    accessIssueContactAttempted: params.accessIssueContactAttempted,
    accessIssueContactName: params.accessIssueContactName,
    accessIssueContactOutcome: params.accessIssueContactOutcome,
    actorName: params.actorName,
    enqueuedAt: new Date().toISOString(),
  };
  return updateQueue((latest) => mergeQueueById(latest, [op]));
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

function getLatestPendingCompletionForVisit(
  visitId: string,
): Extract<FieldOutboundOp, { kind: 'field_visit_complete' }> | null {
  const ops = readQueue().filter(
    (op): op is Extract<FieldOutboundOp, { kind: 'field_visit_complete' }> =>
      op.kind === 'field_visit_complete' && op.visitId === visitId,
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

export function mergeVisitWithQueuedCompletion<V extends FieldVisitListItem>(visit: V): V {
  const pending = getLatestPendingCompletionForVisit(visit.id);
  if (!pending) return visit;
  return {
    ...visit,
    visit_status: 'completed',
    outcome: pending.outcome,
    completed_at: pending.completedAt,
    completed_latitude: pending.completedLatitude,
    completed_longitude: pending.completedLongitude,
    weather_conditions: pending.weatherConditions,
    field_notes: pending.fieldNotes,
    potential_force_majeure: pending.potentialForceMajeure,
    potential_force_majeure_notes: pending.potentialForceMajeureNotes,
  };
}

export function mergeVisitWithQueuedLifecycle<V extends FieldVisitListItem>(visit: V): V {
  return mergeVisitWithQueuedCompletion(mergeVisitWithQueuedStart(visit));
}

function getLatestPendingCocForVisit(
  visitId: string,
): Extract<FieldOutboundOp, { kind: 'coc_primary_upsert' }> | null {
  const ops = readQueue().filter(
    (op): op is Extract<FieldOutboundOp, { kind: 'coc_primary_upsert' }> =>
      op.kind === 'coc_primary_upsert' && op.visitId === visitId,
  );
  if (ops.length === 0) return null;
  return ops[ops.length - 1]!;
}

/** Replace server CoC row with latest queued primary-container upsert for detail UI. */
export function mergeMeasurementsWithQueuedCoc(
  visitId: string,
  userId: string | null,
  measurements: FieldMeasurementRecord[],
): FieldMeasurementRecord[] {
  const pending = getLatestPendingCocForVisit(visitId);
  if (!pending) return measurements;
  const withoutCoc = measurements.filter(
    (m) => m.parameter_name !== FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER,
  );
  const row: FieldMeasurementRecord = {
    id: `local-${pending.id}`,
    field_visit_id: visitId,
    parameter_name: FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER,
    measured_value: null,
    measured_text: pending.containerText,
    unit: null,
    measured_at: pending.enqueuedAt,
    metadata: {
      preservative_confirmed: pending.preservativeConfirmed,
      source: 'field_visit_coc_v1',
      outbound_queue_id: pending.id,
      pending_sync: true,
    },
    created_by: userId ?? '',
    created_at: pending.enqueuedAt,
  };
  return [...withoutCoc, row].sort((a, b) =>
    (b.measured_at ?? '').localeCompare(a.measured_at ?? ''),
  );
}

export function mergeNoDischargeWithQueuedCompletion(
  visitId: string,
  server: NoDischargeRecord | null,
  userId: string | null,
): NoDischargeRecord | null {
  const pending = getLatestPendingCompletionForVisit(visitId);
  if (!pending || pending.outcome !== 'no_discharge' || !pending.noDischargeNarrative) {
    return server;
  }
  const now = pending.completedAt;
  return {
    id: server?.id ?? `local-${pending.id}`,
    field_visit_id: visitId,
    narrative: pending.noDischargeNarrative,
    observed_condition: pending.noDischargeObservedCondition,
    obstruction_observed: pending.noDischargeObstructionObserved,
    obstruction_details: pending.noDischargeObstructionDetails,
    created_by: userId ?? server?.created_by ?? '',
    created_at: server?.created_at ?? now,
    updated_at: now,
  };
}

export function mergeAccessIssueWithQueuedCompletion(
  visitId: string,
  server: AccessIssueRecord | null,
  userId: string | null,
): AccessIssueRecord | null {
  const pending = getLatestPendingCompletionForVisit(visitId);
  if (!pending || pending.outcome !== 'access_issue' || !pending.accessIssueObstructionNarrative) {
    return server;
  }
  const now = pending.completedAt;
  return {
    id: server?.id ?? `local-${pending.id}`,
    field_visit_id: visitId,
    issue_type: pending.accessIssueType ?? 'access_issue',
    obstruction_narrative: pending.accessIssueObstructionNarrative,
    contact_attempted: pending.accessIssueContactAttempted,
    contact_name: pending.accessIssueContactName,
    contact_outcome: pending.accessIssueContactOutcome,
    created_by: userId ?? server?.created_by ?? '',
    created_at: server?.created_at ?? now,
    updated_at: now,
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

export type FieldOutboundQueueFlushResult = {
  processed: number;
  failed: Error | null;
  /** First op that blocked the queue (Phase 4 diagnostics) */
  blockedOp: { kind: FieldOutboundOp['kind']; visitId: string } | null;
};

const OUTBOUND_QUEUE_LOCK = 'scc-field-outbound-queue';

let outboundProcessChain: Promise<FieldOutboundQueueFlushResult> | null = null;

async function processFieldOutboundQueueUnlocked(
  client: SupabaseClient,
): Promise<FieldOutboundQueueFlushResult> {
  let processed = 0;
  for (;;) {
    const queue = readQueue();
    if (queue.length === 0) {
      return { processed, failed: null, blockedOp: null };
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
      } else if (op.kind === 'coc_primary_upsert') {
        const metadata = {
          preservative_confirmed: op.preservativeConfirmed,
          source: 'field_visit_coc_v1',
        };
        const { data: existing, error: selectError } = await client
          .from('field_measurements')
          .select('id')
          .eq('field_visit_id', op.visitId)
          .eq('parameter_name', FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER)
          .maybeSingle();
        if (selectError) throw new Error(selectError.message);
        if (existing?.id) {
          const { error } = await client
            .from('field_measurements')
            .update({
              measured_text: op.containerText,
              measured_value: null,
              unit: null,
              metadata,
            })
            .eq('id', existing.id);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await client.from('field_measurements').insert({
            field_visit_id: op.visitId,
            parameter_name: FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER,
            measured_text: op.containerText,
            measured_value: null,
            unit: null,
            metadata,
          });
          if (error) throw new Error(error.message);
        }
      } else if (op.kind === 'field_visit_complete') {
        const { error } = await client.rpc('complete_field_visit', {
          p_field_visit_id: op.visitId,
          p_outcome: op.outcome,
          p_completed_latitude: op.completedLatitude,
          p_completed_longitude: op.completedLongitude,
          p_weather_conditions: op.weatherConditions,
          p_field_notes: op.fieldNotes,
          p_potential_force_majeure: op.potentialForceMajeure,
          p_potential_force_majeure_notes: op.potentialForceMajeureNotes,
          p_no_discharge_narrative: op.noDischargeNarrative,
          p_no_discharge_observed_condition: op.noDischargeObservedCondition,
          p_no_discharge_obstruction_observed: op.noDischargeObstructionObserved,
          p_no_discharge_obstruction_details: op.noDischargeObstructionDetails,
          p_access_issue_type: op.accessIssueType ?? 'access_issue',
          p_access_issue_obstruction_narrative: op.accessIssueObstructionNarrative,
          p_access_issue_contact_attempted: op.accessIssueContactAttempted,
          p_access_issue_contact_name: op.accessIssueContactName,
          p_access_issue_contact_outcome: op.accessIssueContactOutcome,
          p_actor_name: op.actorName,
        });
        if (error) throw new Error(error.message);
      }
      if (!updateQueue((latest) => latest.filter((queued) => queued.id !== op.id))) {
        throw new Error('Failed to update outbound queue after upload');
      }
      processed += 1;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        processed,
        failed: err,
        blockedOp: { kind: op.kind, visitId: op.visitId },
      };
    }
  }
}

async function withOutboundQueueLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) {
    return work();
  }

  return locks.request(OUTBOUND_QUEUE_LOCK, () => work());
}

export async function processFieldOutboundQueue(client: SupabaseClient): Promise<FieldOutboundQueueFlushResult> {
  if (outboundProcessChain) {
    return outboundProcessChain;
  }

  outboundProcessChain = withOutboundQueueLock(() => processFieldOutboundQueueUnlocked(client));

  try {
    return await outboundProcessChain;
  } finally {
    outboundProcessChain = null;
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  enqueueCocPrimaryUpsert,
  enqueueFieldVisitComplete,
  enqueueFieldMeasurementInsert,
  enqueueFieldVisitStart,
  enqueueOutletInspectionUpsert,
  getFieldOutboundQueueLength,
  mergeAccessIssueWithQueuedCompletion,
  mergeMeasurementsWithQueuedCoc,
  mergeNoDischargeWithQueuedCompletion,
  mergeOutletInspectionWithQueue,
  mergeVisitWithQueuedLifecycle,
  optimisticMeasurementsFromQueue,
  processFieldOutboundQueue,
  shouldQueueFieldOutboundFailure,
} from '@/lib/fieldOutboundQueue';
import {
  FIELD_DISPATCH_STATE_CODE,
  FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER,
} from '@/lib/fieldOpsConstants';
import {
  clearPersistedFieldEvidenceSyncFailures,
  persistFieldEvidenceSyncFailures,
  syncFieldEvidenceDrafts,
  type FieldEvidenceDraftSyncFailure,
} from '@/lib/fieldEvidenceDrafts';
import {
  clearStoredOutboundQueueDiagnostic,
  OUTBOUND_QUEUE_DIAGNOSTIC_CHANGED_EVENT,
  persistOutboundQueueDiagnostic,
  readStoredOutboundQueueDiagnostic,
  OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY,
} from '@/lib/fieldOutboundQueueDiagnostic';
import { loadPermitsWithStateCodes } from '@/lib/npdesPermitState';
import { getFieldSyncPendingCount } from '@/lib/fieldSyncPending';
import { findVisitInFieldRouteCacheAsync } from '@/lib/fieldRouteLocalCache';
import {
  enrichFieldVisitsWithScheduleHints,
  formatScheduledParameterLabel,
} from '@/lib/fieldVisitScheduleHints';
import { loadFieldVisitCache, saveFieldVisitCache } from '@/lib/fieldVisitLocalCache';
import { LANE_A_MILESTONE_1_ID } from '@/lib/laneAMilestone';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useUserProfile } from '@/hooks/useUserProfile';
import type {
  AccessIssueRecord,
  CompleteFieldVisitResult,
  FieldEvidenceAssetRecord,
  FieldMeasurementRecord,
  FieldOpsUser,
  FieldVisitDetails,
  FieldVisitListItem,
  FieldVisitOutcome,
  FieldVisitRecord,
  GovernanceIssueRecord,
  NoDischargeRecord,
  OutfallOption,
  OutletInspectionRecord,
  PermitOption,
} from '@/types';

interface DispatchVisitInput {
  permitId: string;
  outfallId: string;
  assignedTo: string;
  scheduledDate: string;
  fieldNotes?: string;
  samplingCalendarId?: string;
}

interface CoordinateInput {
  latitude: number;
  longitude: number;
}

interface CompletionInput {
  outcome: FieldVisitOutcome;
  completedCoords: CoordinateInput;
  weatherConditions?: string;
  fieldNotes?: string;
  potentialForceMajeure?: boolean;
  potentialForceMajeureNotes?: string;
  noDischarge?: {
    narrative: string;
    observedCondition?: string;
    obstructionObserved?: boolean;
    obstructionDetails?: string;
  };
  accessIssue?: {
    issueType?: string;
    obstructionNarrative: string;
    contactAttempted?: boolean;
    contactName?: string;
    contactOutcome?: string;
  };
}

export interface DispatchContextLoadResult {
  success: boolean;
}

export function didDispatchContextLoadSucceed(input: {
  flushFailed: Error | null;
  permitError: { message: string } | null;
  /** Fails load when `sites`/`states` resolution for permit state breaks (WV filter needs this). */
  sitesStateError: { message: string } | null;
  userError: { message: string } | null;
  visitError: { message: string } | null;
}) {
  return (
    !input.flushFailed &&
    !input.permitError &&
    !input.sitesStateError &&
    !input.userError &&
    !input.visitError
  );
}

function displayName(user: Partial<FieldOpsUser>) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.email || 'Unassigned';
}

function createOutboundOpId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function parseOutfallCoords(latitude: unknown, longitude: unknown): Pick<OutfallOption, 'latitude' | 'longitude'> {
  const lat = latitude != null ? Number(latitude) : NaN;
  const lng = longitude != null ? Number(longitude) : NaN;
  return {
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
  };
}

function fieldVisitShellFromRouteListItem(
  visitId: string,
  routeListItem: FieldVisitListItem,
  userId: string | null,
): FieldVisitDetails {
  const listItem = mergeVisitWithQueuedLifecycle(routeListItem);
  const optimistic = optimisticMeasurementsFromQueue(visitId, userId);
  const mergedMeasurements = mergeMeasurementsWithQueuedCoc(visitId, userId, [...optimistic]);
  return {
    visit: listItem,
    inspection: mergeOutletInspectionWithQueue(visitId, null, userId),
    measurements: mergedMeasurements,
    evidence: [],
    noDischarge: mergeNoDischargeWithQueuedCompletion(visitId, null, userId),
    accessIssue: mergeAccessIssueWithQueuedCompletion(visitId, null, userId),
    governanceIssues: [],
    scheduled_parameter_label: listItem.scheduled_parameter_label ?? null,
    schedule_instructions: listItem.schedule_instructions ?? null,
  };
}

export function useFieldOps() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log: auditLog } = useAuditLog();
  const organizationId = profile?.organization_id ?? null;
  const userId = user?.id ?? null;
  const actorName = displayName({
    first_name: profile?.first_name ?? undefined,
    last_name: profile?.last_name ?? undefined,
    email: user?.email ?? undefined,
  });

  const [permits, setPermits] = useState<PermitOption[]>([]);
  const [outfalls, setOutfalls] = useState<OutfallOption[]>([]);
  const [users, setUsers] = useState<FieldOpsUser[]>([]);
  const [visits, setVisits] = useState<FieldVisitListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<FieldVisitDetails | null>(null);
  const [outboundPendingCount, setOutboundPendingCount] = useState(0);
  /** Phase 4: shared across field pages via localStorage */
  const [outboundQueueDiagnostic, setOutboundQueueDiagnostic] = useState(() =>
    readStoredOutboundQueueDiagnostic(),
  );
  const lastDetailVisitIdRef = useRef<string | null>(null);
  const detailRequestIdRef = useRef(0);
  const dispatchRequestIdRef = useRef(0);
  /** Keeps flushOutboundIfOnline stable so loadDispatchContext does not churn when permit/outfall maps update. */
  const loadVisitDetailsRef = useRef<(visitId: string) => Promise<FieldVisitDetails | null>>(async () => null);

  const clearOutboundQueueDiagnostic = useCallback(() => {
    clearStoredOutboundQueueDiagnostic();
    setOutboundQueueDiagnostic(null);
  }, []);

  const refreshOutboundPendingCount = useCallback(async () => {
    try {
      const n = await getFieldSyncPendingCount();
      setOutboundPendingCount(n);
    } catch {
      setOutboundPendingCount(getFieldOutboundQueueLength());
    }
  }, []);

  const permitMap = useMemo(
    () => new Map(permits.map((permit) => [permit.id, permit])),
    [permits],
  );

  const outfallMap = useMemo(
    () => new Map(outfalls.map((outfall) => [outfall.id, outfall])),
    [outfalls],
  );

  const userMap = useMemo(
    () => new Map(users.map((fieldUser) => [fieldUser.id, fieldUser])),
    [users],
  );

  const loadVisitDetails = useCallback(async (visitId: string) => {
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    const commitDetail = (nextDetail: FieldVisitDetails | null, detailVisitId: string | null) => {
      if (detailRequestIdRef.current !== requestId) return false;
      setDetail(nextDetail);
      lastDetailVisitIdRef.current = detailVisitId;
      setDetailLoading(false);
      return true;
    };

    setDetailLoading(true);

    const cachedDetail = loadFieldVisitCache(visitId, {
      organizationId,
      viewerUserId: userId,
    });
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline && cachedDetail) {
      commitDetail(cachedDetail, visitId);
      return cachedDetail;
    }

    if (offline) {
      const routeListItem = await findVisitInFieldRouteCacheAsync(visitId, {
        viewerUserId: userId,
        organizationId,
      });
      if (routeListItem) {
        const shell = fieldVisitShellFromRouteListItem(visitId, routeListItem, userId);
        if (commitDetail(shell, visitId)) {
          saveFieldVisitCache(shell, {
            organizationId,
            viewerUserId: userId,
          });
        }
        return shell;
      }
    }

    const [
      visitRes,
      inspectionRes,
      measurementRes,
      evidenceRes,
      noDischargeRes,
      accessIssueRes,
      governanceRes,
    ] = await Promise.all([
      supabase.from('field_visits').select('*').eq('id', visitId).single(),
      supabase.from('outlet_inspections').select('*').eq('field_visit_id', visitId).maybeSingle(),
      supabase.from('field_measurements').select('*').eq('field_visit_id', visitId).order('measured_at', { ascending: false }),
      supabase.from('field_evidence_assets').select('*').eq('field_visit_id', visitId).order('created_at', { ascending: false }),
      supabase.from('no_discharge_events').select('*').eq('field_visit_id', visitId).maybeSingle(),
      supabase.from('access_issues').select('*').eq('field_visit_id', visitId).maybeSingle(),
      supabase.from('governance_issues').select('*').eq('field_visit_id', visitId).order('raised_at', { ascending: false }),
    ]);

    if (visitRes.error || !visitRes.data) {
      if (cachedDetail) {
        toast.error('Showing cached field visit copy because the live load failed');
        commitDetail(cachedDetail, visitId);
        return cachedDetail;
      }
      const routeListItem = await findVisitInFieldRouteCacheAsync(visitId, {
        viewerUserId: userId,
        organizationId,
      });
      if (routeListItem) {
        const shell = fieldVisitShellFromRouteListItem(visitId, routeListItem, userId);
        toast.error(
          'Live load failed; showing your saved route copy for this stop. Reconnect and tap Refresh when you can.',
        );
        if (commitDetail(shell, visitId)) {
          saveFieldVisitCache(shell, {
            organizationId,
            viewerUserId: userId,
          });
        }
        return shell;
      }
      toast.error(`Failed to load field visit: ${visitRes.error?.message ?? 'Not found'}`);
      commitDetail(null, null);
      return null;
    }

    const visit = visitRes.data as FieldVisitRecord;

    let routeStopSequence: number | null = null;
    let scheduledParameterLabel: string | null = null;
    let scheduleInstructions: string | null = null;
    if (visit.sampling_calendar_id) {
      const [stopRes, calRes] = await Promise.all([
        supabase
          .from('sampling_route_stops')
          .select('stop_sequence')
          .eq('calendar_id', visit.sampling_calendar_id)
          .maybeSingle(),
        supabase
          .from('sampling_calendar')
          .select('parameter_id, schedule_id')
          .eq('id', visit.sampling_calendar_id)
          .maybeSingle(),
      ]);
      if (!stopRes.error && stopRes.data) {
        routeStopSequence = stopRes.data.stop_sequence as number;
      }
      const parameterId = calRes.data?.parameter_id as string | undefined;
      const scheduleId = calRes.data?.schedule_id as string | undefined;

      const [paramRes, schedRes] = await Promise.all([
        parameterId
          ? supabase.from('parameters').select('name, short_name').eq('id', parameterId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        scheduleId
          ? supabase.from('sampling_schedules').select('instructions').eq('id', scheduleId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (!paramRes.error) {
        scheduledParameterLabel = formatScheduledParameterLabel(
          paramRes.data as { name: string | null; short_name: string | null } | null,
        );
      }
      const rawInstr = schedRes.data?.instructions;
      if (typeof rawInstr === 'string' && rawInstr.trim()) {
        scheduleInstructions = rawInstr.trim();
      }
    }

    const of = outfallMap.get(visit.outfall_id);
    const baseListItem: FieldVisitListItem = {
      ...visit,
      route_batch_id: visit.route_batch_id ?? null,
      permit_number: permitMap.get(visit.permit_id)?.permit_number ?? null,
      outfall_number: of?.outfall_number ?? null,
      outfall_latitude: of?.latitude ?? null,
      outfall_longitude: of?.longitude ?? null,
      assigned_to_name: displayName(userMap.get(visit.assigned_to) ?? {}),
      route_stop_sequence: routeStopSequence,
      scheduled_parameter_label: scheduledParameterLabel,
      schedule_instructions: scheduleInstructions,
    };
    const listItem = mergeVisitWithQueuedLifecycle(baseListItem);

    const serverMeasurements = (measurementRes.data ?? []) as FieldMeasurementRecord[];
    const optimistic = optimisticMeasurementsFromQueue(visitId, userId);
    const mergedMeasurements = [...optimistic, ...serverMeasurements].sort((a, b) =>
      (b.measured_at ?? '').localeCompare(a.measured_at ?? ''),
    );
    const measurements = mergeMeasurementsWithQueuedCoc(visitId, userId, mergedMeasurements);

    const serverInspection = (inspectionRes.data as OutletInspectionRecord | null) ?? null;
    const inspection = mergeOutletInspectionWithQueue(visitId, serverInspection, userId);

    const nextDetail: FieldVisitDetails = {
      visit: listItem,
      inspection,
      measurements,
      evidence: (evidenceRes.data ?? []) as FieldEvidenceAssetRecord[],
      noDischarge: mergeNoDischargeWithQueuedCompletion(
        visitId,
        (noDischargeRes.data as NoDischargeRecord | null) ?? null,
        userId,
      ),
      accessIssue: mergeAccessIssueWithQueuedCompletion(
        visitId,
        (accessIssueRes.data as AccessIssueRecord | null) ?? null,
        userId,
      ),
      governanceIssues: (governanceRes.data ?? []) as GovernanceIssueRecord[],
      scheduled_parameter_label: scheduledParameterLabel,
      schedule_instructions: scheduleInstructions,
    };

    if (commitDetail(nextDetail, visitId)) {
      saveFieldVisitCache(nextDetail, {
        organizationId,
        viewerUserId: userId,
      });
    }
    return nextDetail;
  }, [organizationId, outfallMap, permitMap, userId, userMap]);

  loadVisitDetailsRef.current = loadVisitDetails;

  useEffect(() => {
    if (detail) {
      saveFieldVisitCache(detail, {
        organizationId,
        viewerUserId: userId,
      });
    }
  }, [detail, organizationId, userId]);

  const flushOutboundIfOnline = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.onLine) {
      await refreshOutboundPendingCount();
      return { processed: 0, failed: null as Error | null };
    }

    const evidenceSyncResult = organizationId && userId
      ? await syncFieldEvidenceDrafts(supabase, { organizationId, userId })
      : { uploaded: 0, failures: [] as FieldEvidenceDraftSyncFailure[], syncedVisitIds: [] as string[] };

    const hadEvidenceFailures = evidenceSyncResult.failures.length > 0;
    if (hadEvidenceFailures) {
      persistFieldEvidenceSyncFailures([...evidenceSyncResult.failures]);
      const n = evidenceSyncResult.failures.length;
      const first = evidenceSyncResult.failures[0];
      if (first) {
        const partial =
          evidenceSyncResult.uploaded > 0
            ? `Uploaded ${evidenceSyncResult.uploaded} photo(s), but `
            : '';
        const more = n > 1 ? ` (${n - 1} more file${n > 1 ? 's' : ''} also failed)` : '';
        toast.error(
          `${partial}could not upload ${n} pending ${n === 1 ? 'file' : 'files'}: “${first.fileName}” — ${first.message}.${more} Queued field actions will still sync. Retry photos from the visit screen.`,
        );
      }
    } else {
      clearPersistedFieldEvidenceSyncFailures();
    }

    const flushResult = await processFieldOutboundQueue(supabase);
    await refreshOutboundPendingCount();
    const totalProcessed = evidenceSyncResult.uploaded + flushResult.processed;

    if (flushResult.failed) {
      toast.error(`Could not upload pending field data: ${flushResult.failed.message}`);
      const diag = flushResult.blockedOp
        ? {
            message: flushResult.failed.message,
            opKind: flushResult.blockedOp.kind,
            visitId: flushResult.blockedOp.visitId,
          }
        : {
            message: flushResult.failed.message,
            opKind: 'unknown',
            visitId: '—',
          };
      persistOutboundQueueDiagnostic(diag);
      setOutboundQueueDiagnostic(diag);
    } else {
      clearStoredOutboundQueueDiagnostic();
      setOutboundQueueDiagnostic(null);
    }

    if (!flushResult.failed && totalProcessed > 0 && !hadEvidenceFailures) {
      toast.success(
        `Uploaded ${totalProcessed} pending field ${totalProcessed === 1 ? 'item' : 'items'}`,
      );
    } else if (!flushResult.failed && hadEvidenceFailures && flushResult.processed > 0) {
      toast.message(
        `Synced ${flushResult.processed} queued field ${flushResult.processed === 1 ? 'action' : 'actions'}. Fix failed photo uploads when you can.`,
      );
    } else if (!flushResult.failed && hadEvidenceFailures && evidenceSyncResult.uploaded > 0 && flushResult.processed === 0) {
      toast.message(
        `Uploaded ${evidenceSyncResult.uploaded} photo(s); no queued actions remained.`,
      );
    }

    const vid = lastDetailVisitIdRef.current;
    if ((totalProcessed > 0 || evidenceSyncResult.syncedVisitIds.includes(vid ?? '')) && vid) {
      await loadVisitDetailsRef.current(vid);
    }

    return {
      processed: totalProcessed,
      failed:
        hadEvidenceFailures && evidenceSyncResult.failures[0]
          ? new Error(evidenceSyncResult.failures[0].message)
          : flushResult.failed,
    };
  }, [organizationId, userId, refreshOutboundPendingCount]);

  const loadDispatchContext = useCallback(async (
    options?: { markSuccessfulSync?: boolean },
  ): Promise<DispatchContextLoadResult> => {
    const requestId = dispatchRequestIdRef.current + 1;
    dispatchRequestIdRef.current = requestId;

    const isCurrentRequest = () => dispatchRequestIdRef.current === requestId;
    const finish = (result: DispatchContextLoadResult) => {
      if (isCurrentRequest()) {
        setLoading(false);
        if (result.success && options?.markSuccessfulSync) {
          setLastSyncedAt(new Date());
        }
      }
      return result;
    };

    const flushResult = await flushOutboundIfOnline();

    if (!organizationId) {
      return finish({ success: false });
    }

    setLoading(true);

    const [permitLoad, userRes, visitRes] = await Promise.all([
      loadPermitsWithStateCodes(supabase, {
        kind: 'field_dispatch',
        organizationId,
      }),
      supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, is_active')
        .eq('organization_id', organizationId)
        .order('email'),
      supabase
        .from('field_visits')
        .select('*')
        .eq('organization_id', organizationId)
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    if (permitLoad.permitError) {
      toast.error(`Failed to load permits: ${permitLoad.permitError.message}`);
    }
    if (permitLoad.sitesStateError) {
      toast.error(`Failed to load permit states: ${permitLoad.sitesStateError.message}`);
    }
    if (userRes.error) toast.error(`Failed to load users: ${userRes.error.message}`);
    if (visitRes.error) toast.error(`Failed to load field visits: ${visitRes.error.message}`);

    const rawPermits = permitLoad.rawPermits;
    const siteIdToState = permitLoad.siteIdToState;

    const permitRows = rawPermits
      .map((row) => ({
        id: row.id,
        permit_number: row.permit_number,
        permittee_name: row.permittee_name ?? null,
        state_code: row.site_id ? siteIdToState.get(row.site_id) ?? null : null,
      }))
      .filter((p) => p.state_code === FIELD_DISPATCH_STATE_CODE);
    const permitIds = permitRows.map((permit) => permit.id);

    let outfallRows: OutfallOption[] = [];
    if (permitIds.length > 0) {
      const outfallRes = await supabase
        .from('outfalls')
        .select('id, permit_id, outfall_number, latitude, longitude')
        .in('permit_id', permitIds)
        .order('outfall_number');

      if (outfallRes.error) {
        toast.error(
          `Failed to load ${FIELD_DISPATCH_STATE_CODE} outfalls: ${outfallRes.error.message}`,
        );
      }
      outfallRows = (outfallRes.data ?? []).map((row) => {
        const coords = parseOutfallCoords(row.latitude, row.longitude);
        return {
          id: row.id as string,
          permit_id: row.permit_id as string,
          outfall_number: row.outfall_number as string,
          ...coords,
        };
      });
    }

    const assignmentMap = new Map<string, string>();
    const userIds = ((userRes.data ?? []) as Array<{ id: string }>).map((fieldUser) => fieldUser.id);
    const assignmentRes = userIds.length > 0
      ? await supabase
          .from('user_role_assignments')
          .select('user_id, roles(name)')
          .in('user_id', userIds)
      : { data: [], error: null };

    if (!assignmentRes.error) {
      for (const assignment of assignmentRes.data ?? []) {
        const roleName =
          assignment.roles && typeof assignment.roles === 'object' && 'name' in assignment.roles
            ? String(assignment.roles.name)
            : null;

        if (roleName && !assignmentMap.has(assignment.user_id as string)) {
          assignmentMap.set(assignment.user_id as string, roleName);
        }
      }
    }

    const userRows = ((userRes.data ?? []) as Array<FieldOpsUser & { is_active?: boolean }>).map((fieldUser) => ({
      ...fieldUser,
      is_active: fieldUser.is_active ?? true,
      role_name: assignmentMap.get(fieldUser.id) ?? null,
    }));

    const visitRows = (visitRes.data ?? []) as FieldVisitRecord[];

    const calendarIds = [
      ...new Set(
        visitRows
          .map((visit) => visit.sampling_calendar_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const routeStopByCalendar = new Map<string, number>();
    if (calendarIds.length > 0) {
      const stopRes = await supabase
        .from('sampling_route_stops')
        .select('calendar_id, stop_sequence')
        .in('calendar_id', calendarIds);

      if (stopRes.error) toast.error(`Failed to load route stop order: ${stopRes.error.message}`);
      for (const row of stopRes.data ?? []) {
        const calId = row.calendar_id as string;
        const seq = row.stop_sequence as number;
        if (calId) routeStopByCalendar.set(calId, seq);
      }
    }

    const permitLookup = new Map(permitRows.map((permit) => [permit.id, permit]));
    const outfallLookup = new Map(outfallRows.map((outfall) => [outfall.id, outfall]));
    const userLookup = new Map(userRows.map((fieldUser) => [fieldUser.id, fieldUser]));

    if (!isCurrentRequest()) {
      return { success: false };
    }

    setPermits(permitRows);
    setOutfalls(outfallRows);
    setUsers(userRows);
    const mergedVisits = visitRows.map((visit) => {
      const of = outfallLookup.get(visit.outfall_id);
      return mergeVisitWithQueuedLifecycle({
        ...visit,
        route_batch_id: visit.route_batch_id ?? null,
        permit_number: permitLookup.get(visit.permit_id)?.permit_number ?? null,
        outfall_number: of?.outfall_number ?? null,
        outfall_latitude: of?.latitude ?? null,
        outfall_longitude: of?.longitude ?? null,
        assigned_to_name: displayName(userLookup.get(visit.assigned_to) ?? {}),
        route_stop_sequence: visit.sampling_calendar_id
          ? routeStopByCalendar.get(visit.sampling_calendar_id) ?? null
          : null,
      });
    });
    const withHints = await enrichFieldVisitsWithScheduleHints(mergedVisits);

    if (!isCurrentRequest()) {
      return { success: false };
    }

    setVisits(withHints);

    return finish({
      success: didDispatchContextLoadSucceed({
        flushFailed: flushResult.failed,
        permitError: permitLoad.permitError,
        sitesStateError: permitLoad.sitesStateError,
        userError: userRes.error,
        visitError: visitRes.error,
      }),
    });
  }, [organizationId, flushOutboundIfOnline]);

  const createVisit = useCallback(async (input: DispatchVisitInput) => {
    if (!organizationId || !userId) throw new Error('Missing organization context');

    const payload = {
      organization_id: organizationId,
      permit_id: input.permitId,
      outfall_id: input.outfallId,
      assigned_to: input.assignedTo,
      assigned_by: userId,
      scheduled_date: input.scheduledDate,
      field_notes: input.fieldNotes ?? null,
      sampling_calendar_id: input.samplingCalendarId ?? null,
    };

    const { data, error } = await supabase
      .from('field_visits')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await loadDispatchContext();
    return data as FieldVisitRecord;
  }, [loadDispatchContext, organizationId, userId]);

  const startVisit = useCallback(async (
    visitId: string,
    coords: CoordinateInput,
  ): Promise<{ queued: boolean }> => {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const queueLocally = (startedAt: string) => {
      const ok = enqueueFieldVisitStart({
        id: createOutboundOpId(),
        visitId,
        startedAt,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      if (!ok) throw new Error('Could not save offline — storage blocked or full');

      setDetail((prev) => {
        if (!prev || prev.visit.id !== visitId) return prev;
        return { ...prev, visit: mergeVisitWithQueuedLifecycle(prev.visit) };
      });
      void refreshOutboundPendingCount();
      return { queued: true } as const;
    };

    if (offline) {
      const startedAt = new Date().toISOString();
      return queueLocally(startedAt);
    }

    const startedAt = new Date().toISOString();
    const { error } = await supabase
      .from('field_visits')
      .update({
        visit_status: 'in_progress',
        started_at: startedAt,
        started_latitude: coords.latitude,
        started_longitude: coords.longitude,
      })
      .eq('id', visitId);

    if (error) {
      if (shouldQueueFieldOutboundFailure(error)) {
        return queueLocally(startedAt);
      }
      throw new Error(error.message);
    }

    await Promise.all([loadDispatchContext(), loadVisitDetails(visitId)]);
    return { queued: false };
  }, [loadDispatchContext, loadVisitDetails, refreshOutboundPendingCount]);

  const saveInspection = useCallback(async (
    visitId: string,
    inspection: Partial<OutletInspectionRecord>,
  ): Promise<{ queued: boolean }> => {
    const flowStatus = inspection.flow_status ?? 'unknown';
    const payload = {
      field_visit_id: visitId,
      flow_status: flowStatus,
      signage_condition: inspection.signage_condition ?? null,
      pipe_condition: inspection.pipe_condition ?? null,
      erosion_observed: inspection.erosion_observed ?? false,
      obstruction_observed: inspection.obstruction_observed ?? false,
      obstruction_details: inspection.obstruction_details ?? null,
      inspector_notes: inspection.inspector_notes ?? null,
    };

    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const queueLocally = () => {
      const opId = createOutboundOpId();

      const ok = enqueueOutletInspectionUpsert({
        id: opId,
        visitId,
        flowStatus: flowStatus as 'flowing' | 'no_flow' | 'obstructed' | 'unknown',
        signageCondition: payload.signage_condition,
        pipeCondition: payload.pipe_condition,
        erosionObserved: payload.erosion_observed,
        obstructionObserved: payload.obstruction_observed,
        obstructionDetails: payload.obstruction_details,
        inspectorNotes: payload.inspector_notes,
      });

      if (!ok) throw new Error('Could not save offline — storage blocked or full');

      const now = new Date().toISOString();
      setDetail((prev) => {
        if (!prev || prev.visit.id !== visitId) return prev;
        const nextInspection: OutletInspectionRecord = {
          id: `local-${opId}`,
          field_visit_id: visitId,
          flow_status: flowStatus as OutletInspectionRecord['flow_status'],
          signage_condition: payload.signage_condition,
          pipe_condition: payload.pipe_condition,
          erosion_observed: payload.erosion_observed,
          obstruction_observed: payload.obstruction_observed,
          obstruction_details: payload.obstruction_details,
          inspector_notes: payload.inspector_notes,
          created_by: userId ?? prev.inspection?.created_by ?? '',
          created_at: prev.inspection?.created_at ?? now,
          updated_at: now,
        };
        return { ...prev, inspection: nextInspection };
      });

      void refreshOutboundPendingCount();
      return { queued: true } as const;
    };

    if (offline) {
      return queueLocally();
    }

    const { error } = await supabase
      .from('outlet_inspections')
      .upsert(payload, { onConflict: 'field_visit_id' });

    if (error) {
      if (shouldQueueFieldOutboundFailure(error)) {
        return queueLocally();
      }
      throw new Error(error.message);
    }
    await loadVisitDetails(visitId);
    return { queued: false };
  }, [loadVisitDetails, refreshOutboundPendingCount, userId]);

  const addMeasurement = useCallback(async (visitId: string, measurement: {
    parameterName: string;
    measuredValue?: number;
    measuredText?: string;
    unit?: string;
  }): Promise<{ queued: boolean }> => {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const queueLocally = () => {
      const opId = createOutboundOpId();

      const ok = enqueueFieldMeasurementInsert({
        id: opId,
        visitId,
        parameterName: measurement.parameterName,
        measuredValue: measurement.measuredValue ?? null,
        measuredText: measurement.measuredText ?? null,
        unit: measurement.unit ?? null,
      });

      if (!ok) throw new Error('Could not save offline — storage blocked or full');

      const measuredAt = new Date().toISOString();
      setDetail((prev) => {
        if (!prev || prev.visit.id !== visitId) return prev;
        const optimistic: FieldMeasurementRecord = {
          id: `local-${opId}`,
          field_visit_id: visitId,
          parameter_name: measurement.parameterName,
          measured_value: measurement.measuredValue ?? null,
          measured_text: measurement.measuredText ?? null,
          unit: measurement.unit ?? null,
          measured_at: measuredAt,
          metadata: { outbound_queue_id: opId, pending_sync: true },
          created_by: userId ?? '',
          created_at: measuredAt,
        };
        return { ...prev, measurements: [optimistic, ...prev.measurements] };
      });

      void refreshOutboundPendingCount();
      return { queued: true } as const;
    };

    if (offline) {
      return queueLocally();
    }

    const { error } = await supabase
      .from('field_measurements')
      .insert({
        field_visit_id: visitId,
        parameter_name: measurement.parameterName,
        measured_value: measurement.measuredValue ?? null,
        measured_text: measurement.measuredText ?? null,
        unit: measurement.unit ?? null,
      });

    if (error) {
      if (shouldQueueFieldOutboundFailure(error)) {
        return queueLocally();
      }
      throw new Error(error.message);
    }
    await loadVisitDetails(visitId);
    return { queued: false };
  }, [loadVisitDetails, refreshOutboundPendingCount, userId]);

  const saveCocPrimaryContainer = useCallback(async (
    visitId: string,
    containerId: string,
    preservativeConfirmed: boolean,
  ): Promise<{ queued: boolean }> => {
    const text = containerId.trim();
    if (!text) {
      throw new Error('Primary container ID is required');
    }

    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const queueLocally = () => {
      const ok = enqueueCocPrimaryUpsert({
        id: createOutboundOpId(),
        visitId,
        containerText: text,
        preservativeConfirmed,
      });
      if (!ok) throw new Error('Could not save offline — storage blocked or full');

      setDetail((prev) => {
        if (!prev || prev.visit.id !== visitId) return prev;
        return {
          ...prev,
          measurements: mergeMeasurementsWithQueuedCoc(visitId, userId, prev.measurements),
        };
      });
      void refreshOutboundPendingCount();
      return { queued: true } as const;
    };

    if (offline) {
      return queueLocally();
    }

    try {
      const metadata = {
        preservative_confirmed: preservativeConfirmed,
        source: 'field_visit_coc_v1',
      };

      const { data: existing, error: selectError } = await supabase
        .from('field_measurements')
        .select('id')
        .eq('field_visit_id', visitId)
        .eq('parameter_name', FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER)
        .maybeSingle();

      if (selectError) throw new Error(selectError.message);

      if (existing?.id) {
        const { error } = await supabase
          .from('field_measurements')
          .update({
            measured_text: text,
            measured_value: null,
            unit: null,
            metadata,
          })
          .eq('id', existing.id);

        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('field_measurements').insert({
          field_visit_id: visitId,
          parameter_name: FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER,
          measured_text: text,
          measured_value: null,
          unit: null,
          metadata,
        });

        if (error) throw new Error(error.message);
      }
    } catch (error) {
      if (shouldQueueFieldOutboundFailure(error)) {
        return queueLocally();
      }
      throw error;
    }

    await loadVisitDetails(visitId);
    return { queued: false };
  }, [loadVisitDetails, refreshOutboundPendingCount, userId]);

  const recordEvidenceAsset = useCallback(async (input: {
    fieldVisitId: string;
    storagePath: string;
    bucket: string;
    evidenceType: FieldEvidenceAssetRecord['evidence_type'];
    coords?: CoordinateInput | null;
    governanceIssueId?: string | null;
    notes?: string;
  }) => {
    if (!organizationId || !userId) throw new Error('Missing organization context');

    const { error } = await supabase
      .from('field_evidence_assets')
      .insert({
        organization_id: organizationId,
        field_visit_id: input.fieldVisitId,
        governance_issue_id: input.governanceIssueId ?? null,
        storage_path: input.storagePath,
        bucket: input.bucket,
        evidence_type: input.evidenceType,
        uploaded_by: userId,
        latitude: input.coords?.latitude ?? null,
        longitude: input.coords?.longitude ?? null,
        notes: input.notes ?? null,
      });

    if (error) throw new Error(error.message);
    await loadVisitDetails(input.fieldVisitId);
  }, [loadVisitDetails, organizationId, userId]);

  const completeVisit = useCallback(async (
    visit: FieldVisitListItem,
    input: CompletionInput,
  ): Promise<{ queued: boolean; result: CompleteFieldVisitResult }> => {
    if (!organizationId || !userId) throw new Error('Missing organization context');
    if (!visit.started_at) throw new Error('Visit must be started before completion');
    const queueLocally = () => {
      const ok = enqueueFieldVisitComplete({
        id: createOutboundOpId(),
        visitId: visit.id,
        outcome: input.outcome,
        completedAt: new Date().toISOString(),
        completedLatitude: input.completedCoords.latitude,
        completedLongitude: input.completedCoords.longitude,
        weatherConditions: input.weatherConditions ?? null,
        fieldNotes: input.fieldNotes ?? null,
        potentialForceMajeure: input.potentialForceMajeure ?? false,
        potentialForceMajeureNotes: input.potentialForceMajeureNotes ?? null,
        noDischargeNarrative: input.noDischarge?.narrative?.trim() || null,
        noDischargeObservedCondition: input.noDischarge?.observedCondition ?? null,
        noDischargeObstructionObserved: input.noDischarge?.obstructionObserved ?? false,
        noDischargeObstructionDetails: input.noDischarge?.obstructionDetails ?? null,
        accessIssueType: input.accessIssue?.issueType ?? 'access_issue',
        accessIssueObstructionNarrative: input.accessIssue?.obstructionNarrative?.trim() || null,
        accessIssueContactAttempted: input.accessIssue?.contactAttempted ?? false,
        accessIssueContactName: input.accessIssue?.contactName ?? null,
        accessIssueContactOutcome: input.accessIssue?.contactOutcome ?? null,
        actorName,
      });
      if (!ok) throw new Error('Could not save offline — storage blocked or full');

      setDetail((prev) => {
        if (!prev || prev.visit.id !== visit.id) return prev;
        return {
          ...prev,
          visit: mergeVisitWithQueuedLifecycle(prev.visit),
          noDischarge: mergeNoDischargeWithQueuedCompletion(visit.id, prev.noDischarge, userId),
          accessIssue: mergeAccessIssueWithQueuedCompletion(visit.id, prev.accessIssue, userId),
        };
      });
      setVisits((prev) => prev.map((row) => (
        row.id === visit.id ? mergeVisitWithQueuedLifecycle(row) : row
      )));
      void refreshOutboundPendingCount();

      auditLog(
        'field_visit_completion_queued',
        {
          milestone_id: LANE_A_MILESTONE_1_ID,
          field_visit_id: visit.id,
          outcome: input.outcome,
        },
        {
          module: 'field_ops',
          tableName: 'field_visits',
          recordId: visit.id,
        },
      );

      return {
        queued: true,
        result: {
          linked_sampling_event_id: visit.linked_sampling_event_id,
          governance_issue_id: null,
        },
      } as const;
    };

    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offline) {
      return queueLocally();
    }

    const { data, error } = await supabase.rpc('complete_field_visit', {
      p_field_visit_id: visit.id,
      p_outcome: input.outcome,
      p_completed_latitude: input.completedCoords.latitude,
      p_completed_longitude: input.completedCoords.longitude,
      p_weather_conditions: input.weatherConditions ?? null,
      p_field_notes: input.fieldNotes ?? null,
      p_potential_force_majeure: input.potentialForceMajeure ?? false,
      p_potential_force_majeure_notes: input.potentialForceMajeureNotes ?? null,
      p_no_discharge_narrative: input.noDischarge?.narrative?.trim() || null,
      p_no_discharge_observed_condition: input.noDischarge?.observedCondition ?? null,
      p_no_discharge_obstruction_observed: input.noDischarge?.obstructionObserved ?? false,
      p_no_discharge_obstruction_details: input.noDischarge?.obstructionDetails ?? null,
      p_access_issue_type: input.accessIssue?.issueType ?? 'access_issue',
      p_access_issue_obstruction_narrative: input.accessIssue?.obstructionNarrative?.trim() || null,
      p_access_issue_contact_attempted: input.accessIssue?.contactAttempted ?? false,
      p_access_issue_contact_name: input.accessIssue?.contactName ?? null,
      p_access_issue_contact_outcome: input.accessIssue?.contactOutcome ?? null,
      p_actor_name: actorName,
    });

    if (error) {
      if (shouldQueueFieldOutboundFailure(error)) {
        return queueLocally();
      }
      throw new Error(error.message);
    }

    const result = (data ?? {
      linked_sampling_event_id: visit.linked_sampling_event_id,
      governance_issue_id: null,
    }) as CompleteFieldVisitResult;

    auditLog(
      'field_visit_completed',
      {
        milestone_id: LANE_A_MILESTONE_1_ID,
        field_visit_id: visit.id,
        outcome: input.outcome,
        governance_issue_id: result.governance_issue_id ?? null,
      },
      {
        module: 'field_ops',
        tableName: 'field_visits',
        recordId: visit.id,
        newValues: { outcome: input.outcome, visit_status: 'completed' },
      },
    );

    await Promise.all([loadDispatchContext(), loadVisitDetails(visit.id)]);
    return {
      queued: false,
      result,
    };
  }, [actorName, auditLog, loadDispatchContext, loadVisitDetails, organizationId, refreshOutboundPendingCount, userId]);

  useEffect(() => {
    void refreshOutboundPendingCount();
  }, [refreshOutboundPendingCount]);

  useEffect(() => {
    if (organizationId) {
      loadDispatchContext({ markSuccessfulSync: true }).catch((err) => {
        console.error('[useFieldOps] Failed to load context:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to load field operations');
      });
    }
  }, [loadDispatchContext, organizationId]);

  useEffect(() => {
    const onUp = () => {
      void flushOutboundIfOnline();
    };
    window.addEventListener('online', onUp);
    return () => window.removeEventListener('online', onUp);
  }, [flushOutboundIfOnline]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY) return;
      setOutboundQueueDiagnostic(readStoredOutboundQueueDiagnostic());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onSameTab = () => {
      setOutboundQueueDiagnostic(readStoredOutboundQueueDiagnostic());
    };
    window.addEventListener(OUTBOUND_QUEUE_DIAGNOSTIC_CHANGED_EVENT, onSameTab);
    return () => window.removeEventListener(OUTBOUND_QUEUE_DIAGNOSTIC_CHANGED_EVENT, onSameTab);
  }, []);

  return {
    permits,
    outfalls,
    users,
    visits,
    loading,
    lastSyncedAt,
    outboundPendingCount,
    outboundQueueDiagnostic,
    clearOutboundQueueDiagnostic,
    detail,
    detailLoading,
    refresh: () => loadDispatchContext({ markSuccessfulSync: true }),
    refreshOutboundPendingCount,
    loadVisitDetails,
    createVisit,
    startVisit,
    saveInspection,
    addMeasurement,
    saveCocPrimaryContainer,
    recordEvidenceAsset,
    completeVisit,
  };
}

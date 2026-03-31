import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
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

function displayName(user: Partial<FieldOpsUser>) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.email || 'Unassigned';
}

export function useFieldOps() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<FieldVisitDetails | null>(null);

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

  const loadDispatchContext = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [permitRes, userRes, visitRes] = await Promise.all([
      supabase
        .from('npdes_permits')
        .select('id, permit_number, state_code, permittee_name')
        .eq('organization_id', organizationId)
        .eq('state_code', 'WV')
        .order('permit_number'),
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

    if (permitRes.error) toast.error(`Failed to load WV permits: ${permitRes.error.message}`);
    if (userRes.error) toast.error(`Failed to load users: ${userRes.error.message}`);
    if (visitRes.error) toast.error(`Failed to load field visits: ${visitRes.error.message}`);

    const permitRows = (permitRes.data ?? []) as PermitOption[];
    const permitIds = permitRows.map((permit) => permit.id);

    let outfallRows: OutfallOption[] = [];
    if (permitIds.length > 0) {
      const outfallRes = await supabase
        .from('outfalls')
        .select('id, permit_id, outfall_number')
        .in('permit_id', permitIds)
        .order('outfall_number');

      if (outfallRes.error) toast.error(`Failed to load WV outfalls: ${outfallRes.error.message}`);
      outfallRows = (outfallRes.data ?? []) as OutfallOption[];
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

    const permitLookup = new Map(permitRows.map((permit) => [permit.id, permit]));
    const outfallLookup = new Map(outfallRows.map((outfall) => [outfall.id, outfall]));
    const userLookup = new Map(userRows.map((fieldUser) => [fieldUser.id, fieldUser]));

    setPermits(permitRows);
    setOutfalls(outfallRows);
    setUsers(userRows);
    setVisits(
      visitRows.map((visit) => ({
        ...visit,
        permit_number: permitLookup.get(visit.permit_id)?.permit_number ?? null,
        outfall_number: outfallLookup.get(visit.outfall_id)?.outfall_number ?? null,
        assigned_to_name: displayName(userLookup.get(visit.assigned_to) ?? {}),
      })),
    );
    setLoading(false);
  }, [organizationId]);

  const loadVisitDetails = useCallback(async (visitId: string) => {
    setDetailLoading(true);

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
      toast.error(`Failed to load field visit: ${visitRes.error?.message ?? 'Not found'}`);
      setDetail(null);
      setDetailLoading(false);
      return null;
    }

    const visit = visitRes.data as FieldVisitRecord;
    const listItem: FieldVisitListItem = {
      ...visit,
      permit_number: permitMap.get(visit.permit_id)?.permit_number ?? null,
      outfall_number: outfallMap.get(visit.outfall_id)?.outfall_number ?? null,
      assigned_to_name: displayName(userMap.get(visit.assigned_to) ?? {}),
    };

    const nextDetail: FieldVisitDetails = {
      visit: listItem,
      inspection: (inspectionRes.data as OutletInspectionRecord | null) ?? null,
      measurements: (measurementRes.data ?? []) as FieldMeasurementRecord[],
      evidence: (evidenceRes.data ?? []) as FieldEvidenceAssetRecord[],
      noDischarge: (noDischargeRes.data as NoDischargeRecord | null) ?? null,
      accessIssue: (accessIssueRes.data as AccessIssueRecord | null) ?? null,
      governanceIssues: (governanceRes.data ?? []) as GovernanceIssueRecord[],
    };

    setDetail(nextDetail);
    setDetailLoading(false);
    return nextDetail;
  }, [outfallMap, permitMap, userMap]);

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

  const startVisit = useCallback(async (visitId: string, coords: CoordinateInput) => {
    const { error } = await supabase
      .from('field_visits')
      .update({
        visit_status: 'in_progress',
        started_at: new Date().toISOString(),
        started_latitude: coords.latitude,
        started_longitude: coords.longitude,
      })
      .eq('id', visitId);

    if (error) throw new Error(error.message);

    await Promise.all([loadDispatchContext(), loadVisitDetails(visitId)]);
  }, [loadDispatchContext, loadVisitDetails]);

  const saveInspection = useCallback(async (visitId: string, inspection: Partial<OutletInspectionRecord>) => {
    const payload = {
      field_visit_id: visitId,
      flow_status: inspection.flow_status ?? 'unknown',
      signage_condition: inspection.signage_condition ?? null,
      pipe_condition: inspection.pipe_condition ?? null,
      erosion_observed: inspection.erosion_observed ?? false,
      obstruction_observed: inspection.obstruction_observed ?? false,
      obstruction_details: inspection.obstruction_details ?? null,
      inspector_notes: inspection.inspector_notes ?? null,
    };

    const { error } = await supabase
      .from('outlet_inspections')
      .upsert(payload, { onConflict: 'field_visit_id' });

    if (error) throw new Error(error.message);
    await loadVisitDetails(visitId);
  }, [loadVisitDetails]);

  const addMeasurement = useCallback(async (visitId: string, measurement: {
    parameterName: string;
    measuredValue?: number;
    measuredText?: string;
    unit?: string;
  }) => {
    const { error } = await supabase
      .from('field_measurements')
      .insert({
        field_visit_id: visitId,
        parameter_name: measurement.parameterName,
        measured_value: measurement.measuredValue ?? null,
        measured_text: measurement.measuredText ?? null,
        unit: measurement.unit ?? null,
      });

    if (error) throw new Error(error.message);
    await loadVisitDetails(visitId);
  }, [loadVisitDetails]);

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

  const completeVisit = useCallback(async (visit: FieldVisitListItem, input: CompletionInput) => {
    if (!organizationId || !userId) throw new Error('Missing organization context');
    if (!visit.started_at) throw new Error('Visit must be started before completion');
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

    if (error) throw new Error(error.message);

    await Promise.all([loadDispatchContext(), loadVisitDetails(visit.id)]);
    return (data ?? {
      linked_sampling_event_id: visit.linked_sampling_event_id,
      governance_issue_id: null,
    }) as CompleteFieldVisitResult;
  }, [actorName, loadDispatchContext, loadVisitDetails, organizationId, userId]);

  useEffect(() => {
    if (organizationId) {
      loadDispatchContext().catch((err) => {
        console.error('[useFieldOps] Failed to load context:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to load field operations');
      });
    }
  }, [loadDispatchContext, organizationId]);

  return {
    permits,
    outfalls,
    users,
    visits,
    loading,
    detail,
    detailLoading,
    refresh: loadDispatchContext,
    loadVisitDetails,
    createVisit,
    startVisit,
    saveInspection,
    addMeasurement,
    recordEvidenceAsset,
    completeVisit,
  };
}

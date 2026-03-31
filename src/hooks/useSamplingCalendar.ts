import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import type {
  ParameterOption,
  SamplingCalendarRecord,
  SamplingRouteBatchRecord,
  SamplingRouteStopRecord,
  SamplingScheduleRecord,
} from '@/types';

interface CreateScheduleInput {
  permitId: string;
  outfallId: string;
  parameterId: string;
  frequencyCode: string;
  sampleType: string;
  routeZone?: string;
  defaultAssignedTo?: string;
  scheduleAnchorDate?: string;
  preferredDayOfWeek?: number;
  preferredDayOfMonth?: number;
  secondaryDayOfMonth?: number;
  minDaysBetweenSamples?: number;
  instructions?: string;
}

interface CreateManualEntryInput {
  permitId: string;
  outfallId: string;
  parameterId: string;
  scheduledDate: string;
  entryType: 'manual' | 'rain_event';
  routeZone?: string;
  defaultAssignedTo?: string;
  reason?: string;
}

interface ApplyAdjustmentInput {
  calendarId: string;
  adjustmentType: 'skip' | 'reschedule' | 'makeup';
  reason: string;
  newScheduledDate?: string;
}

interface CreateRouteBatchInput {
  routeDate: string;
  routeZone: string;
  assignedTo?: string;
  notes?: string;
  calendarIds?: string[];
}

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function useSamplingCalendar(selectedMonth: string) {
  const { profile } = useUserProfile();
  const organizationId = profile?.organization_id ?? null;

  const [parameters, setParameters] = useState<ParameterOption[]>([]);
  const [schedules, setSchedules] = useState<SamplingScheduleRecord[]>([]);
  const [calendarItems, setCalendarItems] = useState<SamplingCalendarRecord[]>([]);
  const [routeBatches, setRouteBatches] = useState<SamplingRouteBatchRecord[]>([]);
  const [routeStops, setRouteStops] = useState<SamplingRouteStopRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);

  const loadCalendarData = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { start, end } = monthRange(selectedMonth);

    const [parameterRes, scheduleRes, routeBatchRes] = await Promise.all([
      supabase
        .from('parameters')
        .select('id, name, short_name, default_unit')
        .order('name'),
      supabase
        .from('sampling_schedules')
        .select('*')
        .eq('organization_id', organizationId)
        .order('permit_id')
        .order('outfall_id'),
      supabase
        .from('sampling_route_batches')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('route_date', start)
        .lte('route_date', end)
        .order('route_date')
        .order('created_at'),
    ]);

    if (parameterRes.error) toast.error(`Failed to load parameters: ${parameterRes.error.message}`);
    if (scheduleRes.error) toast.error(`Failed to load sampling schedules: ${scheduleRes.error.message}`);
    if (routeBatchRes.error) toast.error(`Failed to load route batches: ${routeBatchRes.error.message}`);

    await supabase.rpc('refresh_sampling_calendar_statuses', {
      p_organization_id: organizationId,
      p_as_of: new Date().toISOString().slice(0, 10),
    });

    const calendarRes = await supabase
      .from('sampling_calendar')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date')
      .order('created_at');

    if (calendarRes.error) toast.error(`Failed to load sampling calendar: ${calendarRes.error.message}`);

    const routeBatchRows = (routeBatchRes.data ?? []) as SamplingRouteBatchRecord[];
    const routeBatchIds = routeBatchRows.map((batch) => batch.id);

    const routeStopRes = routeBatchIds.length > 0
      ? await supabase
          .from('sampling_route_stops')
          .select('*')
          .in('route_batch_id', routeBatchIds)
          .order('stop_sequence')
      : { data: [], error: null };

    if (routeStopRes.error) toast.error(`Failed to load route stops: ${routeStopRes.error.message}`);

    setParameters((parameterRes.data ?? []) as ParameterOption[]);
    setSchedules((scheduleRes.data ?? []) as SamplingScheduleRecord[]);
    setCalendarItems((calendarRes.data ?? []) as SamplingCalendarRecord[]);
    setRouteBatches(routeBatchRows);
    setRouteStops((routeStopRes.data ?? []) as SamplingRouteStopRecord[]);
    setLoading(false);
  }, [organizationId, selectedMonth]);

  const createSchedule = useCallback(async (input: CreateScheduleInput) => {
    if (!organizationId) throw new Error('Missing organization context');

    setMutating(true);

    const payload = {
      organization_id: organizationId,
      permit_id: input.permitId,
      outfall_id: input.outfallId,
      parameter_id: input.parameterId,
      frequency_code: input.frequencyCode,
      frequency_description: input.frequencyCode.replace(/_/g, ' '),
      sample_type: input.sampleType,
      route_zone: input.routeZone || null,
      default_assigned_to: input.defaultAssignedTo || null,
      schedule_anchor_date: input.scheduleAnchorDate || null,
      preferred_day_of_week: Number.isInteger(input.preferredDayOfWeek) ? input.preferredDayOfWeek : null,
      preferred_day_of_month: Number.isInteger(input.preferredDayOfMonth) ? input.preferredDayOfMonth : null,
      secondary_day_of_month: Number.isInteger(input.secondaryDayOfMonth) ? input.secondaryDayOfMonth : null,
      min_days_between_samples: typeof input.minDaysBetweenSamples === 'number' ? input.minDaysBetweenSamples : null,
      instructions: input.instructions || null,
      source: 'manual',
      is_active: true,
    };

    const { error } = await supabase
      .from('sampling_schedules')
      .insert(payload);

    setMutating(false);

    if (error) throw new Error(error.message);
    await loadCalendarData();
  }, [loadCalendarData, organizationId]);

  const generateMonth = useCallback(async () => {
    setMutating(true);

    const { data, error } = await supabase.rpc('generate_sampling_calendar', {
      p_month_start: `${selectedMonth}-01`,
      p_organization_id: organizationId,
    });

    setMutating(false);

    if (error) throw new Error(error.message);
    await loadCalendarData();
    return data as { generated_count?: number; skipped_schedule_count?: number } | null;
  }, [loadCalendarData, organizationId, selectedMonth]);

  const createManualEntry = useCallback(async (input: CreateManualEntryInput) => {
    setMutating(true);

    const { error } = await supabase.rpc('create_manual_sampling_calendar_entry', {
      p_permit_id: input.permitId,
      p_outfall_id: input.outfallId,
      p_parameter_id: input.parameterId,
      p_scheduled_date: input.scheduledDate,
      p_entry_type: input.entryType,
      p_route_zone: input.routeZone || null,
      p_default_assigned_to: input.defaultAssignedTo || null,
      p_reason: input.reason || null,
    });

    setMutating(false);

    if (error) throw new Error(error.message);
    await loadCalendarData();
  }, [loadCalendarData]);

  const applyAdjustment = useCallback(async (input: ApplyAdjustmentInput) => {
    setMutating(true);

    const { error } = await supabase.rpc('apply_sampling_calendar_adjustment', {
      p_calendar_id: input.calendarId,
      p_adjustment_type: input.adjustmentType,
      p_reason: input.reason,
      p_new_scheduled_date: input.newScheduledDate || null,
    });

    setMutating(false);

    if (error) throw new Error(error.message);
    await loadCalendarData();
  }, [loadCalendarData]);

  const createRouteBatch = useCallback(async (input: CreateRouteBatchInput) => {
    setMutating(true);

    const { data, error } = await supabase.rpc('create_sampling_route_batch', {
      p_route_date: input.routeDate,
      p_route_zone: input.routeZone,
      p_assigned_to: input.assignedTo || null,
      p_notes: input.notes || null,
      p_calendar_ids: input.calendarIds && input.calendarIds.length > 0 ? input.calendarIds : null,
    });

    setMutating(false);

    if (error) throw new Error(error.message);
    await loadCalendarData();
    return data as { route_batch_id?: string; stop_count?: number } | null;
  }, [loadCalendarData]);

  const dispatchRouteBatch = useCallback(async (routeBatchId: string, fieldNotes?: string) => {
    setMutating(true);

    const { data, error } = await supabase.rpc('dispatch_sampling_route_batch', {
      p_route_batch_id: routeBatchId,
      p_field_notes: fieldNotes || null,
    });

    setMutating(false);

    if (error) throw new Error(error.message);
    await loadCalendarData();
    return data as { route_batch_id?: string; created_visit_count?: number } | null;
  }, [loadCalendarData]);

  useEffect(() => {
    loadCalendarData().catch((error) => {
      console.error('[useSamplingCalendar] Failed to load calendar data:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load sampling calendar');
    });
  }, [loadCalendarData]);

  return {
    parameters,
    schedules,
    calendarItems,
    routeBatches,
    routeStops,
    loading,
    mutating,
    refresh: loadCalendarData,
    createSchedule,
    generateMonth,
    createManualEntry,
    applyAdjustment,
    createRouteBatch,
    dispatchRouteBatch,
  };
}

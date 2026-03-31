import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CloudRain,
  MapPinned,
  RefreshCw,
  Route,
  Send,
  ShieldAlert,
  TimerReset,
  Waves,
} from 'lucide-react';
import { toast } from 'sonner';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useFieldOps } from '@/hooks/useFieldOps';
import { useSamplingCalendar } from '@/hooks/useSamplingCalendar';
import { supabase } from '@/lib/supabase';
import { buildRouteLegEstimates, findNonConsecutiveOutfallRepeats } from '@/lib/routePreview';
import type {
  FieldVisitStatus,
  ParameterOption,
  SamplingCalendarListItem,
  SamplingDispatchStatus,
  SamplingFrequencyCode,
  SamplingRouteBatchListItem,
  SamplingRouteBatchStatus,
  SamplingRouteStopListItem,
  SamplingScheduleListItem,
} from '@/types';

const GENERATOR_FREQUENCIES: Array<{ value: SamplingFrequencyCode; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'semi_monthly', label: 'Semi-monthly' },
];

const MANUAL_ENTRY_TYPES: Array<{ value: 'manual' | 'rain_event'; label: string }> = [
  { value: 'manual', label: 'Manual entry' },
  { value: 'rain_event', label: 'Rain event' },
];

const ADJUSTMENT_OPTIONS: Array<{ value: 'skip' | 'reschedule' | 'makeup'; label: string }> = [
  { value: 'skip', label: 'Skip' },
  { value: 'reschedule', label: 'Reschedule' },
  { value: 'makeup', label: 'Create makeup' },
];

function dispatchTone(status: SamplingDispatchStatus | SamplingRouteBatchStatus | 'pending') {
  switch (status) {
    case 'completed':
      return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
    case 'in_progress':
      return 'text-amber-300 border-amber-500/20 bg-amber-500/10';
    case 'exception':
      return 'text-red-300 border-red-500/20 bg-red-500/10';
    case 'dispatched':
      return 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10';
    case 'skipped':
    case 'cancelled':
      return 'text-slate-300 border-white/[0.08] bg-white/[0.06]';
    case 'pending':
    default:
      return 'text-violet-300 border-violet-500/20 bg-violet-500/10';
  }
}

function fieldDisplayName(user: { first_name?: string | null; last_name?: string | null; email?: string | null } | undefined) {
  const full = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return full || user?.email || 'Unassigned';
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString();
}

function daysUntil(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function urgencyRank(item: SamplingCalendarListItem) {
  const diff = daysUntil(item.scheduled_date);

  if (item.dispatch_status === 'exception') return 0;
  if (item.status === 'overdue' || diff < 0) return 1;
  if (item.dispatch_status === 'in_progress') return 2;
  if (diff === 0) return 3;
  if (diff <= 2 && item.dispatch_status === 'ready') return 4;
  if (item.dispatch_status === 'dispatched') return 5;
  if (item.dispatch_status === 'ready') return 6;
  if (item.dispatch_status === 'completed') return 8;
  if (item.dispatch_status === 'skipped') return 9;
  return 10;
}

function urgencyLabel(item: SamplingCalendarListItem) {
  const diff = daysUntil(item.scheduled_date);

  if (item.dispatch_status === 'exception') return 'Exception';
  if (item.status === 'overdue' || diff < 0) return 'Overdue';
  if (item.dispatch_status === 'in_progress') return 'In progress';
  if (diff === 0) return 'Due today';
  if (diff <= 2 && item.dispatch_status === 'ready') return 'Due soon';
  if (item.dispatch_status === 'dispatched') return 'Dispatched';
  if (item.dispatch_status === 'completed') return 'Completed';
  if (item.dispatch_status === 'skipped') return 'Skipped';
  return 'Upcoming';
}

function stopStatusFromVisit(visitStatus: FieldVisitStatus | null) {
  if (visitStatus === 'in_progress') return 'In progress';
  if (visitStatus === 'completed') return 'Completed';
  if (visitStatus === 'cancelled') return 'Cancelled';
  if (visitStatus === 'assigned') return 'Dispatched';
  return 'Pending';
}

export function FieldSchedulePage() {
  const navigate = useNavigate();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [statusFilter, setStatusFilter] = useState<'all' | SamplingDispatchStatus>('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [groupMode, setGroupMode] = useState<'day' | 'route'>('day');

  const [schedulePermitId, setSchedulePermitId] = useState('');
  const [scheduleOutfallId, setScheduleOutfallId] = useState('');
  const [scheduleParameterId, setScheduleParameterId] = useState('');
  const [frequencyCode, setFrequencyCode] = useState<SamplingFrequencyCode>('monthly');
  const [scheduleRouteZone, setScheduleRouteZone] = useState('');
  const [scheduleAssignedTo, setScheduleAssignedTo] = useState('');
  const [scheduleAnchorDate, setScheduleAnchorDate] = useState('');
  const [preferredDayOfWeek, setPreferredDayOfWeek] = useState('1');
  const [preferredDayOfMonth, setPreferredDayOfMonth] = useState('15');
  const [secondaryDayOfMonth, setSecondaryDayOfMonth] = useState('28');
  const [minDaysBetween, setMinDaysBetween] = useState('14');
  const [scheduleInstructions, setScheduleInstructions] = useState('');

  const [manualPermitId, setManualPermitId] = useState('');
  const [manualOutfallId, setManualOutfallId] = useState('');
  const [manualParameterId, setManualParameterId] = useState('');
  const [manualEntryType, setManualEntryType] = useState<'manual' | 'rain_event'>('manual');
  const [manualDate, setManualDate] = useState(today);
  const [manualRouteZone, setManualRouteZone] = useState('');
  const [manualAssignedTo, setManualAssignedTo] = useState('');
  const [manualReason, setManualReason] = useState('');

  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [dispatchAssignedTo, setDispatchAssignedTo] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'skip' | 'reschedule' | 'makeup'>('skip');
  const [adjustmentDate, setAdjustmentDate] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const [routeDate, setRouteDate] = useState(today);
  const [routeZone, setRouteZone] = useState('');
  const [routeAssignedTo, setRouteAssignedTo] = useState('');
  const [routeNotes, setRouteNotes] = useState('');
  const [selectedRouteBatchId, setSelectedRouteBatchId] = useState<string | null>(null);
  const [routeDispatchNotes, setRouteDispatchNotes] = useState('');
  const [outfallCoordById, setOutfallCoordById] = useState<Record<string, { lat: number; lng: number }>>({});

  const {
    permits,
    outfalls,
    users,
    visits,
    createVisit,
    refresh: refreshVisits,
  } = useFieldOps();

  const {
    parameters,
    schedules,
    calendarItems,
    routeBatches,
    routeStops,
    loading,
    mutating,
    refresh: refreshCalendar,
    createSchedule,
    generateMonth,
    createManualEntry,
    applyAdjustment,
    createRouteBatch,
    dispatchRouteBatch,
  } = useSamplingCalendar(selectedMonth);

  const permitMap = useMemo(() => new Map(permits.map((permit) => [permit.id, permit])), [permits]);
  const outfallMap = useMemo(() => new Map(outfalls.map((outfall) => [outfall.id, outfall])), [outfalls]);
  const parameterMap = useMemo(() => new Map(parameters.map((parameter) => [parameter.id, parameter])), [parameters]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const visitMap = useMemo(() => new Map(visits.map((visit) => [visit.id, visit])), [visits]);
  const scheduleMap = useMemo(() => new Map(schedules.map((schedule) => [schedule.id, schedule])), [schedules]);

  const scheduleItems = useMemo<SamplingScheduleListItem[]>(() => (
    schedules.map((schedule) => ({
      ...schedule,
      permit_number: permitMap.get(schedule.permit_id)?.permit_number ?? null,
      outfall_number: outfallMap.get(schedule.outfall_id)?.outfall_number ?? null,
      parameter_name: parameterMap.get(schedule.parameter_id)?.name ?? null,
      default_assigned_to_name: schedule.default_assigned_to ? fieldDisplayName(userMap.get(schedule.default_assigned_to)) : null,
    }))
  ), [outfallMap, parameterMap, permitMap, schedules, userMap]);

  const allCalendarRows = useMemo<SamplingCalendarListItem[]>(() => {
    return calendarItems.map((item) => {
      const schedule = scheduleMap.get(item.schedule_id);
      const visit = item.current_field_visit_id ? visitMap.get(item.current_field_visit_id) : null;

      return {
        ...item,
        permit_id: schedule?.permit_id ?? '',
        permit_number: schedule ? permitMap.get(schedule.permit_id)?.permit_number ?? null : null,
        outfall_number: outfallMap.get(item.outfall_id)?.outfall_number ?? null,
        parameter_name: parameterMap.get(item.parameter_id)?.name ?? null,
        frequency_code: schedule?.frequency_code ?? null,
        sample_type: schedule?.sample_type ?? null,
        instructions: schedule?.instructions ?? null,
        default_assigned_to_name: item.default_assigned_to ? fieldDisplayName(userMap.get(item.default_assigned_to)) : null,
        current_field_visit_status: visit?.visit_status ?? null,
        current_field_visit_outcome: visit?.outcome ?? null,
      };
    });
  }, [calendarItems, outfallMap, parameterMap, permitMap, scheduleMap, visitMap, userMap]);

  const calendarLookup = useMemo(
    () => new Map(allCalendarRows.map((item) => [item.id, item])),
    [allCalendarRows],
  );

  const calendarList = useMemo<SamplingCalendarListItem[]>(() => {
    return allCalendarRows
      .filter((row) => statusFilter === 'all' || row.dispatch_status === statusFilter)
      .filter((row) => zoneFilter === 'all' || (row.route_zone ?? '') === zoneFilter)
      .sort((a, b) => (
        urgencyRank(a) - urgencyRank(b)
        || a.scheduled_date.localeCompare(b.scheduled_date)
        || (a.route_zone ?? '').localeCompare(b.route_zone ?? '')
        || (a.outfall_number ?? '').localeCompare(b.outfall_number ?? '')
      ));
  }, [allCalendarRows, statusFilter, zoneFilter]);

  const groupedCalendar = useMemo(() => {
    const groups = new Map<string, SamplingCalendarListItem[]>();

    for (const item of calendarList) {
      const key = groupMode === 'route'
        ? `${item.scheduled_date}__${item.route_zone || 'Unzoned'}`
        : item.scheduled_date;
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    return Array.from(groups.entries()).map(([key, items]) => {
      const [date, zone] = key.split('__');
      return { key, date: date ?? items[0]?.scheduled_date ?? today, zone: zone ?? null, items };
    });
  }, [calendarList, groupMode, today]);

  const availableZones = useMemo(() => {
    const values = new Set<string>();
    for (const item of calendarItems) {
      if (item.route_zone) values.add(item.route_zone);
    }
    for (const schedule of schedules) {
      if (schedule.route_zone) values.add(schedule.route_zone);
    }
    return Array.from(values).sort();
  }, [calendarItems, schedules]);

  const selectedCalendar = useMemo(
    () => calendarList.find((item) => item.id === selectedCalendarId) ?? null,
    [calendarList, selectedCalendarId],
  );

  const routeBatchList = useMemo<SamplingRouteBatchListItem[]>(() => {
    return routeBatches
      .map((batch) => {
        const stops = routeStops.filter((stop) => stop.route_batch_id === batch.id);
        const dueSoonStopCount = stops.filter((stop) => {
          const calendar = calendarLookup.get(stop.calendar_id);
          if (!calendar) return false;
          const diff = daysUntil(calendar.scheduled_date);
          return diff >= 0 && diff <= 2 && calendar.dispatch_status !== 'completed';
        }).length;

        return {
          ...batch,
          assigned_to_name: batch.assigned_to ? fieldDisplayName(userMap.get(batch.assigned_to)) : null,
          stop_count: stops.length,
          completed_stop_count: stops.filter((stop) => stop.stop_status === 'completed').length,
          due_soon_stop_count: dueSoonStopCount,
        };
      })
      .sort((a, b) => (
        a.route_date.localeCompare(b.route_date)
        || a.route_zone.localeCompare(b.route_zone)
        || (a.assigned_to_name ?? '').localeCompare(b.assigned_to_name ?? '')
      ));
  }, [calendarLookup, routeBatches, routeStops, userMap]);

  const selectedRouteBatch = useMemo(
    () => routeBatchList.find((batch) => batch.id === selectedRouteBatchId) ?? null,
    [routeBatchList, selectedRouteBatchId],
  );

  const selectedRouteStops = useMemo<SamplingRouteStopListItem[]>(() => {
    if (!selectedRouteBatchId) return [];

    return routeStops
      .filter((stop) => stop.route_batch_id === selectedRouteBatchId)
      .map((stop) => {
        const calendar = calendarLookup.get(stop.calendar_id);
        const visit = calendar?.current_field_visit_id ? visitMap.get(calendar.current_field_visit_id) : null;

        return {
          ...stop,
          scheduled_date: calendar?.scheduled_date ?? '',
          route_zone: calendar?.route_zone ?? null,
          outfall_id: calendar?.outfall_id ?? null,
          permit_number: calendar?.permit_number ?? null,
          outfall_number: calendar?.outfall_number ?? null,
          parameter_name: calendar?.parameter_name ?? null,
          dispatch_status: calendar?.dispatch_status ?? 'ready',
          current_field_visit_id: calendar?.current_field_visit_id ?? null,
          current_field_visit_status: visit?.visit_status ?? null,
        };
      })
      .sort((a, b) => a.stop_sequence - b.stop_sequence);
  }, [calendarLookup, routeStops, selectedRouteBatchId, visitMap]);

  useEffect(() => {
    const ids = [
      ...new Set(
        selectedRouteStops
          .map((stop) => stop.outfall_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) {
      setOutfallCoordById({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from('outfalls')
        .select('id, latitude, longitude')
        .in('id', ids);

      if (cancelled) return;
      if (error) {
        toast.error(`Could not load outfall coordinates: ${error.message}`);
        return;
      }

      const next: Record<string, { lat: number; lng: number }> = {};
      for (const row of data ?? []) {
        const lat = row.latitude != null ? Number(row.latitude) : NaN;
        const lng = row.longitude != null ? Number(row.longitude) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          next[row.id as string] = { lat, lng };
        }
      }
      setOutfallCoordById(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRouteStops]);

  const routePreview = useMemo(() => {
    if (selectedRouteStops.length === 0) return null;
    const ordered = selectedRouteStops.map((stop) => ({
      label: `${stop.outfall_number ?? '?'} · ${stop.parameter_name ?? 'Param'}`,
      coord: stop.outfall_id ? outfallCoordById[stop.outfall_id] ?? null : null,
      outfallId: stop.outfall_id ?? '',
    }));
    const { legs, totalMinutes, missingCoordCount } = buildRouteLegEstimates(
      ordered.map(({ label, coord }) => ({ label, coord })),
    );
    const repeatIds = findNonConsecutiveOutfallRepeats(
      ordered.map((o) => o.outfallId).filter(Boolean),
    );
    const repeatLabels = repeatIds.map((id) => {
      const stop = selectedRouteStops.find((s) => s.outfall_id === id);
      return stop?.outfall_number ?? id.slice(0, 8);
    });
    return { legs, totalMinutes, missingCoordCount, repeatLabels, stopCount: selectedRouteStops.length };
  }, [selectedRouteStops, outfallCoordById]);

  const routeZoneDayBalance = useMemo(() => {
    if (!selectedRouteBatch) return null;
    const d = selectedRouteBatch.route_date;
    const zoneKey = selectedRouteBatch.route_zone || 'Unzoned';
    const sameDayReady = allCalendarRows.filter(
      (row) => row.scheduled_date === d && row.dispatch_status === 'ready',
    );
    const byZone = new Map<string, number>();
    for (const row of sameDayReady) {
      const key = row.route_zone || 'Unzoned';
      byZone.set(key, (byZone.get(key) ?? 0) + 1);
    }
    const inThisZoneUnbatched = sameDayReady.filter(
      (row) => (row.route_zone || 'Unzoned') === zoneKey && !row.current_route_batch_id,
    ).length;
    return {
      byZone,
      inThisZoneUnbatched,
      inThisBatch: selectedRouteStops.length,
      sameDayReadyTotal: sameDayReady.length,
      zoneKey,
    };
  }, [allCalendarRows, selectedRouteBatch, selectedRouteStops.length]);

  const stopOrderPriorityReview = useMemo(() => {
    if (selectedRouteStops.length < 2) return { ok: true as const, detail: null as string | null };
    const ranks = selectedRouteStops.map((stop) => stop.priority_rank);
    for (let i = 1; i < ranks.length; i += 1) {
      if ((ranks[i] as number) < (ranks[i - 1] as number)) {
        return {
          ok: false as const,
          detail: 'Later stop has higher priority than an earlier stop (rank ordering).',
        };
      }
    }
    return { ok: true as const, detail: null };
  }, [selectedRouteStops]);

  const scheduleOutfalls = useMemo(
    () => outfalls.filter((outfall) => !schedulePermitId || outfall.permit_id === schedulePermitId),
    [outfalls, schedulePermitId],
  );

  const manualOutfalls = useMemo(
    () => outfalls.filter((outfall) => !manualPermitId || outfall.permit_id === manualPermitId),
    [manualPermitId, outfalls],
  );

  const queueStats = useMemo(() => ({
    total: calendarItems.length,
    ready: calendarItems.filter((item) => item.dispatch_status === 'ready').length,
    overdue: calendarItems.filter((item) => item.status === 'overdue').length,
    dueSoon: calendarItems.filter((item) => {
      const diff = daysUntil(item.scheduled_date);
      return diff >= 0 && diff <= 2 && item.dispatch_status === 'ready';
    }).length,
  }), [calendarItems]);

  async function handleGenerateMonth() {
    try {
      const result = await generateMonth();
      toast.success(`Generated ${result?.generated_count ?? 0} calendar entries for ${selectedMonth}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate sampling calendar');
    }
  }

  async function handleCreateSchedule() {
    if (!schedulePermitId || !scheduleOutfallId || !scheduleParameterId) {
      toast.error('Permit, outfall, and parameter are required');
      return;
    }

    try {
      await createSchedule({
        permitId: schedulePermitId,
        outfallId: scheduleOutfallId,
        parameterId: scheduleParameterId,
        frequencyCode,
        sampleType: 'grab',
        routeZone: scheduleRouteZone,
        defaultAssignedTo: scheduleAssignedTo || undefined,
        scheduleAnchorDate: scheduleAnchorDate || undefined,
        preferredDayOfWeek: frequencyCode === 'weekly' ? Number(preferredDayOfWeek) : undefined,
        preferredDayOfMonth: frequencyCode !== 'weekly' ? Number(preferredDayOfMonth) : undefined,
        secondaryDayOfMonth: frequencyCode === 'semi_monthly' ? Number(secondaryDayOfMonth) : undefined,
        minDaysBetweenSamples: frequencyCode === 'semi_monthly' ? Number(minDaysBetween) : undefined,
        instructions: scheduleInstructions,
      });

      toast.success('Sampling schedule created');
      setScheduleParameterId('');
      setScheduleInstructions('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create sampling schedule');
    }
  }

  async function handleCreateManualEntry() {
    if (!manualPermitId || !manualOutfallId || !manualParameterId || !manualDate) {
      toast.error('Permit, outfall, parameter, and date are required');
      return;
    }

    try {
      await createManualEntry({
        permitId: manualPermitId,
        outfallId: manualOutfallId,
        parameterId: manualParameterId,
        scheduledDate: manualDate,
        entryType: manualEntryType,
        routeZone: manualRouteZone,
        defaultAssignedTo: manualAssignedTo || undefined,
        reason: manualReason,
      });

      toast.success(`${manualEntryType === 'rain_event' ? 'Rain event' : 'Manual'} calendar entry created`);
      setManualReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create calendar entry');
    }
  }

  async function handleDispatchSelected() {
    if (!selectedCalendar) {
      toast.error('Select a calendar item to dispatch');
      return;
    }

    if (!dispatchAssignedTo) {
      toast.error('Assigned sampler is required');
      return;
    }

    try {
      const visit = await createVisit({
        permitId: selectedCalendar.permit_id,
        outfallId: selectedCalendar.outfall_id,
        assignedTo: dispatchAssignedTo,
        scheduledDate: selectedCalendar.scheduled_date,
        fieldNotes: dispatchNotes,
        samplingCalendarId: selectedCalendar.id,
      });

      await Promise.all([refreshCalendar(), refreshVisits()]);
      toast.success('Sampling calendar item dispatched');
      navigate(`/field/visits/${visit.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to dispatch calendar item');
    }
  }

  async function handleApplyAdjustment() {
    if (!selectedCalendar) {
      toast.error('Select a calendar item first');
      return;
    }

    if (!adjustmentReason.trim()) {
      toast.error('Adjustment reason is required');
      return;
    }

    try {
      await applyAdjustment({
        calendarId: selectedCalendar.id,
        adjustmentType,
        reason: adjustmentReason.trim(),
        newScheduledDate: adjustmentType === 'skip' ? undefined : adjustmentDate || undefined,
      });

      toast.success('Sampling calendar adjustment recorded');
      setAdjustmentReason('');
      setAdjustmentDate('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply calendar adjustment');
    }
  }

  async function handleCreateRouteBatch() {
    if (!routeDate || !routeZone.trim()) {
      toast.error('Route date and route zone are required');
      return;
    }

    if (!routeAssignedTo) {
      toast.error('Route batches need an assigned sampler');
      return;
    }

    try {
      const result = await createRouteBatch({
        routeDate,
        routeZone: routeZone.trim(),
        assignedTo: routeAssignedTo,
        notes: routeNotes,
      });

      if (result?.route_batch_id) {
        setSelectedRouteBatchId(result.route_batch_id);
      }

      toast.success(`Created route batch with ${result?.stop_count ?? 0} stops`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create route batch');
    }
  }

  async function handleDispatchRouteBatch() {
    if (!selectedRouteBatch) {
      toast.error('Select a route batch first');
      return;
    }

    try {
      const result = await dispatchRouteBatch(selectedRouteBatch.id, routeDispatchNotes);
      await refreshVisits();
      toast.success(`Dispatched ${result?.created_visit_count ?? 0} route stops into field visits`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to dispatch route batch');
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Sampling Calendar
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Generate WV sampling work, build daily route batches, and dispatch approved calendar items into executable field visits.
          </p>
        </div>
        <div className="rounded-xl bg-violet-500/10 p-3">
          <CalendarDays className="h-6 w-6 text-violet-300" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <SpotlightCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-text-muted">Month workload</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{queueStats.total}</div>
          <div className="mt-2 text-sm text-text-secondary">calendar entries loaded for {selectedMonth}</div>
        </SpotlightCard>
        <SpotlightCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-text-muted">Ready to route</div>
          <div className="mt-2 text-3xl font-semibold text-cyan-300">{queueStats.ready}</div>
          <div className="mt-2 text-sm text-text-secondary">entries staged with no active field visit</div>
        </SpotlightCard>
        <SpotlightCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-text-muted">Overdue</div>
          <div className="mt-2 text-3xl font-semibold text-amber-300">{queueStats.overdue}</div>
          <div className="mt-2 text-sm text-text-secondary">sampling work past its due date</div>
        </SpotlightCard>
        <SpotlightCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-text-muted">Due soon</div>
          <div className="mt-2 text-3xl font-semibold text-violet-300">{queueStats.dueSoon}</div>
          <div className="mt-2 text-sm text-text-secondary">work due within the next two days</div>
        </SpotlightCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <SpotlightCard className="p-6" spotlightColor="rgba(168, 85, 247, 0.08)">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-violet-300" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                    Generate Monthly Calendar
                  </h2>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Build the WV work queue from active schedule rows. Manual and rain-event entries are added separately.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-violet-400/30"
                />
                <button
                  onClick={handleGenerateMonth}
                  disabled={mutating}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-500/15 px-4 py-2.5 text-sm font-medium text-violet-200 transition-colors hover:bg-violet-500/25 disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" />
                  Generate
                </button>
              </div>
            </div>
          </SpotlightCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <SpotlightCard className="p-6">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Schedule Builder
                </h2>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Permit</span>
                  <select
                    value={schedulePermitId}
                    onChange={(event) => {
                      setSchedulePermitId(event.target.value);
                      setScheduleOutfallId('');
                    }}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                  >
                    <option value="">Select permit</option>
                    {permits.map((permit) => (
                      <option key={permit.id} value={permit.id}>{permit.permit_number}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Outfall</span>
                  <select
                    value={scheduleOutfallId}
                    onChange={(event) => setScheduleOutfallId(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                  >
                    <option value="">Select outfall</option>
                    {scheduleOutfalls.map((outfall) => (
                      <option key={outfall.id} value={outfall.id}>{outfall.outfall_number}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Parameter</span>
                  <select
                    value={scheduleParameterId}
                    onChange={(event) => setScheduleParameterId(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                  >
                    <option value="">Select parameter</option>
                    {parameters.map((parameter: ParameterOption) => (
                      <option key={parameter.id} value={parameter.id}>{parameter.name}</option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Frequency</span>
                    <select
                      value={frequencyCode}
                      onChange={(event) => setFrequencyCode(event.target.value as SamplingFrequencyCode)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                    >
                      {GENERATOR_FREQUENCIES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Route zone</span>
                    <input
                      value={scheduleRouteZone}
                      onChange={(event) => setScheduleRouteZone(event.target.value)}
                      placeholder="North / Central / West"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Default assignee</span>
                    <select
                      value={scheduleAssignedTo}
                      onChange={(event) => setScheduleAssignedTo(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                    >
                      <option value="">Unassigned</option>
                      {users.filter((user) => user.is_active).map((user) => (
                        <option key={user.id} value={user.id}>{fieldDisplayName(user)}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Anchor date</span>
                    <input
                      type="date"
                      value={scheduleAnchorDate}
                      onChange={(event) => setScheduleAnchorDate(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                    />
                  </label>
                </div>

                {frequencyCode === 'weekly' ? (
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Preferred day of week</span>
                    <select
                      value={preferredDayOfWeek}
                      onChange={(event) => setPreferredDayOfWeek(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                    >
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                      <option value="0">Sunday</option>
                    </select>
                  </label>
                ) : (
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-xs font-medium text-text-muted">Primary day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={preferredDayOfMonth}
                        onChange={(event) => setPreferredDayOfMonth(event.target.value)}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-medium text-text-muted">Secondary day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={secondaryDayOfMonth}
                        onChange={(event) => setSecondaryDayOfMonth(event.target.value)}
                        disabled={frequencyCode !== 'semi_monthly'}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30 disabled:opacity-50"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-medium text-text-muted">Min days between</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={minDaysBetween}
                        onChange={(event) => setMinDaysBetween(event.target.value)}
                        disabled={frequencyCode !== 'semi_monthly'}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30 disabled:opacity-50"
                      />
                    </label>
                  </div>
                )}

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Instructions</span>
                  <textarea
                    value={scheduleInstructions}
                    onChange={(event) => setScheduleInstructions(event.target.value)}
                    rows={3}
                    placeholder="Bottle prep, route hazards, known access constraints."
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                  />
                </label>

                <button
                  onClick={handleCreateSchedule}
                  disabled={mutating}
                  className="rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
                >
                  Save sampling schedule
                </button>
              </div>
            </SpotlightCard>

            <SpotlightCard className="p-6">
              <div className="flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Manual / Rain Event Entry
                </h2>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Entry type</span>
                    <select
                      value={manualEntryType}
                      onChange={(event) => setManualEntryType(event.target.value as 'manual' | 'rain_event')}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                    >
                      {MANUAL_ENTRY_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Scheduled date</span>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={(event) => setManualDate(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Permit</span>
                  <select
                    value={manualPermitId}
                    onChange={(event) => {
                      setManualPermitId(event.target.value);
                      setManualOutfallId('');
                    }}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                  >
                    <option value="">Select permit</option>
                    {permits.map((permit) => (
                      <option key={permit.id} value={permit.id}>{permit.permit_number}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Outfall</span>
                  <select
                    value={manualOutfallId}
                    onChange={(event) => setManualOutfallId(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                  >
                    <option value="">Select outfall</option>
                    {manualOutfalls.map((outfall) => (
                      <option key={outfall.id} value={outfall.id}>{outfall.outfall_number}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Parameter</span>
                  <select
                    value={manualParameterId}
                    onChange={(event) => setManualParameterId(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                  >
                    <option value="">Select parameter</option>
                    {parameters.map((parameter) => (
                      <option key={parameter.id} value={parameter.id}>{parameter.name}</option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Route zone</span>
                    <input
                      value={manualRouteZone}
                      onChange={(event) => setManualRouteZone(event.target.value)}
                      placeholder="Optional route zone"
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">Default assignee</span>
                    <select
                      value={manualAssignedTo}
                      onChange={(event) => setManualAssignedTo(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                    >
                      <option value="">Unassigned</option>
                      {users.filter((user) => user.is_active).map((user) => (
                        <option key={user.id} value={user.id}>{fieldDisplayName(user)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Reason</span>
                  <textarea
                    value={manualReason}
                    onChange={(event) => setManualReason(event.target.value)}
                    rows={3}
                    placeholder="Why this entry exists outside the generated base calendar."
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none focus:border-amber-400/30"
                  />
                </label>

                <button
                  onClick={handleCreateManualEntry}
                  disabled={mutating}
                  className="rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-60"
                >
                  Create manual calendar entry
                </button>
              </div>
            </SpotlightCard>
          </div>

          <SpotlightCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-violet-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Generated Work Queue
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | SamplingDispatchStatus)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-violet-400/30"
                >
                  <option value="all">All statuses</option>
                  <option value="ready">Ready</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="exception">Exception</option>
                  <option value="skipped">Skipped</option>
                </select>

                <select
                  value={zoneFilter}
                  onChange={(event) => setZoneFilter(event.target.value)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-violet-400/30"
                >
                  <option value="all">All zones</option>
                  {availableZones.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>

                <select
                  value={groupMode}
                  onChange={(event) => setGroupMode(event.target.value as 'day' | 'route')}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-violet-400/30"
                >
                  <option value="day">Group by day</option>
                  <option value="route">Group by route</option>
                </select>

                <button
                  onClick={() => refreshCalendar().catch((error) => {
                    toast.error(error instanceof Error ? error.message : 'Failed to refresh sampling calendar');
                  })}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-secondary transition-colors hover:border-white/[0.12] hover:text-text-primary"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
                ))
              ) : groupedCalendar.length === 0 ? (
                <p className="text-sm text-text-muted">No sampling calendar entries exist for {selectedMonth}.</p>
              ) : (
                groupedCalendar.map((group) => (
                  <div key={group.key} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">
                          {formatDate(group.date)}
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          {group.zone ? `${group.zone} route` : `${group.items.length} scheduled items`}
                        </div>
                      </div>
                      <div className="text-xs text-text-muted">{group.items.length} stops</div>
                    </div>

                    {group.items.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setSelectedCalendarId(item.id);
                          setDispatchAssignedTo(item.default_assigned_to ?? '');
                          setDispatchNotes(item.instructions ?? '');
                          setRouteDate(item.scheduled_date);
                          setRouteZone(item.route_zone ?? '');
                          if (item.default_assigned_to) setRouteAssignedTo(item.default_assigned_to);
                        }}
                        className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                          item.id === selectedCalendarId
                            ? 'border-violet-400/40 bg-violet-500/10'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-text-primary">
                              {item.permit_number ?? 'Permit'} / {item.outfall_number ?? 'Outfall'} / {item.parameter_name ?? 'Parameter'}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted">
                              <span>{urgencyLabel(item)}</span>
                              <span>{item.route_zone || 'Unzoned'}</span>
                              <span>{item.default_assigned_to_name || 'No default assignee'}</span>
                              {item.current_route_batch_id && <span>Route batch assigned</span>}
                            </div>
                          </div>

                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${dispatchTone(item.dispatch_status)}`}>
                            {item.dispatch_status.replace('_', ' ')}
                          </span>
                        </div>

                        {(item.skip_reason || item.override_reason || item.instructions) && (
                          <p className="mt-3 line-clamp-2 text-sm text-text-secondary">
                            {item.override_reason || item.skip_reason || item.instructions}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </SpotlightCard>
        </div>

        <div className="space-y-6">
          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-violet-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Route Batch Builder
              </h2>
            </div>

            <div className="mt-5 space-y-4">
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Route date</span>
                <input
                  type="date"
                  value={routeDate}
                  onChange={(event) => setRouteDate(event.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-violet-400/30"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Route zone</span>
                <input
                  value={routeZone}
                  onChange={(event) => setRouteZone(event.target.value)}
                  placeholder="North / Central / West"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-violet-400/30"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Assigned sampler</span>
                <select
                  value={routeAssignedTo}
                  onChange={(event) => setRouteAssignedTo(event.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-violet-400/30"
                >
                  <option value="">Select assignee</option>
                  {users.filter((user) => user.is_active).map((user) => (
                    <option key={user.id} value={user.id}>{fieldDisplayName(user)}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Route notes</span>
                <textarea
                  value={routeNotes}
                  onChange={(event) => setRouteNotes(event.target.value)}
                  rows={3}
                  placeholder="Daily route context, staging notes, known access constraints."
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none focus:border-violet-400/30"
                />
              </label>

              <button
                onClick={handleCreateRouteBatch}
                disabled={mutating}
                className="w-full rounded-xl bg-violet-500/15 px-4 py-2.5 text-sm font-medium text-violet-200 transition-colors hover:bg-violet-500/25 disabled:opacity-60"
              >
                Create route batch
              </button>
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <TimerReset className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Route Review
              </h2>
            </div>

            <div className="mt-5 space-y-3">
              {routeBatchList.length === 0 ? (
                <p className="text-sm text-text-muted">No route batches exist for {selectedMonth}.</p>
              ) : (
                routeBatchList.map((batch) => (
                  <button
                    type="button"
                    key={batch.id}
                    onClick={() => {
                      setSelectedRouteBatchId(batch.id);
                      setRouteDispatchNotes(batch.notes ?? '');
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                      batch.id === selectedRouteBatchId
                        ? 'border-cyan-400/40 bg-cyan-500/10'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">
                          {formatDate(batch.route_date)} / {batch.route_zone}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted">
                          <span>Daily route · {batch.assigned_to_name || 'unassigned'}</span>
                          <span>{batch.stop_count} stops</span>
                          <span>{batch.due_soon_stop_count} due soon</span>
                        </div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${dispatchTone(batch.route_status)}`}>
                        {batch.route_status.replace('_', ' ')}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Route preview & balance
              </h2>
            </div>

            {selectedRouteBatch && routePreview ? (
              <div className="mt-5 space-y-4 text-sm">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Drive-time signal</div>
                  <p className="mt-2 text-text-secondary">
                    Straight-line segments with a road factor (~45 mph effective). Not turn-by-turn.
                  </p>
                  <div className="mt-3 text-lg font-semibold text-text-primary">
                    ~{routePreview.totalMinutes} min total
                    {routePreview.missingCoordCount > 0 && (
                      <span className="ml-2 text-xs font-normal text-amber-300">
                        ({routePreview.missingCoordCount} stop{routePreview.missingCoordCount === 1 ? '' : 's'} missing outfall coordinates)
                      </span>
                    )}
                  </div>
                  {routePreview.legs.length > 0 && (
                    <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-text-muted">
                      {routePreview.legs.map((leg) => (
                        <li key={`${leg.fromLabel}-${leg.toLabel}`}>
                          {leg.fromLabel} → {leg.toLabel}: ~{leg.minutes} min ({leg.km.toFixed(1)} km line)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Stop order review</div>
                  <p className={`mt-2 ${stopOrderPriorityReview.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {stopOrderPriorityReview.ok
                      ? 'Sequence follows non-decreasing priority rank (short-hold / due-soon ordering).'
                      : stopOrderPriorityReview.detail}
                  </p>
                  {routePreview.repeatLabels.length > 0 && (
                    <p className="mt-2 text-xs text-amber-300">
                      Same outfall appears non-consecutive: {routePreview.repeatLabels.join(', ')} — consider reordering when editing is available.
                    </p>
                  )}
                </div>

                {routeZoneDayBalance && (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">Zone / day balance</div>
                    <p className="mt-2 text-text-secondary">
                      {formatDate(selectedRouteBatch.route_date)}: {routeZoneDayBalance.sameDayReadyTotal} ready item
                      {routeZoneDayBalance.sameDayReadyTotal === 1 ? '' : 's'} org-wide. This batch holds{' '}
                      {routeZoneDayBalance.inThisBatch} in <span className="text-text-primary">{routeZoneDayBalance.zoneKey}</span>.
                    </p>
                    <p className="mt-2 text-xs text-text-muted">
                      Other ready work in same zone (not on a batch): {routeZoneDayBalance.inThisZoneUnbatched}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-text-muted">
                      {[...routeZoneDayBalance.byZone.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([zone, count]) => (
                          <li key={zone}>
                            {zone}: {count} ready
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-5 text-sm text-text-muted">Select a route batch with stops to see drive estimates and balance.</p>
            )}
          </SpotlightCard>

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Dispatch Route Batch
              </h2>
            </div>

            {selectedRouteBatch ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-sm font-semibold text-text-primary">
                    {formatDate(selectedRouteBatch.route_date)} / {selectedRouteBatch.route_zone}
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    Daily assignment · {selectedRouteBatch.assigned_to_name || 'No assignee'} • {selectedRouteBatch.stop_count} stops
                  </div>
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Dispatch notes override</span>
                  <textarea
                    value={routeDispatchNotes}
                    onChange={(event) => setRouteDispatchNotes(event.target.value)}
                    rows={3}
                    placeholder="Optional notes applied to all field visits created from this route."
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                  />
                </label>

                <button
                  onClick={handleDispatchRouteBatch}
                  disabled={mutating || selectedRouteBatch.route_status === 'completed'}
                  className="w-full rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
                >
                  Dispatch full route batch
                </button>

                <div className="space-y-3">
                  {selectedRouteStops.map((stop) => (
                    <div key={stop.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-text-primary">
                            Stop {stop.stop_sequence}: {stop.outfall_number ?? 'Outfall'} / {stop.parameter_name ?? 'Parameter'}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted">
                            <span>{stop.permit_number}</span>
                            <span>{stop.priority_reason || 'standard priority'}</span>
                            <span>{stopStatusFromVisit(stop.current_field_visit_status)}</span>
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${dispatchTone(stop.stop_status)}`}>
                          {stop.stop_status.replace('_', ' ')}
                        </span>
                      </div>

                      {stop.current_field_visit_id && (
                        <Link to={`/field/visits/${stop.current_field_visit_id}`} className="mt-3 inline-flex text-sm text-cyan-300 hover:text-cyan-200">
                          Open linked field visit
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm text-text-muted">Select a route batch to review ordered stops and dispatch it.</p>
            )}
          </SpotlightCard>

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Dispatch Selected Work
              </h2>
            </div>

            {selectedCalendar ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-sm font-semibold text-text-primary">
                    {selectedCalendar.permit_number} / {selectedCalendar.outfall_number}
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    {selectedCalendar.parameter_name} on {formatDate(selectedCalendar.scheduled_date)}
                  </div>
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Assigned sampler</span>
                  <select
                    value={dispatchAssignedTo}
                    onChange={(event) => setDispatchAssignedTo(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                  >
                    <option value="">Select assignee</option>
                    {users.filter((user) => user.is_active).map((user) => (
                      <option key={user.id} value={user.id}>{fieldDisplayName(user)}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Dispatch notes</span>
                  <textarea
                    value={dispatchNotes}
                    onChange={(event) => setDispatchNotes(event.target.value)}
                    rows={4}
                    placeholder="Operational notes, bottle prep, route hazards, or timing instructions."
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                  />
                </label>

                <button
                  onClick={handleDispatchSelected}
                  disabled={mutating || selectedCalendar.dispatch_status === 'completed' || selectedCalendar.dispatch_status === 'in_progress'}
                  className="w-full rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
                >
                  Dispatch single calendar item
                </button>

                {selectedCalendar.current_field_visit_id && (
                  <Link
                    to={`/field/visits/${selectedCalendar.current_field_visit_id}`}
                    className="inline-flex text-sm text-cyan-300 hover:text-cyan-200"
                  >
                    Open linked field visit
                  </Link>
                )}
              </div>
            ) : (
              <p className="mt-5 text-sm text-text-muted">Select a calendar row to dispatch it individually.</p>
            )}
          </SpotlightCard>

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Override / Makeup
              </h2>
            </div>

            {selectedCalendar ? (
              <div className="mt-5 space-y-4">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Action</span>
                  <select
                    value={adjustmentType}
                    onChange={(event) => setAdjustmentType(event.target.value as 'skip' | 'reschedule' | 'makeup')}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                  >
                    {ADJUSTMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                {adjustmentType !== 'skip' && (
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-text-muted">New date</span>
                    <input
                      type="date"
                      value={adjustmentDate}
                      onChange={(event) => setAdjustmentDate(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none focus:border-amber-400/30"
                    />
                  </label>
                )}

                <label className="space-y-2">
                  <span className="text-xs font-medium text-text-muted">Reason</span>
                  <textarea
                    value={adjustmentReason}
                    onChange={(event) => setAdjustmentReason(event.target.value)}
                    rows={4}
                    placeholder="Why this work is being skipped, moved, or converted into a makeup sample."
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none focus:border-amber-400/30"
                  />
                </label>

                <button
                  onClick={handleApplyAdjustment}
                  disabled={mutating}
                  className="w-full rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-60"
                >
                  Record adjustment
                </button>
              </div>
            ) : (
              <p className="mt-5 text-sm text-text-muted">Select a calendar row to log a skip, reschedule, or makeup action.</p>
            )}
          </SpotlightCard>

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-violet-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Active Schedules
              </h2>
            </div>

            <div className="mt-5 space-y-3">
              {scheduleItems.length === 0 ? (
                <p className="text-sm text-text-muted">No active sampling schedules exist yet.</p>
              ) : (
                scheduleItems.slice(0, 8).map((schedule) => (
                  <div key={schedule.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="text-sm font-semibold text-text-primary">
                      {schedule.permit_number} / {schedule.outfall_number} / {schedule.parameter_name}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted">
                      <span>{schedule.frequency_code.replace(/_/g, ' ')}</span>
                      <span>{schedule.route_zone || 'No zone'}</span>
                      <span>{schedule.default_assigned_to_name || 'No default assignee'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SpotlightCard>
        </div>
      </div>
    </div>
  );
}

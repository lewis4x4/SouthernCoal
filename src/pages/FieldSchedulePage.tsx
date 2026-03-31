import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardList,
  CloudRain,
  MapPinned,
  RefreshCw,
  Route,
  Send,
  ShieldAlert,
  Waves,
} from 'lucide-react';
import { toast } from 'sonner';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useFieldOps } from '@/hooks/useFieldOps';
import { useSamplingCalendar } from '@/hooks/useSamplingCalendar';
import type {
  ParameterOption,
  SamplingCalendarListItem,
  SamplingDispatchStatus,
  SamplingFrequencyCode,
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

function dispatchTone(status: SamplingDispatchStatus) {
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
      return 'text-slate-300 border-white/[0.08] bg-white/[0.06]';
    default:
      return 'text-violet-300 border-violet-500/20 bg-violet-500/10';
  }
}

function fieldDisplayName(user: { first_name?: string | null; last_name?: string | null; email?: string | null } | undefined) {
  const full = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return full || user?.email || 'Unassigned';
}

export function FieldSchedulePage() {
  const navigate = useNavigate();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [statusFilter, setStatusFilter] = useState<'all' | SamplingDispatchStatus>('all');
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
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualRouteZone, setManualRouteZone] = useState('');
  const [manualAssignedTo, setManualAssignedTo] = useState('');
  const [manualReason, setManualReason] = useState('');

  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [dispatchAssignedTo, setDispatchAssignedTo] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'skip' | 'reschedule' | 'makeup'>('skip');
  const [adjustmentDate, setAdjustmentDate] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');

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
    loading,
    mutating,
    refresh: refreshCalendar,
    createSchedule,
    generateMonth,
    createManualEntry,
    applyAdjustment,
  } = useSamplingCalendar(selectedMonth);

  const permitMap = useMemo(() => new Map(permits.map((permit) => [permit.id, permit])), [permits]);
  const outfallMap = useMemo(() => new Map(outfalls.map((outfall) => [outfall.id, outfall])), [outfalls]);
  const parameterMap = useMemo(() => new Map(parameters.map((parameter) => [parameter.id, parameter])), [parameters]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const visitMap = useMemo(() => new Map(visits.map((visit) => [visit.id, visit])), [visits]);

  const scheduleItems = useMemo<SamplingScheduleListItem[]>(() => (
    schedules.map((schedule) => ({
      ...schedule,
      permit_number: permitMap.get(schedule.permit_id)?.permit_number ?? null,
      outfall_number: outfallMap.get(schedule.outfall_id)?.outfall_number ?? null,
      parameter_name: parameterMap.get(schedule.parameter_id)?.name ?? null,
      default_assigned_to_name: fieldDisplayName(userMap.get(schedule.default_assigned_to ?? '')),
    }))
  ), [outfallMap, parameterMap, permitMap, schedules, userMap]);

  const calendarList = useMemo<SamplingCalendarListItem[]>(() => {
    const rows = calendarItems.map((item) => {
      const schedule = schedules.find((entry) => entry.id === item.schedule_id);
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
        default_assigned_to_name: fieldDisplayName(userMap.get(item.default_assigned_to ?? '')),
        current_field_visit_status: visit?.visit_status ?? null,
        current_field_visit_outcome: visit?.outcome ?? null,
      };
    });

    return rows.filter((row) => statusFilter === 'all' || row.dispatch_status === statusFilter);
  }, [calendarItems, outfallMap, parameterMap, permitMap, schedules, statusFilter, userMap, visitMap]);

  const selectedCalendar = useMemo(
    () => calendarList.find((item) => item.id === selectedCalendarId) ?? null,
    [calendarList, selectedCalendarId],
  );

  const scheduleOutfalls = useMemo(
    () => outfalls.filter((outfall) => !schedulePermitId || outfall.permit_id === schedulePermitId),
    [outfalls, schedulePermitId],
  );

  const manualOutfalls = useMemo(
    () => outfalls.filter((outfall) => !manualPermitId || outfall.permit_id === manualPermitId),
    [manualPermitId, outfalls],
  );

  const queueStats = useMemo(() => {
    return {
      total: calendarItems.length,
      ready: calendarItems.filter((item) => item.dispatch_status === 'ready').length,
      overdue: calendarItems.filter((item) => item.status === 'overdue').length,
      exceptions: calendarItems.filter((item) => item.dispatch_status === 'exception').length,
    };
  }, [calendarItems]);

  async function handleGenerateMonth() {
    try {
      const result = await generateMonth();
      toast.success(
        `Generated ${result?.generated_count ?? 0} calendar entries for ${selectedMonth}.`,
      );
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Sampling Calendar
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Generate WV sampling work, log exceptions, and dispatch approved calendar items into executable field visits.
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
          <div className="text-xs uppercase tracking-wider text-text-muted">Ready to dispatch</div>
          <div className="mt-2 text-3xl font-semibold text-cyan-300">{queueStats.ready}</div>
          <div className="mt-2 text-sm text-text-secondary">entries staged with no active field visit</div>
        </SpotlightCard>
        <SpotlightCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-text-muted">Overdue</div>
          <div className="mt-2 text-3xl font-semibold text-amber-300">{queueStats.overdue}</div>
          <div className="mt-2 text-sm text-text-secondary">sampling work past due date</div>
        </SpotlightCard>
        <SpotlightCard className="p-5">
          <div className="text-xs uppercase tracking-wider text-text-muted">Exceptions</div>
          <div className="mt-2 text-3xl font-semibold text-red-300">{queueStats.exceptions}</div>
          <div className="mt-2 text-sm text-text-secondary">calendar items needing supervisor intervention</div>
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
                      placeholder="South Fork / Route A"
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
                    placeholder="Bottle prep, access notes, known hazards, route instructions."
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

              <div className="flex items-center gap-3">
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

            <div className="mt-5 grid gap-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
                ))
              ) : calendarList.length === 0 ? (
                <p className="text-sm text-text-muted">No sampling calendar entries exist for {selectedMonth}.</p>
              ) : (
                calendarList.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setSelectedCalendarId(item.id);
                      setDispatchAssignedTo(item.default_assigned_to ?? '');
                      setDispatchNotes(item.instructions ?? '');
                    }}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
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
                          <span>{new Date(`${item.scheduled_date}T00:00:00`).toLocaleDateString()}</span>
                          <span>{item.frequency_code?.replace(/_/g, ' ') ?? 'manual'}</span>
                          <span>{item.route_zone || 'No zone'}</span>
                          <span>{item.default_assigned_to_name || 'No default assignee'}</span>
                        </div>
                      </div>

                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${dispatchTone(item.dispatch_status)}`}>
                        {item.dispatch_status.replace('_', ' ')}
                      </span>
                    </div>

                    {(item.skip_reason || item.override_reason) && (
                      <p className="mt-3 text-sm text-text-secondary">
                        {item.override_reason || item.skip_reason}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </SpotlightCard>
        </div>

        <div className="space-y-6">
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
                    {selectedCalendar.parameter_name} on {new Date(`${selectedCalendar.scheduled_date}T00:00:00`).toLocaleDateString()}
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
                  Dispatch to field visit
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
              <p className="mt-5 text-sm text-text-muted">Select a calendar row to dispatch it into the field queue.</p>
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

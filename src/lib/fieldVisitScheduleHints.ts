import { supabase } from '@/lib/supabase';
import type { FieldVisitListItem } from '@/types';

export function formatScheduledParameterLabel(
  row: { name: string | null; short_name: string | null } | null,
): string | null {
  if (!row) return null;
  const name = (row.name ?? '').trim();
  const sn = (row.short_name ?? '').trim();
  if (name && sn && sn !== name) return `${name} (${sn})`;
  return name || sn || null;
}

/** Batches calendar → parameter + schedule lookups for offline route snapshots. */
export async function enrichFieldVisitsWithScheduleHints(
  visits: FieldVisitListItem[],
): Promise<FieldVisitListItem[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return visits;
  }

  const calendarIds = [
    ...new Set(visits.map((v) => v.sampling_calendar_id).filter((id): id is string => Boolean(id))),
  ];
  if (calendarIds.length === 0) return visits;

  try {
    const { data: calRows, error: calErr } = await supabase
      .from('sampling_calendar')
      .select('id, parameter_id, schedule_id')
      .in('id', calendarIds);

    if (calErr || !calRows?.length) return visits;

    const paramIds = [...new Set(calRows.map((r) => r.parameter_id).filter(Boolean))] as string[];
    const schedIds = [...new Set(calRows.map((r) => r.schedule_id).filter(Boolean))] as string[];

    const [paramsRes, schedRes] = await Promise.all([
      paramIds.length > 0
        ? supabase.from('parameters').select('id, name, short_name').in('id', paramIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null; short_name: string | null }[], error: null }),
      schedIds.length > 0
        ? supabase.from('sampling_schedules').select('id, instructions').in('id', schedIds)
        : Promise.resolve({ data: [] as { id: string; instructions: string | null }[], error: null }),
    ]);

    if (paramsRes.error || schedRes.error) return visits;

    const paramById = new Map((paramsRes.data ?? []).map((p) => [p.id, p]));
    const schedById = new Map((schedRes.data ?? []).map((s) => [s.id, s]));
    const calById = new Map(calRows.map((c) => [c.id as string, c]));

    return visits.map((v) => {
      const calId = v.sampling_calendar_id;
      if (!calId) return v;
      const cal = calById.get(calId);
      if (!cal) return v;
      const paramRow = cal.parameter_id ? paramById.get(cal.parameter_id as string) : undefined;
      const schedRow = cal.schedule_id ? schedById.get(cal.schedule_id as string) : undefined;
      const label = formatScheduledParameterLabel(
        paramRow ? { name: paramRow.name, short_name: paramRow.short_name } : null,
      );
      const raw = schedRow?.instructions;
      const instr = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
      return {
        ...v,
        scheduled_parameter_label: label ?? v.scheduled_parameter_label ?? null,
        schedule_instructions: instr ?? v.schedule_instructions ?? null,
      };
    });
  } catch {
    return visits;
  }
}

import type { FieldVisitListItem } from '@/types';

export type SameOutfallSameDayGroup = {
  scheduledDate: string;
  outfallId: string;
  permitLabel: string | null;
  outfallLabel: string | null;
  visits: FieldVisitListItem[];
};

/**
 * Groups visits that share the same calendar day and outfall (potential duplicate dispatch / conflict).
 * Does not judge intent — surfaces data for supervisor review per queue-based offline strategy.
 */
export function groupSameOutfallSameDay(visits: FieldVisitListItem[]): SameOutfallSameDayGroup[] {
  const map = new Map<string, FieldVisitListItem[]>();
  for (const v of visits) {
    const key = `${v.scheduled_date}\0${v.outfall_id}`;
    const list = map.get(key);
    if (list) list.push(v);
    else map.set(key, [v]);
  }
  const out: SameOutfallSameDayGroup[] = [];
  for (const group of map.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
    out.push({
      scheduledDate: first.scheduled_date,
      outfallId: first.outfall_id,
      permitLabel: first.permit_number,
      outfallLabel: first.outfall_number,
      visits: group,
    });
  }
  out.sort((a, b) =>
    `${a.scheduledDate}\0${a.outfallId}`.localeCompare(`${b.scheduledDate}\0${b.outfallId}`),
  );
  return out;
}

/** Other visits (excluding `visitId`) on the same day and outfall — for a single-visit screen. */
export function siblingVisitsSameOutfallSameDay(
  visits: FieldVisitListItem[],
  visitId: string,
  scheduledDate: string,
  outfallId: string,
): FieldVisitListItem[] {
  return visits.filter(
    (v) => v.id !== visitId && v.scheduled_date === scheduledDate && v.outfall_id === outfallId,
  );
}

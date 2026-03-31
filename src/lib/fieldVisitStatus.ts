/**
 * Open visit = not completed and not cancelled (still needs a field disposition).
 */
export function visitIsOpen(visit: { visit_status: string }): boolean {
  return visit.visit_status !== 'completed' && visit.visit_status !== 'cancelled';
}

/**
 * Overdue open visit: scheduled before local calendar `todayYmd` (YYYY-MM-DD) and still open.
 */
export function visitIsOpenOverdue(
  visit: { visit_status: string; scheduled_date: string },
  todayYmd: string,
): boolean {
  if (!visitIsOpen(visit)) return false;
  return visit.scheduled_date < todayYmd;
}

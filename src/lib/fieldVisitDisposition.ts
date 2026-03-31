import type { FieldVisitListItem } from '@/types';

/** Visit still needs a terminal field disposition (complete or cancel path). */
export function visitNeedsDisposition(v: Pick<FieldVisitListItem, 'visit_status'>): boolean {
  return v.visit_status === 'assigned' || v.visit_status === 'in_progress';
}

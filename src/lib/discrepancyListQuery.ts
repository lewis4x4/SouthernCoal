import type { DiscrepancySeverity, DiscrepancyStatus, DiscrepancyType } from '@/stores/reviewQueue';

/** Max rows loaded into Review Queue table (virtualized render; avoids 100K+ client fetch). */
export const MAX_DISCREPANCY_TABLE_ROWS = 2000;
export const DISCREPANCY_PAGE_SIZE = 500;

export interface DiscrepancyListFilters {
  severity?: DiscrepancySeverity;
  status?: DiscrepancyStatus;
  source?: string;
  type?: DiscrepancyType;
}

/** Default triage view: pending only until user widens status filter. */
export function resolveDiscrepancyStatusFilter(
  filters: DiscrepancyListFilters,
): DiscrepancyStatus {
  return filters.status ?? 'pending';
}

export const QUEUE_TABLE_STATUSES: DiscrepancyStatus[] = ['pending', 'reviewed', 'escalated'];

import { create } from 'zustand';

export type DiscrepancySeverity = 'critical' | 'high' | 'medium' | 'low';
export type DiscrepancyStatus = 'pending' | 'reviewed' | 'dismissed' | 'escalated' | 'resolved';
export type DiscrepancyType = 'missing_internal' | 'missing_external' | 'value_mismatch' | 'status_mismatch';

export interface DiscrepancyRow {
  id: string;
  organization_id: string;
  npdes_id: string | null;
  mine_id: string | null;
  source: string;
  discrepancy_type: DiscrepancyType;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
  monitoring_period_start: string | null;
  monitoring_period_end: string | null;
  description: string;
  internal_value: string | null;
  external_value: string | null;
  internal_source_table: string | null;
  internal_source_id: string | null;
  external_source_id: string | null;
  detected_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  dismiss_reason: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  recurrence_count: number;
  created_at: string;
  updated_at: string;
}

interface ReviewQueueFilters {
  severity?: DiscrepancySeverity;
  status?: DiscrepancyStatus;
  source?: string;
  type?: DiscrepancyType;
}

interface ReviewQueueStore {
  filters: ReviewQueueFilters;
  selectedId: string | null;
  setFilters: (filters: ReviewQueueFilters) => void;
  setSelectedId: (id: string | null) => void;
  clearFilters: () => void;
}

export const useReviewQueueStore = create<ReviewQueueStore>((set) => ({
  filters: {},
  selectedId: null,
  setFilters: (filters) => set({ filters }),
  setSelectedId: (selectedId) => set({ selectedId }),
  clearFilters: () => set({ filters: {} }),
}));

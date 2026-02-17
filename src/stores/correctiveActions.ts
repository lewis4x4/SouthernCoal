import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CorrectiveAction,
  CAFilters,
  CAActivity,
  CAStatus,
  CAPriority,
  WorkflowStep,
} from '@/types/corrective-actions';
import { isOverdue } from '@/types/corrective-actions';

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------
interface CorrectiveActionsStore {
  // Data
  actions: CorrectiveAction[];
  activities: Record<string, CAActivity[]>; // keyed by CA id

  // Filters
  filters: CAFilters;

  // Selection & UI State
  selectedId: string | null;
  detailPanelOpen: boolean;
  signatureModalOpen: boolean;
  signatureType: 'responsible' | 'approver' | null;

  // Loading state
  loading: boolean;
  error: string | null;

  // Actions
  setActions: (actions: CorrectiveAction[]) => void;
  upsertAction: (action: CorrectiveAction) => void;
  removeAction: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setFilters: (filters: Partial<CAFilters>) => void;
  clearFilters: () => void;
  setActivities: (caId: string, activities: CAActivity[]) => void;
  appendActivity: (caId: string, activity: CAActivity) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // UI controls
  openDetailPanel: (id: string) => void;
  closeDetailPanel: () => void;
  openSignatureModal: (type: 'responsible' | 'approver') => void;
  closeSignatureModal: () => void;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------
export const useCorrectiveActionsStore = create<CorrectiveActionsStore>()(
  persist(
    (set) => ({
      // Initial state
      actions: [],
      activities: {},
      filters: {},
      selectedId: null,
      detailPanelOpen: false,
      signatureModalOpen: false,
      signatureType: null,
      loading: false,
      error: null,

      // Data actions
      setActions: (actions) => set({ actions, loading: false, error: null }),

      // Issue #4 Fix: Merge instead of replace to preserve JOINed fields
      upsertAction: (action) =>
        set((s) => {
          const idx = s.actions.findIndex((a) => a.id === action.id);
          if (idx >= 0) {
            const updated = [...s.actions];
            // Merge new data with existing to preserve JOINed fields (site_name, assigned_to_name, etc.)
            updated[idx] = { ...s.actions[idx], ...action };
            return { actions: updated };
          }
          return { actions: [action, ...s.actions] };
        }),

      // Issue #15 Fix: Also clear activities when removing action to prevent orphans
      removeAction: (id) =>
        set((s) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _, ...remainingActivities } = s.activities;
          return {
            actions: s.actions.filter((a) => a.id !== id),
            activities: remainingActivities,
          };
        }),

      setSelectedId: (id) => set({ selectedId: id }),

      setFilters: (partial) =>
        set((s) => ({
          filters: { ...s.filters, ...partial },
        })),

      clearFilters: () => set({ filters: {} }),

      setActivities: (caId, activities) =>
        set((s) => ({
          activities: { ...s.activities, [caId]: activities },
        })),

      appendActivity: (caId, activity) =>
        set((s) => ({
          activities: {
            ...s.activities,
            [caId]: [...(s.activities[caId] || []), activity],
          },
        })),

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error, loading: false }),

      // UI controls
      openDetailPanel: (id) => set({ selectedId: id, detailPanelOpen: true }),
      closeDetailPanel: () => set({ detailPanelOpen: false }),
      openSignatureModal: (type) =>
        set({ signatureModalOpen: true, signatureType: type }),
      closeSignatureModal: () =>
        set({ signatureModalOpen: false, signatureType: null }),
    }),
    {
      name: 'scc_corrective_actions',
      // Only persist filters to localStorage
      partialize: (state) => ({ filters: state.filters }),
    }
  )
);

// ---------------------------------------------------------------------------
// Derived Selectors
// ---------------------------------------------------------------------------

/** Filter actions based on current filters */
export function filterActions(
  actions: CorrectiveAction[],
  filters: CAFilters
): CorrectiveAction[] {
  return actions.filter((a) => {
    if (filters.status && a.status !== filters.status) return false;
    if (filters.priority && a.priority !== filters.priority) return false;
    if (filters.workflow_step && a.workflow_step !== filters.workflow_step) return false;
    if (filters.assigned_to && a.followup_assigned_to !== filters.assigned_to) return false;
    if (filters.source_type && a.source_type !== filters.source_type) return false;
    if (filters.site_id && a.site_id !== filters.site_id) return false;
    if (filters.overdue_only && !isOverdue(a)) return false;
    if (filters.date_from && a.created_at < filters.date_from) return false;
    if (filters.date_to && a.created_at > filters.date_to) return false;
    return true;
  });
}

/** Get counts by status */
export function getStatusCounts(actions: CorrectiveAction[]): Record<CAStatus, number> {
  const counts: Record<CAStatus, number> = {
    open: 0,
    in_progress: 0,
    completed: 0,
    verified: 0,
    closed: 0,
  };

  for (const a of actions) {
    counts[a.status]++;
  }

  return counts;
}

/** Get count of overdue actions */
export function getOverdueCount(actions: CorrectiveAction[]): number {
  return actions.filter(isOverdue).length;
}

/** Get counts by priority */
export function getPriorityCounts(actions: CorrectiveAction[]): Record<CAPriority, number> {
  const counts: Record<CAPriority, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const a of actions) {
    counts[a.priority]++;
  }

  return counts;
}

/** Get counts by workflow step */
export function getStepCounts(actions: CorrectiveAction[]): Record<WorkflowStep, number> {
  const counts: Record<WorkflowStep, number> = {
    identification: 0,
    root_cause_analysis: 0,
    corrective_action_plan: 0,
    preventive_action: 0,
    implementation: 0,
    verification: 0,
    closure: 0,
  };

  for (const a of actions) {
    counts[a.workflow_step]++;
  }

  return counts;
}

/** Get selected CA */
export function getSelectedAction(
  actions: CorrectiveAction[],
  selectedId: string | null
): CorrectiveAction | null {
  if (!selectedId) return null;
  return actions.find((a) => a.id === selectedId) ?? null;
}

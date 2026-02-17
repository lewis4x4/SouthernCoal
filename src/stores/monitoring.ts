import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExceedanceStatus, ExceedanceSeverity } from '@/types';

export interface MonitoringFilters {
  status: ExceedanceStatus | 'all';
  severity: ExceedanceSeverity | 'all';
  outfallId: string | null;
  parameterId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

interface MonitoringState {
  // Filters
  filters: MonitoringFilters;
  setFilters: (filters: Partial<MonitoringFilters>) => void;
  resetFilters: () => void;

  // Selected exceedance for detail view
  selectedExceedanceId: string | null;
  setSelectedExceedanceId: (id: string | null) => void;

  // View preferences
  viewMode: 'table' | 'cards';
  setViewMode: (mode: 'table' | 'cards') => void;

  // Refresh trigger
  refreshKey: number;
  triggerRefresh: () => void;
}

const defaultFilters: MonitoringFilters = {
  status: 'all',
  severity: 'all',
  outfallId: null,
  parameterId: null,
  dateFrom: null,
  dateTo: null,
};

export const useMonitoringStore = create<MonitoringState>()(
  persist(
    (set) => ({
      // Filters
      filters: defaultFilters,
      setFilters: (newFilters) =>
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),
      resetFilters: () => set({ filters: defaultFilters }),

      // Selected exceedance
      selectedExceedanceId: null,
      setSelectedExceedanceId: (id) => set({ selectedExceedanceId: id }),

      // View preferences
      viewMode: 'table',
      setViewMode: (mode) => set({ viewMode: mode }),

      // Refresh trigger
      refreshKey: 0,
      triggerRefresh: () =>
        set((state) => ({ refreshKey: state.refreshKey + 1 })),
    }),
    {
      name: 'scc-monitoring-store',
      partialize: (state) => ({
        filters: state.filters,
        viewMode: state.viewMode,
      }),
    }
  )
);

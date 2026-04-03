import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PrecipitationEvent,
  PrecipitationReading,
} from '@/types/weather';

// ---------------------------------------------------------------------------
// Filter Interface
// ---------------------------------------------------------------------------
export interface RainEventFilters {
  status?: string;
  stationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------
interface RainEventsStore {
  // Data
  events: PrecipitationEvent[];
  readings: PrecipitationReading[];

  // Filters
  filters: RainEventFilters;

  // Selection & UI State
  selectedEventId: string | null;
  detailPanelOpen: boolean;

  // Loading state
  loading: boolean;
  error: string | null;

  // Actions
  setEvents: (events: PrecipitationEvent[]) => void;
  upsertEvent: (event: PrecipitationEvent) => void;
  removeEvent: (id: string) => void;
  setReadings: (readings: PrecipitationReading[]) => void;
  setFilters: (filters: Partial<RainEventFilters>) => void;
  clearFilters: () => void;
  openDetailPanel: (id: string) => void;
  closeDetailPanel: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------
export const useRainEventsStore = create<RainEventsStore>()(
  persist(
    (set) => ({
      // Initial state
      events: [],
      readings: [],
      filters: {},
      selectedEventId: null,
      detailPanelOpen: false,
      loading: false,
      error: null,

      // Data actions
      setEvents: (events) => set({ events, loading: false, error: null }),

      upsertEvent: (event) =>
        set((s) => {
          const idx = s.events.findIndex((e) => e.id === event.id);
          if (idx >= 0) {
            const updated = [...s.events];
            updated[idx] = { ...s.events[idx], ...event };
            return { events: updated };
          }
          return { events: [event, ...s.events] };
        }),

      removeEvent: (id) =>
        set((s) => ({
          events: s.events.filter((e) => e.id !== id),
        })),

      setReadings: (readings) => set({ readings }),

      setFilters: (partial) =>
        set((s) => ({
          filters: { ...s.filters, ...partial },
        })),

      clearFilters: () => set({ filters: {} }),

      openDetailPanel: (id) => set({ selectedEventId: id, detailPanelOpen: true }),
      closeDetailPanel: () => set({ detailPanelOpen: false }),

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error, loading: false }),
    }),
    {
      name: 'scc_rain_events',
      // Only persist filters to localStorage
      partialize: (state) => ({ filters: state.filters }),
    },
  ),
);

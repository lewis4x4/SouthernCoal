import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  WeatherStation,
  SiteWeatherStationAssignmentWithStation,
} from '@/types/weather';

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------
interface WeatherStationsStore {
  // Data
  stations: WeatherStation[];
  assignments: SiteWeatherStationAssignmentWithStation[];

  // Loading state
  loading: boolean;
  error: string | null;

  // Actions
  setStations: (stations: WeatherStation[]) => void;
  upsertStation: (station: WeatherStation) => void;
  removeStation: (id: string) => void;
  setAssignments: (assignments: SiteWeatherStationAssignmentWithStation[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------
export const useWeatherStationsStore = create<WeatherStationsStore>()(
  persist(
    (set) => ({
      // Initial state
      stations: [],
      assignments: [],
      loading: false,
      error: null,

      // Data actions
      setStations: (stations) => set({ stations, loading: false, error: null }),

      upsertStation: (station) =>
        set((s) => {
          const idx = s.stations.findIndex((st) => st.id === station.id);
          if (idx >= 0) {
            const updated = [...s.stations];
            updated[idx] = { ...s.stations[idx], ...station };
            return { stations: updated };
          }
          return { stations: [station, ...s.stations] };
        }),

      removeStation: (id) =>
        set((s) => ({
          stations: s.stations.filter((st) => st.id !== id),
        })),

      setAssignments: (assignments) => set({ assignments }),

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error, loading: false }),
    }),
    {
      name: 'scc_weather_stations',
      // Only persist minimal state to localStorage
      partialize: () => ({}),
    },
  ),
);

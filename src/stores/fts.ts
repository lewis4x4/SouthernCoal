import { create } from 'zustand';
import type { FtsUpload, FtsViolation, FtsMonthlyTotal, FtsFilters } from '@/types/fts';

interface FtsState {
  uploads: FtsUpload[];
  violations: FtsViolation[];
  monthlyTotals: FtsMonthlyTotal[];
  filters: FtsFilters;
  navQuarterTotal: number | null;

  setUploads: (uploads: FtsUpload[]) => void;
  upsertUpload: (upload: FtsUpload) => void;
  setViolations: (violations: FtsViolation[]) => void;
  setMonthlyTotals: (totals: FtsMonthlyTotal[]) => void;
  setFilters: (filters: Partial<FtsFilters>) => void;
  resetFilters: () => void;
  setNavQuarterTotal: (total: number | null) => void;
}

const DEFAULT_FILTERS: FtsFilters = {
  year: null,
  quarter: null,
  state: null,
  dnrSearch: '',
};

export const useFtsStore = create<FtsState>((set) => ({
  uploads: [],
  violations: [],
  monthlyTotals: [],
  filters: { ...DEFAULT_FILTERS },
  navQuarterTotal: null,

  setUploads: (uploads) => set({ uploads }),

  upsertUpload: (upload) =>
    set((s) => {
      const idx = s.uploads.findIndex((u) => u.id === upload.id);
      if (idx >= 0) {
        const next = [...s.uploads];
        next[idx] = upload;
        return { uploads: next };
      }
      return { uploads: [upload, ...s.uploads] };
    }),

  setViolations: (violations) => set({ violations }),
  setMonthlyTotals: (totals) => set({ monthlyTotals: totals }),

  setFilters: (partial) =>
    set((s) => ({ filters: { ...s.filters, ...partial } })),

  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
  setNavQuarterTotal: (total) => set({ navQuarterTotal: total }),
}));

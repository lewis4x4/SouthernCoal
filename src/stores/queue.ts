import { create } from 'zustand';
import type { QueueEntry } from '@/types/queue';
import type { FileStatus } from '@/lib/constants';

export interface QueueFilters {
  status: FileStatus | 'all';
  stateCode: string | 'all';
  category: string | 'all';
}

interface QueueStore {
  entries: QueueEntry[];
  filters: QueueFilters;
  expandedRowId: string | null;
  setEntries: (entries: QueueEntry[]) => void;
  upsertEntry: (entry: QueueEntry) => void;
  removeEntry: (id: string) => void;
  setFilters: (filters: Partial<QueueFilters>) => void;
  setExpandedRow: (id: string | null) => void;
  getFilteredEntries: () => QueueEntry[];
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  entries: [],
  filters: { status: 'all', stateCode: 'all', category: 'all' },
  expandedRowId: null,

  setEntries: (entries) => set({ entries }),

  upsertEntry: (entry) =>
    set((s) => {
      const idx = s.entries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        const updated = [...s.entries];
        updated[idx] = entry;
        return { entries: updated };
      }
      return { entries: [entry, ...s.entries] };
    }),

  removeEntry: (id) =>
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
    })),

  setFilters: (partial) =>
    set((s) => ({
      filters: { ...s.filters, ...partial },
    })),

  setExpandedRow: (id) => set({ expandedRowId: id }),

  getFilteredEntries: () => {
    const { entries, filters } = get();
    return entries.filter((e) => {
      if (filters.status !== 'all' && e.status !== filters.status) return false;
      if (filters.stateCode !== 'all' && e.state_code !== filters.stateCode) return false;
      if (filters.category !== 'all' && e.file_category !== filters.category) return false;
      return true;
    });
  },
}));

import { create } from 'zustand';
import type { StagedFile } from '@/types/upload';

interface StagingStore {
  files: StagedFile[];
  addFiles: (files: StagedFile[]) => void;
  removeFile: (id: string) => void;
  updateFile: (id: string, updates: Partial<StagedFile>) => void;
  clearAll: () => void;
  /** Files with zero validation errors — ready to upload */
  getReadyFiles: () => StagedFile[];
}

export const useStagingStore = create<StagingStore>((set, get) => ({
  files: [],

  addFiles: (newFiles) =>
    set((s) => ({ files: [...s.files, ...newFiles] })),

  removeFile: (id) =>
    set((s) => ({ files: s.files.filter((f) => f.id !== id) })),

  updateFile: (id, updates) =>
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),

  clearAll: () => set({ files: [] }),

  getReadyFiles: () => get().files.filter((f) => f.validationErrors.length === 0),
}));

import { create } from 'zustand';
import type { UploadProgress } from '@/types/upload';

const UPLOAD_CONCURRENCY = 10;
const HASH_CONCURRENCY = 2;

interface UploadStore {
  activeUploads: Map<string, UploadProgress>;
  activeHashCount: number;

  startUpload: (fileId: string) => void;
  updateProgress: (fileId: string, percent: number) => void;
  setStatus: (fileId: string, status: UploadProgress['status'], error?: string) => void;
  completeUpload: (fileId: string) => void;
  failUpload: (fileId: string, error: string) => void;

  startHash: () => void;
  completeHash: () => void;

  canStartUpload: () => boolean;
  canStartHash: () => boolean;
  getActiveUploadCount: () => number;
  getQueuePosition: (fileId: string) => number;
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  activeUploads: new Map(),
  activeHashCount: 0,

  startUpload: (fileId) =>
    set((s) => {
      const next = new Map(s.activeUploads);
      next.set(fileId, { fileId, percent: 0, status: 'uploading' });
      return { activeUploads: next };
    }),

  updateProgress: (fileId, percent) =>
    set((s) => {
      const next = new Map(s.activeUploads);
      const current = next.get(fileId);
      if (current) next.set(fileId, { ...current, percent });
      return { activeUploads: next };
    }),

  setStatus: (fileId, status, error) =>
    set((s) => {
      const next = new Map(s.activeUploads);
      const current = next.get(fileId);
      if (current) next.set(fileId, { ...current, status, error });
      return { activeUploads: next };
    }),

  completeUpload: (fileId) =>
    set((s) => {
      const next = new Map(s.activeUploads);
      next.delete(fileId);
      return { activeUploads: next };
    }),

  failUpload: (fileId, error) =>
    set((s) => {
      const next = new Map(s.activeUploads);
      next.set(fileId, { fileId, percent: 0, status: 'error', error });
      return { activeUploads: next };
    }),

  startHash: () => set((s) => ({ activeHashCount: s.activeHashCount + 1 })),
  completeHash: () => set((s) => ({ activeHashCount: Math.max(0, s.activeHashCount - 1) })),

  canStartUpload: () => {
    let count = 0;
    get().activeUploads.forEach((u) => {
      if (u.status === 'uploading' || u.status === 'hashing') count++;
    });
    return count < UPLOAD_CONCURRENCY;
  },

  canStartHash: () => get().activeHashCount < HASH_CONCURRENCY,

  getActiveUploadCount: () => {
    let count = 0;
    get().activeUploads.forEach((u) => {
      if (u.status === 'uploading') count++;
    });
    return count;
  },

  getQueuePosition: (fileId) => {
    let position = 0;
    for (const [, u] of get().activeUploads) {
      if (u.fileId === fileId) break;
      if (u.status === 'pending') position++;
    }
    return position;
  },
}));

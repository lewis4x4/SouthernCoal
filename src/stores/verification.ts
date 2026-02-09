import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VerificationStatus = 'unreviewed' | 'in_review' | 'verified' | 'disputed';

interface VerificationState {
  /** queueId → verification status */
  statuses: Record<string, VerificationStatus>;
  setStatus: (queueId: string, status: VerificationStatus) => void;
  getStatus: (queueId: string) => VerificationStatus;
  /** Auto-transition: unreviewed → in_review when panel opened */
  markOpened: (queueId: string) => void;
}

/**
 * AI Extraction Trust Layer — verification statuses.
 * Persisted to localStorage until a DB field is added.
 */
export const useVerificationStore = create<VerificationState>()(
  persist(
    (set, get) => ({
      statuses: {},

      setStatus: (queueId, status) =>
        set((state) => ({
          statuses: { ...state.statuses, [queueId]: status },
        })),

      getStatus: (queueId) => get().statuses[queueId] ?? 'unreviewed',

      markOpened: (queueId) => {
        const current = get().statuses[queueId];
        if (!current || current === 'unreviewed') {
          set((state) => ({
            statuses: { ...state.statuses, [queueId]: 'in_review' },
          }));
        }
      },
    }),
    {
      name: 'scc-verification-statuses',
    },
  ),
);

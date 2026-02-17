import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  HandoffInput,
  HandoffExtractionResult,
  HandoffProcessingStatus,
  WhatsNextQueue,
  PendingHandoff,
  ConflictInfo,
  ResolvedTask,
} from '@/types/handoff';
import type { OwnerType, RoadmapStatus } from '@/types/roadmap';

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------
interface HandoffStore {
  // Input state
  currentInput: HandoffInput | null;
  inputHistory: HandoffInput[];

  // Processing state
  status: HandoffProcessingStatus;
  error: string | null;

  // Extraction results
  extractionResult: HandoffExtractionResult | null;

  // Pending handoffs awaiting apply (Record for JSON serialization)
  pendingHandoffs: Record<string, PendingHandoff>;

  // Conflicts (Record for JSON serialization)
  conflicts: Record<string, ConflictInfo>;

  // Priority queue
  whatsNextQueue: WhatsNextQueue | null;

  // Recently resolved
  recentlyResolved: ResolvedTask[];

  // UI state
  previewOpen: boolean;
  selectedUpdateIndex: number | null;
  activeView: 'tasks' | 'handoff' | 'whats_next';

  // Actions
  setInput: (input: HandoffInput) => void;
  clearInput: () => void;
  setStatus: (status: HandoffProcessingStatus) => void;
  setError: (error: string | null) => void;
  setExtractionResult: (result: HandoffExtractionResult | null) => void;
  setWhatsNextQueue: (queue: WhatsNextQueue | null) => void;
  openPreview: () => void;
  closePreview: () => void;
  selectUpdate: (index: number | null) => void;
  addToHistory: (input: HandoffInput) => void;
  setActiveView: (view: 'tasks' | 'handoff' | 'whats_next') => void;

  // Pending handoff management
  addPendingHandoff: (handoff: PendingHandoff) => void;
  removePendingHandoff: (handoffId: string) => void;
  markApplying: (handoffId: string) => void;
  markApplied: (handoffId: string) => void;
  markConflict: (handoffId: string, info: ConflictInfo) => void;
  markFailed: (handoffId: string, error: string) => void;
  getPendingForTask: (taskId: string) => PendingHandoff | undefined;
  clearPending: () => void;

  // Recently resolved
  addResolved: (task: ResolvedTask) => void;
  clearResolved: () => void;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------
export const useHandoffStore = create<HandoffStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentInput: null,
      inputHistory: [],
      status: 'idle',
      error: null,
      extractionResult: null,
      pendingHandoffs: {},
      conflicts: {},
      whatsNextQueue: null,
      recentlyResolved: [],
      previewOpen: false,
      selectedUpdateIndex: null,
      activeView: 'tasks',

      // Input actions
      setInput: (input) => set({ currentInput: input, error: null }),
      clearInput: () =>
        set({
          currentInput: null,
          extractionResult: null,
          status: 'idle',
          error: null,
        }),

      // Status actions
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error, status: error ? 'error' : get().status }),

      // Extraction actions
      setExtractionResult: (result) =>
        set({ extractionResult: result, status: result ? 'previewing' : 'idle' }),

      // Queue actions
      setWhatsNextQueue: (queue) => set({ whatsNextQueue: queue }),

      // UI actions
      openPreview: () => set({ previewOpen: true }),
      closePreview: () => set({ previewOpen: false }),
      selectUpdate: (index) => set({ selectedUpdateIndex: index }),
      setActiveView: (view) => set({ activeView: view }),

      // History actions
      addToHistory: (input) =>
        set((s) => ({
          inputHistory: [input, ...s.inputHistory].slice(0, 10),
        })),

      // Pending handoff actions
      addPendingHandoff: (handoff) =>
        set((s) => ({
          pendingHandoffs: { ...s.pendingHandoffs, [handoff.handoff_id]: handoff },
        })),

      removePendingHandoff: (handoffId) =>
        set((s) => {
          const { [handoffId]: _removed, ...rest } = s.pendingHandoffs;
          void _removed; // Intentionally unused - extracting to remove from object
          return { pendingHandoffs: rest };
        }),

      markApplying: (handoffId) =>
        set((s) => {
          const handoff = s.pendingHandoffs[handoffId];
          if (!handoff) return s;
          // We could add a status field to PendingHandoff if needed
          return s;
        }),

      markApplied: (handoffId) =>
        set((s) => {
          const { [handoffId]: _removedPending, ...restPending } = s.pendingHandoffs;
          const { [handoffId]: _removedConflict, ...restConflicts } = s.conflicts;
          void _removedPending; // Intentionally unused - extracting to remove from object
          void _removedConflict; // Intentionally unused - extracting to remove from object
          return { pendingHandoffs: restPending, conflicts: restConflicts };
        }),

      markConflict: (handoffId, info) =>
        set((s) => ({
          conflicts: { ...s.conflicts, [handoffId]: info },
        })),

      markFailed: (handoffId, error) =>
        set((s) => ({
          conflicts: { ...s.conflicts, [handoffId]: { reason: 'concurrent_modification' } },
          error,
        })),

      getPendingForTask: (taskId) => {
        const pending = get().pendingHandoffs;
        for (const handoff of Object.values(pending)) {
          if (handoff.task_id === taskId) return handoff;
        }
        return undefined;
      },

      clearPending: () =>
        set({ pendingHandoffs: {}, conflicts: {} }),

      // Recently resolved actions
      addResolved: (task) =>
        set((s) => ({
          recentlyResolved: [task, ...s.recentlyResolved].slice(0, 20),
        })),

      clearResolved: () => set({ recentlyResolved: [] }),
    }),
    {
      name: 'scc-handoff-state',
      partialize: (state) => ({
        inputHistory: state.inputHistory,
        whatsNextQueue: state.whatsNextQueue,
        recentlyResolved: state.recentlyResolved,
        // NOTE: activeView intentionally NOT persisted - users should land on 'tasks' tab on page load
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// Derived Selectors (exported separately per codebase pattern)
// ---------------------------------------------------------------------------

/**
 * Calculate priority score using the protocol formula:
 * Priority = (Downstream × 3) + (Blocker × 5) + (Phase × 2) - (External × 4)
 */
export function calculatePriorityScore(
  downstreamImpact: number,
  isBlockerRemoval: boolean,
  phase: number,
  hasExternalDependency: boolean
): { total: number; formula: string } {
  const downstream = downstreamImpact * 3;
  const blocker = isBlockerRemoval ? 5 : 0;
  const phaseWeight = (6 - phase) * 2; // Phase 1 = 10, Phase 5 = 2
  const external = hasExternalDependency ? 4 : 0;

  const total = downstream + blocker + phaseWeight - external;
  const formula = `(${downstreamImpact} × 3) + (${isBlockerRemoval ? 1 : 0} × 5) + (${6 - phase} × 2) - (${hasExternalDependency ? 1 : 0} × 4) = ${total}`;

  return { total, formula };
}

/**
 * Assign tier based on owner type and dependencies
 */
export function assignTier(
  ownerType: OwnerType,
  hasExternalDependency: boolean,
  status: RoadmapStatus
): 1 | 2 | 3 {
  // TIER 1: Critical blockers - only Tom/SCC can unblock
  if (ownerType === 'tom' || ownerType === 'scc_mgmt') {
    return 1;
  }

  // TIER 1: Blocked tasks requiring external action
  if (status === 'blocked' && hasExternalDependency) {
    return 1;
  }

  // TIER 2: You can do now - software ownership, no external dependency
  if (ownerType === 'software' && !hasExternalDependency) {
    return 2;
  }

  // TIER 3: Parallel track - both ownership or mixed dependencies
  return 3;
}

/**
 * Get conflicting handoffs
 */
export function getConflictingHandoffs(store: HandoffStore): PendingHandoff[] {
  return Object.entries(store.pendingHandoffs)
    .filter(([id]) => id in store.conflicts)
    .map(([, handoff]) => handoff);
}

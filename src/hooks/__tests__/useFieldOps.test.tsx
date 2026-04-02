import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { didDispatchContextLoadSucceed, useFieldOps } from '@/hooks/useFieldOps';
import { clearAllFieldVisitCaches } from '@/lib/fieldVisitLocalCache';
import type { FieldVisitDetails, FieldVisitListItem } from '@/types';

const useAuthMock = vi.fn();
const useUserProfileMock = vi.fn();
const findVisitInFieldRouteCacheAsyncMock = vi.fn();
const getFieldSyncPendingCountMock = vi.fn();
const toastErrorMock = vi.fn();
const fromMock = vi.fn();

function installMockStorage() {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: () => useUserProfileMock(),
}));

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: () => ({ log: vi.fn() }),
}));

vi.mock('@/lib/fieldRouteLocalCache', () => ({
  findVisitInFieldRouteCacheAsync: (...args: unknown[]) => findVisitInFieldRouteCacheAsyncMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/lib/fieldOutboundQueue', () => ({
  enqueueCocPrimaryUpsert: vi.fn(),
  enqueueFieldVisitComplete: vi.fn(),
  enqueueFieldMeasurementInsert: vi.fn(),
  enqueueFieldVisitStart: vi.fn(),
  enqueueOutletInspectionUpsert: vi.fn(),
  getFieldOutboundQueueLength: () => 0,
  mergeAccessIssueWithQueuedCompletion: (_visitId: string, record: unknown) => record,
  mergeMeasurementsWithQueuedCoc: (_visitId: string, _userId: string | null, measurements: unknown[]) => measurements,
  mergeNoDischargeWithQueuedCompletion: (_visitId: string, record: unknown) => record,
  mergeOutletInspectionWithQueue: (_visitId: string, record: unknown) => record,
  mergeVisitWithQueuedLifecycle: <T,>(visit: T) => visit,
  optimisticMeasurementsFromQueue: () => [],
  processFieldOutboundQueue: vi.fn(),
  shouldQueueFieldOutboundFailure: () => false,
}));

vi.mock('@/lib/fieldEvidenceDrafts', () => ({
  clearPersistedFieldEvidenceSyncFailures: vi.fn(),
  persistFieldEvidenceSyncFailures: vi.fn(),
  syncFieldEvidenceDrafts: vi.fn(),
}));

vi.mock('@/lib/fieldOutboundQueueDiagnostic', () => ({
  clearStoredOutboundQueueDiagnostic: vi.fn(),
  OUTBOUND_QUEUE_DIAGNOSTIC_CHANGED_EVENT: 'outbound-queue-diagnostic-changed',
  persistOutboundQueueDiagnostic: vi.fn(),
  readStoredOutboundQueueDiagnostic: () => null,
  OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY: 'outbound-queue-diagnostic',
}));

vi.mock('@/lib/npdesPermitState', () => ({
  loadPermitsWithStateCodes: vi.fn().mockResolvedValue({
    rawPermits: [],
    siteIdToState: new Map<string, string>(),
    permitError: null,
    sitesStateError: null,
  }),
}));

vi.mock('@/lib/fieldSyncPending', () => ({
  getFieldSyncPendingCount: () => getFieldSyncPendingCountMock(),
}));

vi.mock('@/lib/fieldVisitScheduleHints', () => ({
  enrichFieldVisitsWithScheduleHints: async <T,>(visits: T[]) => visits,
  formatScheduledParameterLabel: () => null,
}));

const minimalVisit = (over: Partial<FieldVisitListItem> = {}): FieldVisitListItem => ({
  id: 'visit-1',
  organization_id: 'org-1',
  permit_id: 'permit-1',
  outfall_id: 'outfall-1',
  assigned_to: 'user-1',
  assigned_by: 'user-2',
  scheduled_date: '2026-03-31',
  visit_status: 'assigned',
  outcome: null,
  started_at: null,
  completed_at: null,
  started_latitude: null,
  started_longitude: null,
  completed_latitude: null,
  completed_longitude: null,
  weather_conditions: null,
  field_notes: null,
  potential_force_majeure: false,
  potential_force_majeure_notes: null,
  linked_sampling_event_id: null,
  sampling_calendar_id: null,
  route_batch_id: null,
  created_at: '2026-03-31T12:00:00Z',
  updated_at: '2026-03-31T12:00:00Z',
  permit_number: 'WV-1',
  outfall_number: '001',
  assigned_to_name: 'Test User',
  route_stop_sequence: 1,
  ...over,
});

const minimalDetail = (over: Partial<FieldVisitDetails> = {}): FieldVisitDetails => ({
  visit: minimalVisit(),
  inspection: null,
  measurements: [],
  evidence: [],
  noDischarge: null,
  accessIssue: null,
  governanceIssues: [],
  scheduled_parameter_label: null,
  schedule_instructions: null,
  stop_requirements: [],
  required_field_measurements: [],
  previous_visit_context: null,
  ...over,
});

function createResolvedBuilder(options: {
  thenResult: { data: unknown; error: unknown };
  singleResult?: { data: unknown; error: unknown };
  maybeSingleResult?: { data: unknown; error: unknown };
}) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    in: () => builder,
    single: () => Promise.resolve(options.singleResult ?? options.thenResult),
    maybeSingle: () => Promise.resolve(options.maybeSingleResult ?? options.thenResult),
    then: (
      onFulfilled?: ((value: { data: unknown; error: unknown }) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(options.thenResult).then(onFulfilled ?? undefined, onRejected ?? undefined),
  };
  return builder;
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('didDispatchContextLoadSucceed', () => {
  it('returns true when queue flush and required queries all succeed', () => {
    expect(
      didDispatchContextLoadSucceed({
        flushFailed: null,
        permitError: null,
        sitesStateError: null,
        userError: null,
        visitError: null,
      }),
    ).toBe(true);
  });

  it('returns false when a required query resolves with an error', () => {
    expect(
      didDispatchContextLoadSucceed({
        flushFailed: null,
        permitError: { message: 'permits failed' },
        sitesStateError: null,
        userError: null,
        visitError: null,
      }),
    ).toBe(false);
  });

  it('returns false when outbound flush fails before the load completes', () => {
    expect(
      didDispatchContextLoadSucceed({
        flushFailed: new Error('queue blocked'),
        permitError: null,
        sitesStateError: null,
        userError: null,
        visitError: null,
      }),
    ).toBe(false);
  });

  it('returns false when sites→states lookup fails', () => {
    expect(
      didDispatchContextLoadSucceed({
        flushFailed: null,
        permitError: null,
        sitesStateError: { message: 'sites rls' },
        userError: null,
        visitError: null,
      }),
    ).toBe(false);
  });

  it('returns false when outfall query fails', () => {
    expect(
      didDispatchContextLoadSucceed({
        flushFailed: null,
        permitError: null,
        sitesStateError: null,
        userError: null,
        visitError: null,
        outfallError: { message: 'outfalls timeout' },
      }),
    ).toBe(false);
  });

  it('returns false when role assignment query fails', () => {
    expect(
      didDispatchContextLoadSucceed({
        flushFailed: null,
        permitError: null,
        sitesStateError: null,
        userError: null,
        visitError: null,
        assignmentError: { message: 'assignments rls' },
      }),
    ).toBe(false);
  });

  it('returns false when route stop query fails', () => {
    expect(
      didDispatchContextLoadSucceed({
        flushFailed: null,
        permitError: null,
        sitesStateError: null,
        userError: null,
        visitError: null,
        routeStopError: { message: 'stops failed' },
      }),
    ).toBe(false);
  });
});

describe('useFieldOps loadVisitDetails cache ownership', () => {
  beforeEach(() => {
    installMockStorage();
    clearAllFieldVisitCaches();
    vi.clearAllMocks();
    setNavigatorOnline(false);

    useAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'field@example.com',
      },
    });
    useUserProfileMock.mockReturnValue({
      profile: {
        organization_id: 'org-1',
        first_name: 'Field',
        last_name: 'Tester',
      },
    });
    findVisitInFieldRouteCacheAsyncMock.mockResolvedValue(null);
    getFieldSyncPendingCountMock.mockResolvedValue(0);

    const emptyRows: never[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === 'field_visits') {
        return createResolvedBuilder({
          thenResult: { data: emptyRows, error: null },
          singleResult: { data: null, error: { message: 'offline miss' } },
        });
      }
      return createResolvedBuilder({
        thenResult: { data: emptyRows, error: null },
        maybeSingleResult: { data: null, error: null },
      });
    });
  });

  it('hydrates same-user cached detail while offline', async () => {
    localStorage.setItem('scc.fieldVisitCache.v1.visit-1', JSON.stringify({
      version: 2,
      visitId: 'visit-1',
      organizationId: 'org-1',
      viewerUserId: 'user-1',
      detail: minimalDetail(),
    }));

    const { result } = renderHook(() => useFieldOps());

    act(() => {
      void result.current.loadVisitDetails('visit-1');
    });

    await waitFor(() => {
      expect(result.current.detail?.visit.id).toBe('visit-1');
    });
    expect(result.current.detailLoadSource).toBe('device_visit_cache');
    expect(findVisitInFieldRouteCacheAsyncMock).not.toHaveBeenCalledWith(
      'visit-1',
      expect.anything(),
    );
  });

  it('rejects same-org cache from a different user before state commit', async () => {
    localStorage.setItem('scc.fieldVisitCache.v1.visit-1', JSON.stringify({
      version: 2,
      visitId: 'visit-1',
      organizationId: 'org-1',
      viewerUserId: 'user-9',
      detail: minimalDetail(),
    }));

    const { result } = renderHook(() => useFieldOps());

    act(() => {
      void result.current.loadVisitDetails('visit-1');
    });

    await waitFor(() => {
      expect(result.current.detail).toBeNull();
    });
    expect(localStorage.getItem('scc.fieldVisitCache.v1.visit-1')).toBeNull();
  });

  it('rejects cross-org cached detail before state commit', async () => {
    localStorage.setItem('scc.fieldVisitCache.v1.visit-1', JSON.stringify({
      version: 2,
      visitId: 'visit-1',
      organizationId: 'org-9',
      viewerUserId: 'user-1',
      detail: minimalDetail(),
    }));

    const { result } = renderHook(() => useFieldOps());

    act(() => {
      void result.current.loadVisitDetails('visit-1');
    });

    await waitFor(() => {
      expect(result.current.detail).toBeNull();
    });
    expect(localStorage.getItem('scc.fieldVisitCache.v1.visit-1')).toBeNull();
  });

  it('rejects cached detail when embedded visit org disagrees with the cache scope', async () => {
    localStorage.setItem('scc.fieldVisitCache.v1.visit-1', JSON.stringify({
      version: 2,
      visitId: 'visit-1',
      organizationId: 'org-1',
      viewerUserId: 'user-1',
      detail: minimalDetail({
        visit: minimalVisit({ organization_id: 'org-9' }),
      }),
    }));

    const { result } = renderHook(() => useFieldOps());

    act(() => {
      void result.current.loadVisitDetails('visit-1');
    });

    await waitFor(() => {
      expect(result.current.detail).toBeNull();
    });
    expect(localStorage.getItem('scc.fieldVisitCache.v1.visit-1')).toBeNull();
  });

  it('does not hydrate route shell fallback while organization scope is still unknown', async () => {
    useUserProfileMock.mockReturnValue({
      profile: {
        organization_id: null,
        first_name: 'Field',
        last_name: 'Tester',
      },
    });
    findVisitInFieldRouteCacheAsyncMock.mockResolvedValue(minimalVisit());

    const { result } = renderHook(() => useFieldOps());

    act(() => {
      void result.current.loadVisitDetails('visit-1');
    });

    await waitFor(() => {
      expect(result.current.detail).toBeNull();
    });
    expect(findVisitInFieldRouteCacheAsyncMock).not.toHaveBeenCalled();
  });

  it('clears stale in-memory detail after viewer scope changes so it is not re-saved', async () => {
    localStorage.setItem('scc.fieldVisitCache.v1.visit-1', JSON.stringify({
      version: 2,
      visitId: 'visit-1',
      organizationId: 'org-1',
      viewerUserId: 'user-1',
      detail: minimalDetail(),
    }));

    const { result, rerender } = renderHook(() => useFieldOps());

    act(() => {
      void result.current.loadVisitDetails('visit-1');
    });

    await waitFor(() => {
      expect(result.current.detail?.visit.id).toBe('visit-1');
    });

    useAuthMock.mockReturnValue({
      user: {
        id: 'user-2',
        email: 'field2@example.com',
      },
    });
    useUserProfileMock.mockReturnValue({
      profile: {
        organization_id: 'org-2',
        first_name: 'Field',
        last_name: 'Tester',
      },
    });

    rerender();

    await waitFor(() => {
      expect(result.current.detail).toBeNull();
    });

    const rewritten = localStorage.getItem('scc.fieldVisitCache.v1.visit-1');
    expect(rewritten).toContain('"organizationId":"org-1"');
    expect(rewritten).toContain('"viewerUserId":"user-1"');
    expect(rewritten).not.toContain('"organizationId":"org-2"');
    expect(rewritten).not.toContain('"viewerUserId":"user-2"');
  });
});

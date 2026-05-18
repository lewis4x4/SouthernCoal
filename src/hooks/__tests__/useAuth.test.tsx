import { waitFor } from '@testing-library/dom';
import { act, renderHook } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY } from '@/lib/fieldOutboundQueueDiagnostic';

const clearFieldRouteCacheMock = vi.fn();
const clearAllFieldVisitCachesMock = vi.fn();
const getSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signOutMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const unsubscribeMock = vi.fn();

async function loadUseAuthModule() {
  vi.resetModules();

  vi.doMock('@/lib/fieldRouteLocalCache', () => ({
    clearFieldRouteCache: clearFieldRouteCacheMock,
  }));

  vi.doMock('@/lib/fieldVisitLocalCache', () => ({
    clearAllFieldVisitCaches: clearAllFieldVisitCachesMock,
  }));

  vi.doMock('@/lib/supabase', () => ({
    supabase: {
      auth: {
        getSession: (...args: unknown[]) => getSessionMock(...args),
        refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
        signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
        signOut: (...args: unknown[]) => signOutMock(...args),
        onAuthStateChange: (callback: (...args: unknown[]) => void) => {
          onAuthStateChangeMock(callback);
          return { data: { subscription: { unsubscribe: unsubscribeMock } } };
        },
      },
    },
  }));

  return import('@/hooks/useAuth');
}

const validSession = {
  access_token: 'token-1',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: 'user-1',
    email: 'user@example.com',
  },
} as Session;

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('boots into authenticated state after authoritative refresh succeeds', async () => {
    getSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });

    const { useAuth } = await loadUseAuthModule();
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.sessionReliesOnLocalJwt).toBe(false);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('uses stored session when refresh fails but access token is still valid', async () => {
    getSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: new Error('network') });

    const { useAuth } = await loadUseAuthModule();
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.sessionReliesOnLocalJwt).toBe(true);
  });

  it('reports expired when refresh fails and access token is past expiry', async () => {
    const expiredSession = {
      ...validSession,
      expires_at: Math.floor(Date.now() / 1000) - 120,
    };
    getSessionMock.mockResolvedValue({ data: { session: expiredSession }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: new Error('expired') });

    const { useAuth } = await loadUseAuthModule();
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe('expired');
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.sessionReliesOnLocalJwt).toBe(false);
  });

  it('calls refresh again when the browser fires online', async () => {
    getSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });

    const { useAuth } = await loadUseAuthModule();
    renderHook(() => useAuth());

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    });

    refreshSessionMock.mockClear();
    getSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    });
  });

  it('reports unauthenticated when no session exists', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });

    const { useAuth } = await loadUseAuthModule();
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe('unauthenticated');
    });
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it('clears caches and signs out cleanly', async () => {
    getSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: validSession }, error: null });
    signOutMock.mockResolvedValue({ error: null });
    localStorage.setItem('scc_role_assignments', 'cached');
    localStorage.setItem(
      'scc.fieldOutboundQueue.v1',
      JSON.stringify({
        revision: 1,
        ops: [
          {
            kind: 'field_measurement_insert',
            id: 'auth-test-op',
            visitId: 'v-auth',
            parameterName: 'pH',
            measuredValue: 7,
            measuredText: null,
            unit: null,
            enqueuedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    localStorage.setItem(
      'scc.fieldEvidenceSyncFailures.v1',
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        failures: [
          {
            draftId: 'd1',
            fieldVisitId: 'v-auth',
            fileName: 'photo.jpg',
            message: 'upload failed',
          },
        ],
      }),
    );
    localStorage.setItem(
      OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        message: 'held',
        opKind: 'field_visit_start',
        visitId: 'v-auth',
        savedAt: new Date().toISOString(),
      }),
    );

    const { useAuth } = await loadUseAuthModule();
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(clearFieldRouteCacheMock).toHaveBeenCalled();
    expect(clearAllFieldVisitCachesMock).toHaveBeenCalled();
    expect(localStorage.getItem('scc_role_assignments')).toBeNull();
    expect(localStorage.getItem('scc.fieldOutboundQueue.v1')).toBeNull();
    expect(localStorage.getItem('scc.fieldEvidenceSyncFailures.v1')).toBeNull();
    expect(localStorage.getItem(OUTBOUND_QUEUE_DIAGNOSTIC_STORAGE_KEY)).toBeNull();
    expect(signOutMock).toHaveBeenCalled();
  });

  it('clears durable field stores when auth user id changes', async () => {
    const sessionUserA = {
      ...validSession,
      user: { id: 'user-a', email: 'a@example.com' },
    } as Session;
    const sessionUserB = {
      ...validSession,
      user: { id: 'user-b', email: 'b@example.com' },
    } as Session;

    getSessionMock.mockResolvedValue({ data: { session: sessionUserA }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: sessionUserA }, error: null });

    localStorage.setItem(
      'scc.fieldOutboundQueue.v1',
      JSON.stringify({ revision: 1, ops: [] }),
    );
    localStorage.setItem(
      'scc.fieldEvidenceSyncFailures.v1',
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        failures: [],
      }),
    );

    const { useAuth } = await loadUseAuthModule();
    renderHook(() => useAuth());

    await waitFor(() => {
      expect(onAuthStateChangeMock).toHaveBeenCalled();
    });

    const authListener = onAuthStateChangeMock.mock.calls[0]?.[0];
    expect(authListener).toBeDefined();
    if (typeof authListener !== 'function') {
      throw new Error('onAuthStateChange listener was not registered');
    }

    clearFieldRouteCacheMock.mockClear();
    clearAllFieldVisitCachesMock.mockClear();

    await act(async () => {
      authListener('SIGNED_IN', sessionUserB);
    });

    expect(clearFieldRouteCacheMock).toHaveBeenCalled();
    expect(clearAllFieldVisitCachesMock).toHaveBeenCalled();
    expect(localStorage.getItem('scc.fieldOutboundQueue.v1')).toBeNull();
    expect(localStorage.getItem('scc.fieldEvidenceSyncFailures.v1')).toBeNull();
  });
});

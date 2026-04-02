import { renderHook, waitFor, act } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(signOutMock).toHaveBeenCalled();
  });
});

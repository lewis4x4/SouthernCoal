import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signOutMock = vi.fn();

const session = {
  access_token: 'token-1',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'user-1', email: 'user@example.com' },
} as Session;

async function loadSupabaseModule() {
  vi.resetModules();

  vi.doMock('@/lib/supabaseEnv', () => ({
    parseSupabaseBrowserEnv: () => ({
      url: 'https://example.supabase.co',
      anonKey: 'anon-key',
    }),
  }));

  vi.doMock('@supabase/supabase-js', () => ({
    createClient: () => ({
      auth: {
        getSession: (...args: unknown[]) => getSessionMock(...args),
        refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
        signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
        signOut: (...args: unknown[]) => signOutMock(...args),
      },
    }),
  }));

  return import('@/lib/supabase');
}

describe('supabase auth helpers', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/',
        search: '',
        href: '',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.resetModules();
  });

  it('returns the current access token when the session is still valid', async () => {
    getSessionMock.mockResolvedValue({ data: { session }, error: null });

    const { getFreshToken } = await loadSupabaseModule();
    await expect(getFreshToken()).resolves.toBe('token-1');
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it('refreshes when the current token is near expiry', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          ...session,
          access_token: 'stale-token',
          expires_at: Math.floor(Date.now() / 1000) + 5,
        },
      },
      error: null,
    });
    refreshSessionMock.mockResolvedValue({
      data: {
        session: {
          ...session,
          access_token: 'fresh-token',
        },
      },
      error: null,
    });

    const { getFreshToken } = await loadSupabaseModule();
    await expect(getFreshToken()).resolves.toBe('fresh-token');
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when refresh cannot recover a session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: new Error('expired') });

    const { getFreshToken } = await loadSupabaseModule();
    await expect(getFreshToken()).rejects.toThrow('Session expired');
    expect(window.location.href).toBe('/login?reason=session_expired');
  });
});

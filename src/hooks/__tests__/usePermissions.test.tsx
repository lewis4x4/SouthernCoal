import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
const authStateMock = {
  user: { id: 'user-1', email: 'user@example.com' },
  status: 'authenticated',
};

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => Promise.resolve(result),
  };
  return builder;
}

async function loadUsePermissionsModule() {
  vi.resetModules();

  vi.doMock('@/lib/supabase', () => ({
    supabase: {
      from: (...args: unknown[]) => fromMock(...args),
    },
  }));

  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => ({
      user: authStateMock.user,
      status: authStateMock.status,
      isAuthenticated: authStateMock.status === 'authenticated',
      loading: authStateMock.status === 'bootstrapping',
      session: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    }),
  }));

  return import('@/hooks/usePermissions');
}

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authStateMock.user = { id: 'user-1', email: 'user@example.com' } as any;
    authStateMock.status = 'authenticated';
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('uses same-user cached assignments in degraded mode when live fetch fails', async () => {
    localStorage.setItem('scc_role_assignments', JSON.stringify({
      version: 1,
      userId: 'user-1',
      cachedAt: new Date().toISOString(),
      assignments: [
        {
          id: 'assignment-1',
          user_id: 'user-1',
          role_id: 'role-1',
          role_name: 'field_sampler',
          site_id: 'site-1',
          created_at: '2026-04-01T00:00:00Z',
        },
      ],
    }));
    fromMock.mockReturnValue(createBuilder({ data: null, error: { message: 'db down' } }));

    const { usePermissions } = await loadUsePermissionsModule();
    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.availability).toBe('degraded');
    expect(result.current.getEffectiveRole()).toBe('field_sampler');
  });

  it('clears stale cache and resolves read_only when live assignments are empty', async () => {
    localStorage.setItem('scc_role_assignments', JSON.stringify({
      version: 1,
      userId: 'user-1',
      cachedAt: new Date().toISOString(),
      assignments: [
        {
          id: 'assignment-1',
          user_id: 'user-1',
          role_id: 'role-1',
          role_name: 'admin',
          site_id: null,
          created_at: '2026-04-01T00:00:00Z',
        },
      ],
    }));
    fromMock.mockReturnValue(createBuilder({ data: [], error: null }));

    const { usePermissions } = await loadUsePermissionsModule();
    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.availability).toBe('ready');
    expect(result.current.getEffectiveRole()).toBe('read_only');
    expect(localStorage.getItem('scc_role_assignments')).toBeNull();
  });

  it('distinguishes assignment scope from global scope', async () => {
    fromMock.mockReturnValue(createBuilder({
      data: [
        {
          id: 'assignment-1',
          user_id: 'user-1',
          role_id: 'role-1',
          site_id: 'site-1',
          granted_at: '2026-04-01T00:00:00Z',
          roles: { name: 'environmental_manager' },
        },
      ],
      error: null,
    }));

    const { usePermissions } = await loadUsePermissionsModule();
    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasAllowedRole(['environmental_manager'], 'assignment')).toBe(true);
    expect(result.current.hasAllowedRole(['environmental_manager'], 'global')).toBe(false);
  });
});

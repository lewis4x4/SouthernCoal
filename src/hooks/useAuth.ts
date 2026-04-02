import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearFieldRouteCache } from '@/lib/fieldRouteLocalCache';
import { clearAllFieldVisitCaches } from '@/lib/fieldVisitLocalCache';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'expired';

/** Skew so we treat the access JWT as expired slightly before the server does. */
const ACCESS_TOKEN_SKEW_MS = 60_000;

interface AuthState {
  user: User | null;
  session: Session | null;
  status: AuthStatus;
  loading: boolean;
  isAuthenticated: boolean;
  /**
   * True when bootstrap could not refresh with the server but a stored session’s access token
   * is still within its validity window. Refresh is retried on the `online` event.
   */
  sessionReliesOnLocalJwt: boolean;
}

type AuthListener = (state: AuthState) => void;

const ROLE_ASSIGNMENTS_CACHE_KEY = 'scc_role_assignments';

const initialAuthState: AuthState = {
  user: null,
  session: null,
  status: 'bootstrapping',
  loading: true,
  isAuthenticated: false,
  sessionReliesOnLocalJwt: false,
};

let authState: AuthState = initialAuthState;
let authInitialized = false;
let authBootstrapPromise: Promise<void> | null = null;
let previousUserId: string | null = null;
const authListeners = new Set<AuthListener>();

function emitAuthState(next: AuthState) {
  authState = next;
  authListeners.forEach((listener) => listener(next));
}

function clearAuthCaches() {
  clearFieldRouteCache();
  clearAllFieldVisitCaches();
  try {
    localStorage.removeItem(ROLE_ASSIGNMENTS_CACHE_KEY);
  } catch {
    /* non-critical */
  }
}

function isAccessTokenStillValid(session: Session): boolean {
  const exp = session.expires_at;
  if (exp == null) return false;
  return Date.now() < exp * 1000 - ACCESS_TOKEN_SKEW_MS;
}

function buildAuthState(
  session: Session | null,
  status: AuthStatus,
  opts?: { sessionReliesOnLocalJwt?: boolean },
): AuthState {
  const relies =
    status === 'authenticated'
    && !!session
    && opts?.sessionReliesOnLocalJwt === true;
  return {
    user: session?.user ?? null,
    session,
    status,
    loading: status === 'bootstrapping',
    isAuthenticated: status === 'authenticated' && !!session,
    sessionReliesOnLocalJwt: relies,
  };
}

function handleUserSwitch(nextUserId: string | null) {
  if (previousUserId && previousUserId !== nextUserId) {
    clearAuthCaches();
  }
  if (previousUserId && nextUserId == null) {
    clearAuthCaches();
  }
  previousUserId = nextUserId;
}

async function bootstrapAuthState() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }

    if (!session) {
      handleUserSwitch(null);
      emitAuthState(buildAuthState(null, 'unauthenticated'));
      return;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) {
      handleUserSwitch(refreshed.session.user.id);
      emitAuthState(buildAuthState(refreshed.session, 'authenticated', { sessionReliesOnLocalJwt: false }));
      return;
    }

    if (isAccessTokenStillValid(session)) {
      handleUserSwitch(session.user.id);
      emitAuthState(buildAuthState(session, 'authenticated', { sessionReliesOnLocalJwt: true }));
      return;
    }

    handleUserSwitch(null);
    emitAuthState(buildAuthState(null, 'expired'));
  } catch (err) {
    console.error('[auth] Failed to bootstrap session:', err);
    handleUserSwitch(null);
    emitAuthState(buildAuthState(null, 'unauthenticated'));
  }
}

async function refreshSessionAfterReconnect() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session) {
      handleUserSwitch(refreshed.session.user.id);
      emitAuthState(buildAuthState(refreshed.session, 'authenticated', { sessionReliesOnLocalJwt: false }));
    }
  } catch {
    /* non-fatal — user may still have a valid local JWT for field offline */
  }
}

declare global {
  interface Window {
    __sccAuthOnlineListener?: boolean;
    __sccAuthOnlineSlot?: { run: () => Promise<void> };
  }
}

/** Vitest `resetModules()` reloads this file; one window listener delegates here so we do not stack listeners. */
function syncAuthOnlineRefreshTarget() {
  if (typeof window === 'undefined') return;
  window.__sccAuthOnlineSlot = { run: refreshSessionAfterReconnect };
}

function ensureAuthInitialized() {
  syncAuthOnlineRefreshTarget();

  if (!authInitialized) {
    authInitialized = true;

    if (typeof window !== 'undefined' && !window.__sccAuthOnlineListener) {
      window.__sccAuthOnlineListener = true;
      window.addEventListener('online', () => {
        void window.__sccAuthOnlineSlot?.run();
      });
    }

    void supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      handleUserSwitch(nextUserId);

      emitAuthState(
        buildAuthState(session, session ? 'authenticated' : 'unauthenticated', { sessionReliesOnLocalJwt: false }),
      );
    }).data.subscription;
  }

  if (!authBootstrapPromise) {
    authBootstrapPromise = bootstrapAuthState().finally(() => {
      authBootstrapPromise = null;
    });
  }
}

function subscribeAuth(listener: AuthListener) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(authState);

  useEffect(() => {
    ensureAuthInitialized();
    return subscribeAuth(setState);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    clearAuthCaches();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    emitAuthState(buildAuthState(null, 'unauthenticated'));
  }, []);

  return { ...state, signIn, signOut };
}

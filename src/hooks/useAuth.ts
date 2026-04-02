import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearFieldRouteCache } from '@/lib/fieldRouteLocalCache';
import { clearAllFieldVisitCaches } from '@/lib/fieldVisitLocalCache';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'expired';

interface AuthState {
  user: User | null;
  session: Session | null;
  status: AuthStatus;
  loading: boolean;
  isAuthenticated: boolean;
}

type AuthListener = (state: AuthState) => void;

const ROLE_ASSIGNMENTS_CACHE_KEY = 'scc_role_assignments';

const initialAuthState: AuthState = {
  user: null,
  session: null,
  status: 'bootstrapping',
  loading: true,
  isAuthenticated: false,
};

let authState: AuthState = initialAuthState;
let authInitialized = false;
let authBootstrapPromise: Promise<void> | null = null;
let previousUserId: string | null = null;
let authListeners = new Set<AuthListener>();

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

function buildAuthState(session: Session | null, status: AuthStatus): AuthState {
  return {
    user: session?.user ?? null,
    session,
    status,
    loading: status === 'bootstrapping',
    isAuthenticated: status === 'authenticated' && !!session,
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
    if (refreshError || !refreshed.session) {
      handleUserSwitch(null);
      emitAuthState(buildAuthState(null, 'expired'));
      return;
    }

    handleUserSwitch(refreshed.session.user.id);
    emitAuthState(buildAuthState(refreshed.session, 'authenticated'));
  } catch (err) {
    console.error('[auth] Failed to bootstrap session:', err);
    handleUserSwitch(null);
    emitAuthState(buildAuthState(null, 'unauthenticated'));
  }
}

function ensureAuthInitialized() {
  if (!authInitialized) {
    authInitialized = true;

    supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      handleUserSwitch(nextUserId);

      emitAuthState(
        buildAuthState(session, session ? 'authenticated' : 'unauthenticated'),
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

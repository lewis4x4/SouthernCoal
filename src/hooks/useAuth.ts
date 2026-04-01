import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { clearFieldRouteCache } from '@/lib/fieldRouteLocalCache';
import { clearAllFieldVisitCaches } from '@/lib/fieldVisitLocalCache';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    let previousUserId: string | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      previousUserId = session?.user?.id ?? null;
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        isAuthenticated: !!session,
      });
    }).catch((err) => {
      console.error('[auth] Failed to fetch session:', err);
      setState((prev) => ({ ...prev, loading: false }));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (previousUserId && previousUserId !== nextUserId) {
        clearFieldRouteCache();
        clearAllFieldVisitCaches();
      }
      if (previousUserId && nextUserId == null) {
        clearFieldRouteCache();
        clearAllFieldVisitCaches();
      }
      previousUserId = nextUserId;
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        isAuthenticated: !!session,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    clearFieldRouteCache();
    clearAllFieldVisitCaches();
    try { localStorage.removeItem('scc_role_assignments'); } catch { /* non-critical */ }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return { ...state, signIn, signOut };
}

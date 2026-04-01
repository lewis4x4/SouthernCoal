import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { UserProfile } from '@/types/auth';

interface UserProfileState {
  profile: UserProfile | null;
  organizationName: string | null;
  loading: boolean;
  error: string | null;
}

export function useUserProfile() {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<UserProfileState>({
    profile: null,
    organizationName: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setState({ profile: null, organizationName: null, loading: false, error: null });
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, email, first_name, last_name, organization_id, created_at')
          .eq('id', user!.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error('[profile] Failed to fetch profile:', error.message);
          setState((s) => ({ ...s, loading: false, error: error.message }));
          return;
        }

        if (!data) {
          setState((s) => ({
            ...s,
            loading: false,
            error: 'Profile not found',
          }));
          return;
        }

        let orgName: string | null = null;
        if (data.organization_id) {
          const { data: orgData, error: orgErr } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', data.organization_id)
            .maybeSingle();
          if (!cancelled && !orgErr) {
            orgName = orgData?.name ?? null;
          }
        }

        if (cancelled) return;

        if (import.meta.env.DEV) console.log('[profile] Loaded:', { id: data.id, org: orgName });

        setState({
          profile: {
            id: data.id,
            email: data.email,
            first_name: data.first_name,
            last_name: data.last_name,
            organization_id: data.organization_id,
            created_at: data.created_at,
          },
          organizationName: orgName,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'Failed to load profile';
        console.error('[profile] Unexpected error:', e);
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    }

    void fetchProfile();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on user.id, not user object
  }, [user?.id, isAuthenticated]);

  return state;
}

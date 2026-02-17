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

    async function fetchProfile() {
      // Fetch profile WITHOUT organizations join to avoid circular RLS dependency
      // (organizations policy references user_profiles → 500 error when joined)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, organization_id, created_at')
        .eq('id', user!.id)
        .single();

      if (error) {
        console.error('[profile] Failed to fetch profile:', error.message);
        setState((s) => ({ ...s, loading: false, error: error.message }));
        return;
      }

      // Fetch org name separately to avoid circular RLS
      let orgName: string | null = null;
      if (data.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', data.organization_id)
          .single();
        orgName = orgData?.name ?? null;
      }

      console.log('[profile] Loaded:', { id: data.id, org: orgName });

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
    }

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on user.id, not user object
  }, [user?.id, isAuthenticated]);

  return state;
}

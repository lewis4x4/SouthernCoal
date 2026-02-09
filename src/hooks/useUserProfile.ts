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
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, organization_id, created_at, organizations(name)')
        .eq('id', user!.id)
        .single();

      if (error) {
        setState((s) => ({ ...s, loading: false, error: error.message }));
        return;
      }

      const orgName =
        data.organizations && typeof data.organizations === 'object' && 'name' in data.organizations
          ? (data.organizations.name as string)
          : null;

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
  }, [user, isAuthenticated]);

  return state;
}

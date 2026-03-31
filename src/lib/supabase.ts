import { createClient } from '@supabase/supabase-js';
import { parseSupabaseBrowserEnv } from '@/lib/supabaseEnv';

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = parseSupabaseBrowserEnv();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Get a guaranteed-fresh JWT token for Edge Function calls.
 *
 * Why refreshSession() instead of getSession():
 * getSession() reads from memory/localStorage WITHOUT server validation.
 * The cached access_token can be stale (rotated by autoRefreshToken,
 * invalidated server-side, or desynchronized from the JWT secret).
 * refreshSession() always hits the Supabase auth server and returns
 * a brand-new access_token guaranteed to pass gateway verify_jwt.
 */
export async function getFreshToken(): Promise<string> {
  const { data: refreshed, error } = await supabase.auth.refreshSession();

  if (error || !refreshed.session) {
    // Refresh token itself is expired — user must re-authenticate
    window.location.href = '/login?reason=session_expired';
    throw new Error('Session expired — please log in again');
  }

  return refreshed.session.access_token;
}

/**
 * Standard headers for browser fetch() to Supabase Edge Functions.
 * The gateway expects Authorization (user JWT) and apikey (anon).
 */
export function edgeFunctionFetchHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

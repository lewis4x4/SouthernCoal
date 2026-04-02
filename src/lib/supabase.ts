import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { createResilientBrowserStorage } from '@/lib/browserStorage';
import { parseSupabaseBrowserEnv } from '@/lib/supabaseEnv';

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = parseSupabaseBrowserEnv();
const authStorage = createResilientBrowserStorage();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

function redirectToLogin(reason: 'session_expired' | 'refresh_failed' = 'session_expired') {
  if (typeof window === 'undefined') return;
  const nextHref = `/login?reason=${reason}`;
  if (window.location.pathname !== '/login' || window.location.search !== `?reason=${reason}`) {
    window.location.href = nextHref;
  }
}

export async function getValidSession(minValidityMs = 60_000): Promise<Session> {
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  let session = sessionResult.session;

  if (sessionError || !session) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      redirectToLogin('session_expired');
      throw new Error('Session expired — please log in again');
    }
    return refreshed.session;
  }

  const expiresAt = session.expires_at || 0;
  const expiresInMs = expiresAt * 1000 - Date.now();
  if (expiresInMs < minValidityMs) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      redirectToLogin('session_expired');
      throw new Error('Session expired — please log in again');
    }
    session = refreshed.session;
  }

  return session;
}

/**
 * Get a guaranteed-fresh JWT token for Edge Function calls.
 *
 * Uses the shared validated-session path so browser callers do not each
 * reimplement session bootstrap, expiry checks, and login redirects.
 */
export async function getFreshToken(): Promise<string> {
  const session = await getValidSession();
  return session.access_token;
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

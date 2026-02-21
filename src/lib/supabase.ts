import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env.local and fill in values.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Get a fresh JWT token for Edge Function calls.
 * Proactively refreshes if token expires within 60 seconds (v6 Section 11).
 */
export async function getFreshToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      window.location.href = '/login?reason=session_expired';
      throw new Error('Session expired');
    }
    return refreshed.session.access_token;
  }

  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const REFRESH_THRESHOLD = 60;

  if (expiresAt - now < REFRESH_THRESHOLD) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      window.location.href = '/login?reason=refresh_failed';
      throw new Error('Token refresh failed');
    }
    return refreshed.session.access_token;
  }

  return session.access_token;
}

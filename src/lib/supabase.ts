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
 * Refreshes the session if needed before returning the access token.
 */
export async function getFreshToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    // Redirect to login if session is invalid
    window.location.href = '/login?reason=session_expired';
    throw new Error('No valid session');
  }

  return data.session.access_token;
}

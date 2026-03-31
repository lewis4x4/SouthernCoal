type ViteEnv = Record<string, string | undefined>;

/**
 * Validates public Supabase client env at startup. Keeps misconfiguration
 * from silently producing a broken client.
 *
 * @param env defaults to `import.meta.env` (override in unit tests only).
 */
export function parseSupabaseBrowserEnv(
  env: ViteEnv = import.meta.env as ViteEnv,
): { url: string; anonKey: string } {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '').trim();

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. Copy .env.example to .env.local and fill in values.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('VITE_SUPABASE_URL is not a valid URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('VITE_SUPABASE_URL must use http or https.');
  }

  if (parsed.protocol === 'http:') {
    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
    if (!isLocal) {
      throw new Error('VITE_SUPABASE_URL must use https except for local development hosts.');
    }
  }

  return { url, anonKey };
}

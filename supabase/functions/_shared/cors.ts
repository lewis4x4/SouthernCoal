/**
 * CORS headers for Edge Functions.
 * Supports multiple frontend origins (Netlify prod + local dev).
 * NEVER use '*' in production — compliance system requires origin restriction.
 */

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

/** Default production app origin when FRONTEND_URL is unset. */
const DEFAULT_PROD_ORIGINS = ['https://southerncoal.netlify.app'];

const _isLocalDev =
  Deno.env.get('ENVIRONMENT') === 'local' ||
  Deno.env.get('SUPABASE_URL')?.includes('localhost') ||
  Deno.env.get('SUPABASE_URL')?.includes('127.0.0.1');

function configuredOrigins(): string[] {
  const fromEnv = [
    ...(Deno.env.get('FRONTEND_URLS')?.split(',') ?? []),
    ...(Deno.env.get('FRONTEND_URL') ? [Deno.env.get('FRONTEND_URL')!] : []),
  ]
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaults = _isLocalDev ? LOCAL_DEV_ORIGINS : DEFAULT_PROD_ORIGINS;
  return [...new Set([...fromEnv, ...defaults, ...LOCAL_DEV_ORIGINS])];
}

/**
 * Resolve CORS headers for a specific request Origin (required for browser POST
 * after preflight when app is served from Netlify or localhost).
 */
export function resolveCorsHeaders(request?: Request): Record<string, string> {
  const allowed = configuredOrigins();
  const origin = request?.headers.get('Origin') ?? '';
  const allowOrigin = allowed.includes(origin)
    ? origin
    : allowed[0] ?? LOCAL_DEV_ORIGINS[0]!;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-internal-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

/** Static fallback for handlers that do not yet pass the request. */
export const corsHeaders = resolveCorsHeaders();

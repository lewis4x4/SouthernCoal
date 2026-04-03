/**
 * CORS headers for Edge Functions.
 * Uses FRONTEND_URL env var when available, falls back to localhost for dev.
 * NEVER use '*' in production — compliance system requires origin restriction.
 */
const _envOrigin = Deno.env.get("FRONTEND_URL");
const _isLocalDev = Deno.env.get("ENVIRONMENT") === "local" ||
  Deno.env.get("SUPABASE_URL")?.includes("localhost") ||
  Deno.env.get("SUPABASE_URL")?.includes("127.0.0.1");
const ALLOWED_ORIGIN = _envOrigin ?? (_isLocalDev ? "http://localhost:5173" : (() => {
  throw new Error("FRONTEND_URL environment variable is required in non-local environments");
})());

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

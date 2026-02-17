/**
 * CORS headers for Edge Functions.
 * Uses FRONTEND_URL env var when available, falls back to localhost for dev.
 * NEVER use '*' in production — compliance system requires origin restriction.
 */
const ALLOWED_ORIGIN = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

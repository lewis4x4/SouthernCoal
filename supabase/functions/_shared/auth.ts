/**
 * Shared authentication utilities for Edge Function parsers.
 * Handles JWT verification and user context extraction.
 */

/**
 * Minimal Supabase client interface for auth operations.
 * This avoids importing full @supabase/supabase-js types while maintaining type safety.
 */
interface SupabaseClient {
  auth: {
    getUser: (token: string) => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: Error | null;
    }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
      };
    };
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Returns true when the bearer token must be rejected (anon, service_role, or missing sub).
 * SEC-003: the project anon key is a valid JWT; gateway verify_jwt alone does not block it.
 */
export function isPrivilegedOrAnonymousJwt(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const role = payload.role;
  if (role === "anon" || role === "service_role") return true;
  if (typeof payload.sub !== "string" || !payload.sub) return true;
  return false;
}

/** Constant-time string comparison to avoid timing side-channels when checking secrets. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify the internal server-to-server secret header (cron / pg_net dispatch path).
 *
 * Single source of truth for the `x-internal-secret` check — previously each
 * sync/dispatch function carried its own copy and they had drifted (different
 * casing, non-constant-time comparisons). Reads EMBEDDING_INTERNAL_SECRET from
 * env; returns false when the secret is unset or the header is missing/wrong.
 * Header lookup is case-insensitive (Fetch Headers normalizes names).
 */
export function verifyInternalSecret(req: Request): boolean {
  const expected = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";
  if (!expected) return false;
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

/** Extract user JWT from Authorization header; rejects anon/service_role/malformed (SEC-003). */
export function extractUserBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (isPrivilegedOrAnonymousJwt(token)) return null;
  return token;
}

/**
 * Verify JWT token from request Authorization header.
 * Returns user ID if valid, null otherwise.
 */
export async function verifyAuth(
  req: Request,
  supabase: SupabaseClient,
): Promise<string | null> {
  const token = extractUserBearerToken(req);
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

/**
 * Get user profile with organization context.
 * Returns null if user not found or not in an organization.
 */
export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: string;
} | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select(`
        id,
        organization_id,
        email,
        display_name,
        user_role_assignments (
          roles (name)
        )
      `)
      .eq("id", userId)
      .single();

    if (error || !data) return null;

    const roleName = data.user_role_assignments?.[0]?.roles?.name ?? "read_only";

    return {
      id: data.id,
      organizationId: data.organization_id,
      email: data.email,
      displayName: data.display_name ?? data.email,
      role: roleName,
    };
  } catch {
    return null;
  }
}

/**
 * Check if user has a specific role.
 */
export async function hasRole(
  supabase: SupabaseClient,
  userId: string,
  roleName: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("user_role_assignments")
      .select(`
        roles (name)
      `)
      .eq("user_id", userId);

    if (error || !data) return false;

    return data.some((assignment: { roles?: { name: string } }) =>
      assignment.roles?.name === roleName
    );
  } catch {
    return false;
  }
}

/**
 * Check if user has any of the specified roles.
 */
export async function hasAnyRole(
  supabase: SupabaseClient,
  userId: string,
  roleNames: string[],
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("user_role_assignments")
      .select(`
        roles (name)
      `)
      .eq("user_id", userId);

    if (error || !data) return false;

    return data.some((assignment: { roles?: { name: string } }) =>
      roleNames.includes(assignment.roles?.name ?? "")
    );
  } catch {
    return false;
  }
}

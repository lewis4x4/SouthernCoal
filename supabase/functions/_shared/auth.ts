/**
 * Shared authentication utilities for Edge Function parsers.
 * Handles JWT verification and user context extraction.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Verify JWT token from request Authorization header.
 * Returns user ID if valid, null otherwise.
 */
export async function verifyAuth(
  req: Request,
  supabase: SupabaseClient,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
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

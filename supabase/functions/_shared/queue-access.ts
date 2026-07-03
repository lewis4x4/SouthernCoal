/**
 * Org-scoped access checks for file_processing_queue parsers.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClient = any;

export async function getCallerOrganizationId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", userId)
    .single();

  if (error || !data?.organization_id) return null;
  return data.organization_id as string;
}

export function queueEntryMatchesCallerOrg(
  entryOrgId: string | null | undefined,
  callerOrgId: string,
): boolean {
  return typeof entryOrgId === "string" && entryOrgId.length > 0 && entryOrgId === callerOrgId;
}

export function isOrgScopedStoragePath(
  storagePath: string,
  organizationId: string,
): boolean {
  const normalized = storagePath.replace(/^\/+/, "");
  return normalized === organizationId || normalized.startsWith(`${organizationId}/`);
}

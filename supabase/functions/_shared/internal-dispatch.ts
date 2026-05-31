const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SYNC_INTERNAL_SECRET = Deno.env.get("EMBEDDING_INTERNAL_SECRET") ?? "";

/** Fire-and-forget internal Edge Function call (cron, pipelines). */
export async function triggerInternalEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (!SYNC_INTERNAL_SECRET) {
    console.warn(`[internal-dispatch] EMBEDDING_INTERNAL_SECRET not set — skip ${functionName}`);
    return;
  }

  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SYNC_INTERNAL_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    console.error(
      `[internal-dispatch] ${functionName} failed: ${resp.status} ${await resp.text()}`,
    );
  }
}

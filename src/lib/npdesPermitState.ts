import type { SupabaseClient } from '@supabase/supabase-js';

/** PostgREST `.in('id', …)` batch size for `sites` / `states` lookups. */
export const NPDES_SITE_STATE_BATCH_SIZE = 100;

/**
 * `npdes_permits` has no denormalized `state_code`; state lives on `sites` → `states.code`.
 * Works for PostgREST embeds shaped like:
 * - permit row: `sites: { states: { code } }` or `sites: [{ states: { code } }]`
 * - site row: `{ id, states: { code } }` (from `sites.select('id, states(code)')`)
 */
export function stateCodeFromPermitSiteEmbed(sites: unknown): string | null {
  const site = Array.isArray(sites) ? sites[0] : sites;
  if (!site || typeof site !== 'object') return null;
  const st = (site as { states?: unknown }).states;
  if (!st || typeof st !== 'object') return null;
  const code = (st as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function fetchSiteIdToStateCodeMapTierA(
  client: SupabaseClient,
  unique: string[],
): Promise<{ map: Map<string, string>; embedError: { message: string } | null }> {
  const map = new Map<string, string>();
  let embedError: { message: string } | null = null;
  for (let i = 0; i < unique.length; i += NPDES_SITE_STATE_BATCH_SIZE) {
    const batch = unique.slice(i, i + NPDES_SITE_STATE_BATCH_SIZE);
    const { data, error } = await client.from('sites').select('id, states(code)').in('id', batch);
    if (error) {
      embedError = { message: error.message };
      break;
    }
    for (const row of data ?? []) {
      const id = row.id as string;
      const code = stateCodeFromPermitSiteEmbed(row);
      if (code) map.set(id, code);
    }
  }
  return { map, embedError };
}

/**
 * Tier B: `sites.state_id` → `states.id` → `states.code` (no nested embed on `sites`).
 * Used when Tier A errors or leaves gaps (empty `states` embed, RLS, etc.).
 */
export async function fetchSiteIdToStateCodeMapViaStateId(
  client: SupabaseClient,
  siteIds: string[],
): Promise<{ map: Map<string, string>; error: { message: string } | null }> {
  const map = new Map<string, string>();
  const unique = [...new Set(siteIds.filter(Boolean))];
  if (unique.length === 0) return { map, error: null };

  for (let i = 0; i < unique.length; i += NPDES_SITE_STATE_BATCH_SIZE) {
    const batch = unique.slice(i, i + NPDES_SITE_STATE_BATCH_SIZE);
    const { data: siteRows, error: siteErr } = await client
      .from('sites')
      .select('id, state_id')
      .in('id', batch);
    if (siteErr) return { map, error: { message: siteErr.message } };

    const stateIds = [
      ...new Set(
        (siteRows ?? [])
          .map((r) => r.state_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (stateIds.length === 0) continue;

    const stateIdToCode = new Map<string, string>();
    for (let j = 0; j < stateIds.length; j += NPDES_SITE_STATE_BATCH_SIZE) {
      const stBatch = stateIds.slice(j, j + NPDES_SITE_STATE_BATCH_SIZE);
      const { data: stateRows, error: stErr } = await client
        .from('states')
        .select('id, code')
        .in('id', stBatch);
      if (stErr) return { map, error: { message: stErr.message } };
      for (const row of stateRows ?? []) {
        const id = row.id as string;
        const code = row.code as string;
        if (code) stateIdToCode.set(id, code);
      }
    }

    for (const site of siteRows ?? []) {
      const sid = site.id as string;
      const stId = site.state_id as string | null;
      if (stId && stateIdToCode.has(stId)) {
        const code = stateIdToCode.get(stId);
        if (code) map.set(sid, code);
      }
    }
  }
  return { map, error: null };
}

/**
 * Resolve `site_id` → state code: Tier A (`sites` + `states(code)` embed), then Tier B
 * (`state_id` + `states`) if Tier A fails or any requested site id is still missing.
 */
export async function fetchSiteIdToStateCodeMap(
  client: SupabaseClient,
  siteIds: (string | null | undefined)[],
): Promise<{ map: Map<string, string>; error: { message: string } | null }> {
  const unique = [...new Set(siteIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return { map: new Map(), error: null };

  const { map, embedError } = await fetchSiteIdToStateCodeMapTierA(client, unique);

  const needsTierB =
    embedError !== null || unique.some((id) => !map.has(id));

  if (!needsTierB) {
    return { map, error: null };
  }

  const tierBIds = embedError !== null ? unique : unique.filter((id) => !map.has(id));
  const { map: mapB, error: tierBError } = await fetchSiteIdToStateCodeMapViaStateId(
    client,
    tierBIds,
  );

  for (const [k, v] of mapB) {
    if (!map.has(k)) map.set(k, v);
  }

  if (tierBError) {
    return {
      map,
      error: tierBError,
    };
  }

  if (embedError !== null) {
    return { map, error: null };
  }

  return { map, error: null };
}

/** Field dispatch: org-scoped permits for WV (or configured) filter. */
export type LoadPermitsFieldDispatchMode = {
  kind: 'field_dispatch';
  organizationId: string;
};

/** Admin data quality: expired permits awaiting disposition (RLS-scoped). */
export type LoadPermitsDataQualityMode = {
  kind: 'data_quality_expired';
};

export type LoadPermitsWithStateMode = LoadPermitsFieldDispatchMode | LoadPermitsDataQualityMode;

export type RawPermitRowFieldDispatch = {
  id: string;
  permit_number: string;
  permittee_name: string | null;
  site_id: string | null;
};

export type RawPermitRowDataQuality = RawPermitRowFieldDispatch & {
  expiration_date: string | null;
  status: string;
  administratively_continued: boolean | null;
};

type PermitLoadResult<T extends RawPermitRowFieldDispatch> = {
  rawPermits: T[];
  siteIdToState: Map<string, string>;
  permitError: { message: string } | null;
  sitesStateError: { message: string } | null;
};

export async function loadPermitsWithStateCodes(
  client: SupabaseClient,
  mode: LoadPermitsFieldDispatchMode,
): Promise<PermitLoadResult<RawPermitRowFieldDispatch>>;
export async function loadPermitsWithStateCodes(
  client: SupabaseClient,
  mode: LoadPermitsDataQualityMode,
): Promise<PermitLoadResult<RawPermitRowDataQuality>>;
export async function loadPermitsWithStateCodes(
  client: SupabaseClient,
  mode: LoadPermitsWithStateMode,
): Promise<PermitLoadResult<RawPermitRowFieldDispatch | RawPermitRowDataQuality>> {
  if (mode.kind === 'field_dispatch') {
    const { data, error } = await client
      .from('npdes_permits')
      .select('id, permit_number, permittee_name, site_id')
      .eq('organization_id', mode.organizationId)
      .order('permit_number');

    const permitError = error ? { message: error.message } : null;
    const rawPermits = (data ?? []) as RawPermitRowFieldDispatch[];
    if (permitError) {
      return {
        rawPermits: [],
        siteIdToState: new Map(),
        permitError,
        sitesStateError: null,
      };
    }

    const { map: siteIdToState, error: sitesStateError } = await fetchSiteIdToStateCodeMap(
      client,
      rawPermits.map((r) => r.site_id),
    );
    return { rawPermits, siteIdToState, permitError: null, sitesStateError };
  }

  const { data, error } = await client
    .from('npdes_permits')
    .select(
      'id, permit_number, permittee_name, expiration_date, status, administratively_continued, site_id',
    )
    .eq('status', 'expired')
    .is('administratively_continued', null)
    .order('permit_number');

  const permitError = error ? { message: error.message } : null;
  const rawPermits = (data ?? []) as RawPermitRowDataQuality[];
  if (permitError) {
    return {
      rawPermits: [],
      siteIdToState: new Map(),
      permitError,
      sitesStateError: null,
    };
  }

  const { map: siteIdToState, error: sitesStateError } = await fetchSiteIdToStateCodeMap(
    client,
    rawPermits.map((r) => r.site_id),
  );
  return { rawPermits, siteIdToState, permitError: null, sitesStateError };
}

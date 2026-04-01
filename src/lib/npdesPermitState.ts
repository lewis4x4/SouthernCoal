/**
 * `npdes_permits` has no denormalized `state_code`; state lives on `sites` → `states.code`
 * (PostgREST embed: `sites(states(code))`).
 */
export function stateCodeFromPermitSiteEmbed(sites: unknown): string | null {
  const site = Array.isArray(sites) ? sites[0] : sites;
  if (!site || typeof site !== 'object') return null;
  const st = (site as { states?: unknown }).states;
  if (!st || typeof st !== 'object') return null;
  const code = (st as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

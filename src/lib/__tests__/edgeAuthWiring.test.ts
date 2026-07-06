import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const authSource = readFileSync(
  resolve(import.meta.dirname, '../../../supabase/functions/_shared/auth.ts'),
  'utf8',
);

const echoSyncSource = readFileSync(
  resolve(import.meta.dirname, '../../../supabase/functions/sync-echo-data/index.ts'),
  'utf8',
);

describe('sync-echo-data service role auth wiring', () => {
  it('allows gateway-verified service_role JWTs before user JWT rejection', () => {
    expect(authSource).toContain('export function isServiceRoleJwt');
    expect(authSource).toContain('getJwtRole(token) === "service_role"');
    expect(echoSyncSource).toContain('isServiceRoleJwt(token)');
    expect(echoSyncSource.indexOf('isServiceRoleJwt(token)')).toBeLessThan(
      echoSyncSource.indexOf('isPrivilegedOrAnonymousJwt(token)'),
    );
  });

  it('resolves legacy workflow permit_id payloads into target NPDES IDs', () => {
    expect(echoSyncSource).toContain('requestedPermitId = trimmedString(body.permit_id)');
    expect(echoSyncSource).toContain('.from("npdes_permits")');
    expect(echoSyncSource).toContain('.select("organization_id, permit_number, metadata, states(code)")');
    expect(echoSyncSource).toContain('targetNpdesIds = [...new Set([...targetNpdesIds, mapping.npdes_id])]');
  });

  it('handles permit_number payloads and array-shaped states embeds', () => {
    expect(echoSyncSource).toContain('Array.isArray(states) ? states[0] : states');
    expect(echoSyncSource).toContain('.eq("permit_number", requestedPermitNumber)');
    expect(echoSyncSource).toContain('.eq("metadata->>federal_npdes_id_override", requestedFederalNpdesIdOverride)');
    expect(echoSyncSource).toContain('requestedPermitMappings.push(...mappingByNpdesId.values())');
    expect(echoSyncSource).toContain('Requested permit target was not found in eligible ECHO permits');
  });
});

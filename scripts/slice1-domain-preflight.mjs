#!/usr/bin/env node
/**
 * Slice 1 — domain activation verification (RPC vs raw SQL + DMR presence).
 * Invoked by `npm run qa:slice1-domain`.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ARTIFACT = resolve(
  REPO_ROOT,
  '.qa-artifacts',
  `slice1-domain-activation-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`,
);

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run prod verification.');
  process.exit(1);
}

const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';

async function rpc(name, args = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function count(table, filter) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&${filter}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status}`);
  const range = res.headers.get('content-range') ?? '0-0/0';
  return Number(range.split('/').pop() ?? 0);
}

async function main() {
  const rpcStats = await rpc('get_upload_dashboard_domain_stats', { p_organization_id: SCC_ORG });

  const rawPermits = await count('npdes_permits', `organization_id=eq.${SCC_ORG}`);
  const rawDmrs = await fetch(
    `${url}/rest/v1/dmr_submissions?select=id,npdes_permits!inner(organization_id)&npdes_permits.organization_id=eq.${SCC_ORG}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } },
  ).then(async (res) => {
    if (!res.ok) throw new Error(`dmr_submissions: ${res.status}`);
    const range = res.headers.get('content-range') ?? '0-0/0';
    return Number(range.split('/').pop() ?? 0);
  });

  const match =
    Number(rpcStats.total_permits) === rawPermits &&
    Number(rpcStats.total_outfalls) >= 0 &&
    Number(rpcStats.total_limits) >= 0;

  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(
    ARTIFACT,
    `# Slice 1 — domain activation verification

**Org:** \`${SCC_ORG}\`  
**RPC:** permits=${rpcStats.total_permits}, outfalls=${rpcStats.total_outfalls}, limits=${rpcStats.total_limits}  
**Raw:** permits=${rawPermits}, dmr_submissions=${rawDmrs}  
**Summary cards match (permits):** ${match ? 'yes' : 'NO'}  
**DMR submissions present:** ${rawDmrs > 0 ? 'yes' : 'NO — run slice1 migration'}
`,
    'utf8',
  );

  console.log(`Artifact: ${ARTIFACT}`);
  if (!match) process.exit(1);
  if (rawDmrs < 1) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

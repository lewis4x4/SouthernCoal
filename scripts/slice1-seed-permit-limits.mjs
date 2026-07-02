#!/usr/bin/env node
/**
 * Slice 1 — backfill permit_limits from ECHO rows with limit_value.
 * Invoked by `npm run qa:slice1-seed-permit-limits`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const batchLimit = arg('--limit', 50);
const batches = arg('--batches', 10);

async function rpc(name, args) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text}`);
  return JSON.parse(text);
}

async function countPermitLimits() {
  const res = await fetch(
    `${url}/rest/v1/permit_limits?select=id,npdes_permits!inner(organization_id)&npdes_permits.organization_id=eq.${SCC_ORG}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } },
  );
  const range = res.headers.get('content-range') ?? '0-0/0';
  return Number(range.split('/').pop() ?? 0);
}

async function main() {
  const before = await countPermitLimits();
  const results = [];

  for (let i = 0; i < batches; i += 1) {
    const result = await rpc('seed_slice1_permit_limits_from_echo', {
      p_organization_id: SCC_ORG,
      p_limit: batchLimit,
    });
    results.push(result);
    console.log(`Batch ${i + 1}:`, result);
    if (Number(result.inserted) === 0) break;
  }

  const after = await countPermitLimits();
  const artifact = resolve(
    REPO_ROOT,
    '.qa-artifacts',
    `slice1-permit-limit-backfill-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`,
  );
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(
    artifact,
    `# Slice 1 — ECHO permit limit backfill

**Org:** \`${SCC_ORG}\`
**Before permit_limits:** ${before}
**After permit_limits:** ${after}
**Batches:** ${results.length}

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`

Re-run \`npm run qa:slice1-seed-exceedances\` then \`npm run qa:slice1-reconcile\` after backfill.
`,
    'utf8',
  );
  console.log(`Artifact: ${artifact}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

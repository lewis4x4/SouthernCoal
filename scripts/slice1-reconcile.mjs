#!/usr/bin/env node
/**
 * Slice 1 — loop reconcile_missing_internal_discrepancies until exhausted.
 * Invoked by `npm run qa:slice1-reconcile`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';

function loadEnvLocal() {
  const envPath = resolve(REPO_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

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

const batchLimit = arg('--limit', 10000);
const maxBatches = arg('--batches', 50);

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
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function countPending(type) {
  const filter = type ? `&discrepancy_type=eq.${type}` : '';
  const res = await fetch(
    `${url}/rest/v1/discrepancy_reviews?select=id&organization_id=eq.${SCC_ORG}&status=eq.pending${filter}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } },
  );
  return Number((res.headers.get('content-range') ?? '0-0/0').split('/').pop() ?? 0);
}

async function main() {
  const before = await countPending('missing_internal');
  const results = [];

  for (let i = 0; i < maxBatches; i += 1) {
    const result = await rpc('reconcile_missing_internal_discrepancies', {
      p_organization_id: SCC_ORG,
      p_limit: batchLimit,
    });
    results.push(result);
    console.log(`Batch ${i + 1}:`, result);
    if (Number(result.resolved) === 0) break;
  }

  const after = await countPending('missing_internal');
  const artifact = resolve(
    REPO_ROOT,
    '.qa-artifacts',
    `slice1-reconcile-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`,
  );
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(
    artifact,
    `# Slice 1 — missing_internal reconcile

**Before:** ${before} pending  
**After:** ${after} pending  
**Resolved this run:** ${before - after}

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`
`,
    'utf8',
  );
  console.log(`Artifact: ${artifact}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

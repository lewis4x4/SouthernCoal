#!/usr/bin/env node
/**
 * Slice 1 — batch seed internal exceedances from ECHO violations (Rule 2 unlock).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   node scripts/slice1-seed-exceedances.mjs [--limit 5000] [--batches 1]
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

const batchLimit = arg('--limit', 250);
const batches = arg('--batches', 1);

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

async function countExceedances() {
  const res = await fetch(
    `${url}/rest/v1/exceedances?select=id&organization_id=eq.${SCC_ORG}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } },
  );
  const range = res.headers.get('content-range') ?? '0-0/0';
  return Number(range.split('/').pop() ?? 0);
}

async function main() {
  const before = await countExceedances();
  const results = [];

  for (let i = 0; i < batches; i += 1) {
    const result = await rpc('seed_slice1_exceedances_from_echo', {
      p_organization_id: SCC_ORG,
      p_limit: batchLimit,
    });
    results.push(result);
    console.log(`Batch ${i + 1}:`, result);
    if (Number(result.seeded) === 0) break;
  }

  const after = await countExceedances();
  const artifact = resolve(
    REPO_ROOT,
    '.qa-artifacts',
    `slice1-exceedance-seed-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`,
  );
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(
    artifact,
    `# Slice 1 — exceedance batch seed

**Org:** \`${SCC_ORG}\`
**Before exceedances:** ${before}
**After exceedances:** ${after}
**Batches:** ${results.length}

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

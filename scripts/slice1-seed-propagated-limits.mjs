#!/usr/bin/env node
/**
 * Slice 1 phase 2 — propagate permit_limits from sibling outfalls (KYGE40869 etc.).
 * Invoked by `npm run qa:slice1-seed-propagated-limits`.
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
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function numArg(name, fallback) {
  const v = arg(name, null);
  return v != null ? Number(v) : fallback;
}

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const permitNumber = arg('--permit', 'KYGE40869');
const batchLimit = numArg('--limit', 100);
const batches = numArg('--batches', 3);

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

async function gapCount() {
  const report = await rpc('report_slice1_activation_gaps', {
    p_organization_id: SCC_ORG,
  });
  const top = (report.top_permits_missing_limits ?? []).find(
    (row) => row.permit_number === permitNumber || row.npdes_id === permitNumber,
  );
  return top?.missing_limit_keys ?? null;
}

async function main() {
  const beforeGap = await gapCount();
  const results = [];

  for (let i = 0; i < batches; i += 1) {
    const result = await rpc('seed_slice1_permit_limits_propagate', {
      p_organization_id: SCC_ORG,
      p_permit_number: permitNumber,
      p_limit: batchLimit,
    });
    results.push(result);
    console.log(`Batch ${i + 1}:`, result);
    if (Number(result.inserted) === 0) break;
  }

  const afterGap = await gapCount();
  const cleared = beforeGap != null && beforeGap > 0 && afterGap == null;
  const pass = afterGap === 0 || cleared;

  const artifact = resolve(
    REPO_ROOT,
    '.qa-artifacts',
    `slice1-propagate-limit-backfill-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`,
  );
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(
    artifact,
    `# Slice 1 phase 2 — propagate permit limit backfill

**Org:** \`${SCC_ORG}\`
**Permit:** \`${permitNumber}\`
**Missing limit keys before:** ${beforeGap ?? 'unknown'}
**Missing limit keys after:** ${afterGap ?? '0 (permit cleared from top gaps list)'}
**Batches:** ${results.length}

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`

**Pass:** ${pass ? 'yes' : 'NO — re-run or inspect templates'}
`,
    'utf8',
  );

  console.log(`Missing keys: ${beforeGap} → ${afterGap}`);
  console.log(`Artifact: ${artifact}`);
  if (!pass && beforeGap != null && afterGap != null && afterGap > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

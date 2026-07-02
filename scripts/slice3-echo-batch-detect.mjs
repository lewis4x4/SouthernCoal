#!/usr/bin/env node
/**
 * Slice 3 — batched ECHO discrepancy detect (one NPDES ID per invocation).
 *
 * Full org detect exceeds Edge worker limits (~336K DMRs). This script loops
 * distinct facility NPDES IDs and dispatches run_detect_discrepancies_echo_job
 * with target_npdes_ids scoped to a single permit.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/slice3-echo-batch-detect.mjs [--limit N] [--offset N] [--wait SEC]
 *
 * Optional dry-run: --dry-run (list IDs only)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseArgs(argv) {
  const opts = { limit: null, offset: 0, waitSec: 90, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else if (a === '--offset') opts.offset = Number(argv[++i]);
    else if (a === '--wait') opts.waitSec = Number(argv[++i]);
  }
  return opts;
}

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function rpc(name, args = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function restCount(table, filter = '') {
  const q = filter ? `?select=id&${filter}` : '?select=id';
  const res = await fetch(`${url}/rest/v1/${table}${q}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`${table} count: ${res.status} ${await res.text()}`);
  const range = res.headers.get('content-range') ?? '0-0/0';
  return Number(range.split('/').pop() ?? 0);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!url || !serviceKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const rows = await rest(
    `external_echo_facilities?select=npdes_id&organization_id=eq.${SCC_ORG}&order=npdes_id`,
  );
  const allIds = [...new Set((rows ?? []).map((r) => String(r.npdes_id).trim().toUpperCase()))].sort();
  const slice = allIds.slice(opts.offset, opts.limit != null ? opts.offset + opts.limit : undefined);

  console.log(`[batch-detect] ${allIds.length} distinct NPDES IDs; processing ${slice.length} (offset=${opts.offset})`);

  if (opts.dryRun) {
    console.log(slice.join('\n'));
    process.exit(0);
  }

  const beforeDisc = await restCount('discrepancy_reviews', `organization_id=eq.${SCC_ORG}`);
  const results = [];

  for (let i = 0; i < slice.length; i++) {
    const npdesId = slice[i];
    const started = Date.now();
    console.log(`[batch-detect] ${i + 1}/${slice.length} ${npdesId}…`);
    try {
      const requestId = await rpc('run_detect_discrepancies_echo_job', {
        p_organization_id: SCC_ORG,
        p_target_npdes_ids: [npdesId],
      });
      results.push({ npdesId, ok: true, requestId, ms: Date.now() - started });
    } catch (err) {
      results.push({ npdesId, ok: false, error: err.message, ms: Date.now() - started });
      console.error(`[batch-detect] FAILED ${npdesId}:`, err.message);
    }
    if (i < slice.length - 1 && opts.waitSec > 0) {
      await sleep(opts.waitSec * 1000);
    }
  }

  // Allow last edge worker to finish
  if (slice.length > 0 && opts.waitSec > 0) {
    console.log(`[batch-detect] Waiting ${opts.waitSec}s for final worker…`);
    await sleep(opts.waitSec * 1000);
  }

  const afterDisc = await restCount('discrepancy_reviews', `organization_id=eq.${SCC_ORG}`);
  const artifact = resolve(REPO_ROOT, '.qa-artifacts', `slice3-echo-batch-detect-${STAMP}.md`);
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });

  const md = `# Slice 3 — batched ECHO discrepancy detect

**Captured:** ${new Date().toISOString()}  
**Org:** \`${SCC_ORG}\`  
**Batch:** offset=${opts.offset}, limit=${opts.limit ?? 'all'}, processed=${slice.length}

## Counts

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| discrepancy_reviews | ${beforeDisc} | ${afterDisc} | ${afterDisc - beforeDisc >= 0 ? '+' : ''}${afterDisc - beforeDisc} |

## Results

| NPDES | OK | ms | detail |
|-------|:--:|---:|--------|
${results.map((r) => `| ${r.npdesId} | ${r.ok ? '✓' : '✗'} | ${r.ms} | ${r.ok ? `req ${r.requestId}` : r.error} |`).join('\n')}

## Remaining

${allIds.length - opts.offset - slice.length} permits not yet processed in this batch window.
`;

  writeFileSync(artifact, md);
  console.log(`[batch-detect] Wrote ${artifact}`);
  console.log(`[batch-detect] discrepancy_reviews: ${beforeDisc} → ${afterDisc}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error('[batch-detect] FAILED:', err);
  process.exit(1);
});

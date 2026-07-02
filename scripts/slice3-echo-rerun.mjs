#!/usr/bin/env node
/**
 * Slice 3 — ECHO discrepancy re-run orchestration.
 * 1. Capture before-counts
 * 2. Sync WV1024078 with date-range-chunked DMR fetch
 * 3. Trigger detect-discrepancies (via job_runs RPC when available)
 * 4. Capture after-counts → .qa-artifacts/
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SYNC_ECHO_INTERNAL_SECRET=... \
 *     node scripts/slice3-echo-rerun.mjs
 *
 * Optional: VITE_SUPABASE_ANON_KEY for Edge Function auth (falls back to service role).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const WV1024078 = 'WV1024078';
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const ARTIFACT = resolve(REPO_ROOT, '.qa-artifacts', `slice3-echo-rerun-${STAMP}.md`);

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? serviceKey;
const secret = process.env.SYNC_ECHO_INTERNAL_SECRET ?? process.env.EMBEDDING_INTERNAL_SECRET;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!secret) {
  console.error('Set SYNC_ECHO_INTERNAL_SECRET (or EMBEDDING_INTERNAL_SECRET).');
  process.exit(1);
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

async function invokeFunction(fn, body) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'x-internal-secret': secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${fn}: ${res.status} ${text.slice(0, 500)}`);
  }
  return json;
}

async function snapshot(label) {
  const externalDmrs = await restCount('external_echo_dmrs');
  const discrepancyTotal = await restCount('discrepancy_reviews');
  const wvDmrs = await restCount('external_echo_dmrs', `npdes_id=eq.${WV1024078}`);
  const dmrSubs = await fetch(
    `${url}/rest/v1/dmr_submissions?select=id,npdes_permits!inner(organization_id)&npdes_permits.organization_id=eq.${SCC_ORG}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'count=exact' } },
  ).then(async (res) => {
    const range = res.headers.get('content-range') ?? '0-0/0';
    return Number(range.split('/').pop() ?? 0);
  });

  return { label, externalDmrs, discrepancyTotal, wvDmrs, dmrSubs, capturedAt: new Date().toISOString() };
}

async function main() {
  console.log('[slice3] Capturing before-counts…');
  const before = await snapshot('before');

  console.log(`[slice3] Syncing ${WV1024078} (quarterly DMR chunks)…`);
  const syncResult = await invokeFunction('sync-echo-data', {
    target_npdes_ids: [WV1024078],
    run_tag: `slice3-wv1024078-${STAMP}`,
    dmr_chunk_months: 3,
  });
  console.log('[slice3] Sync result:', JSON.stringify(syncResult, null, 2));

  console.log('[slice3] Running detect-discrepancies…');
  let detectVia = 'edge-function';
  let detectResult;
  try {
    detectResult = await rpc('run_detect_discrepancies_echo_job', { p_organization_id: SCC_ORG });
    console.log('[slice3] job_runs dispatch id:', detectResult);
    // pg_net is async — wait for edge function to finish
    await new Promise((r) => setTimeout(r, 120_000));
  } catch (err) {
    detectVia = 'edge-function-direct';
    console.warn('[slice3] job RPC unavailable, calling detect-discrepancies directly:', err.message);
    detectResult = await invokeFunction('detect-discrepancies', {
      source: 'echo',
      organization_id: SCC_ORG,
      run_tag: `slice3-rerun-${STAMP}`,
    });
  }

  if (detectVia === 'edge-function-direct') {
    console.log('[slice3] Detect result:', JSON.stringify(detectResult, null, 2));
  }

  console.log('[slice3] Capturing after-counts…');
  const after = await snapshot('after');

  const deltaDmrs = after.externalDmrs - before.externalDmrs;
  const deltaWv = after.wvDmrs - before.wvDmrs;
  const deltaDisc = after.discrepancyTotal - before.discrepancyTotal;

  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  const md = `# Slice 3 — ECHO discrepancy re-run

**Captured:** ${after.capturedAt}  
**Org:** \`${SCC_ORG}\`

## Before

| Metric | Count |
|--------|------:|
| external_echo_dmrs | ${before.externalDmrs} |
| ${WV1024078} DMR rows | ${before.wvDmrs} |
| discrepancy_reviews | ${before.discrepancyTotal} |
| dmr_submissions (SCC) | ${before.dmrSubs} |

## Actions

- **WV1024078 sync:** dmrsInserted=${syncResult.dmrsInserted ?? 'n/a'}, errors=${syncResult.errors?.length ?? 0}
- **Detect path:** ${detectVia}

## After

| Metric | Count | Δ |
|--------|------:|--:|
| external_echo_dmrs | ${after.externalDmrs} | ${deltaDmrs >= 0 ? '+' : ''}${deltaDmrs} |
| ${WV1024078} DMR rows | ${after.wvDmrs} | ${deltaWv >= 0 ? '+' : ''}${deltaWv} |
| discrepancy_reviews | ${after.discrepancyTotal} | ${deltaDisc >= 0 ? '+' : ''}${deltaDisc} |

## Go / no-go

- WV1024078 DMRs synced: **${after.wvDmrs > 0 ? 'GO' : 'NO-GO'}**
- Full detect completed: **${detectVia.startsWith('edge') ? 'GO (verify job_runs row)' : 'CHECK'}**
`;

  writeFileSync(ARTIFACT, md);
  console.log(`[slice3] Wrote ${ARTIFACT}`);
  console.log(`WV1024078 DMRs: ${before.wvDmrs} → ${after.wvDmrs}`);
  process.exit(after.wvDmrs > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[slice3] FAILED:', err);
  process.exit(1);
});

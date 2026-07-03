#!/usr/bin/env node
/**
 * Slice 1 phase 3 — KYGE40869 activation chain (prod QA orchestrator).
 *
 * Steps:
 *   0. Activation gaps (before)
 *   1. Seed exceedances from ECHO mirror
 *   2. Repair stuck mirror keys
 *   3. Reconcile missing_internal discrepancies
 *   4. Activation gaps (after)
 *   5. Scoped ECHO detect on KYGE40869
 *
 * Usage:
 *   npm run qa:slice1-activation-chain
 *   npm run qa:slice1-activation-chain -- --permit WV1018965
 *   npm run qa:slice1-activation-chain -- --skip-detect
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

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

function parseArgs(argv) {
  const opts = {
    permit: 'KYGE40869',
    skipDetect: false,
    exceedanceLimit: 250,
    exceedanceBatches: 10,
    repairLimit: 100,
    reconcileLimit: 10000,
    reconcileBatches: 10,
    detectWaitSec: 20,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skip-detect') opts.skipDetect = true;
    else if (a === '--permit') opts.permit = String(argv[++i]).trim().toUpperCase();
    else if (a === '--exceedance-limit') opts.exceedanceLimit = Number(argv[++i]);
    else if (a === '--exceedance-batches') opts.exceedanceBatches = Number(argv[++i]);
    else if (a === '--repair-limit') opts.repairLimit = Number(argv[++i]);
    else if (a === '--reconcile-limit') opts.reconcileLimit = Number(argv[++i]);
    else if (a === '--reconcile-batches') opts.reconcileBatches = Number(argv[++i]);
    else if (a === '--detect-wait') opts.detectWaitSec = Number(argv[++i]);
  }
  return opts;
}

function runStep(label, script, args = []) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [resolve(REPO_ROOT, script), ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${label} exited ${result.status ?? 'unknown'}`);
  }
}

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

async function countPending(type) {
  const filter = type ? `&discrepancy_type=eq.${type}` : '';
  const res = await fetch(
    `${url}/rest/v1/discrepancy_reviews?select=id&organization_id=eq.${SCC_ORG}&status=eq.pending${filter}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } },
  );
  return Number((res.headers.get('content-range') ?? '0-0/0').split('/').pop() ?? 0);
}

function permitRank(report, permit) {
  const top = report.top_permits_missing_limits ?? [];
  const idx = top.findIndex((r) => String(r.npdes_id ?? r.permit_number ?? '').toUpperCase() === permit);
  return idx >= 0 ? idx + 1 : null;
}

function funnelLine(report, stage) {
  return report.funnel?.[stage] ?? '—';
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!url || !key) {
    console.error('Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const beforeGaps = await rpc('report_slice1_activation_gaps', { p_organization_id: SCC_ORG });
  const beforePending = await countPending('missing_internal');
  const beforePermitRank = permitRank(beforeGaps, opts.permit);

  runStep('Activation gaps (before)', 'scripts/slice1-activation-gaps.mjs', ['--suffix', 'before']);

  runStep('Seed exceedances', 'scripts/slice1-seed-exceedances.mjs', [
    '--limit',
    String(opts.exceedanceLimit),
    '--batches',
    String(opts.exceedanceBatches),
  ]);

  runStep('Repair stuck keys', 'scripts/slice1-repair-stuck-keys.mjs', [
    '--limit',
    String(opts.repairLimit),
  ]);

  runStep('Reconcile missing_internal', 'scripts/slice1-reconcile.mjs', [
    '--limit',
    String(opts.reconcileLimit),
    '--batches',
    String(opts.reconcileBatches),
  ]);

  runStep('Activation gaps (after)', 'scripts/slice1-activation-gaps.mjs', ['--suffix', 'after']);

  const afterGaps = await rpc('report_slice1_activation_gaps', { p_organization_id: SCC_ORG });
  const afterPending = await countPending('missing_internal');
  const afterPermitRank = permitRank(afterGaps, opts.permit);

  let detectNote = '_Skipped (--skip-detect)_';
  if (!opts.skipDetect) {
    runStep(`Scoped detect (${opts.permit})`, 'scripts/slice3-echo-batch-detect.mjs', [
      '--permit',
      opts.permit,
      '--wait',
      String(opts.detectWaitSec),
    ]);
    detectNote = `Ran slice3-echo-batch-detect --permit ${opts.permit}`;
  }

  const deltaPermitLimit = funnelLine(afterGaps, 'has_permit_limit') - funnelLine(beforeGaps, 'has_permit_limit');
  const deltaPending = afterPending - beforePending;
  const permitOffTop =
    beforePermitRank != null && afterPermitRank == null
      ? `Yes — ${opts.permit} was #${beforePermitRank}, now off top-10`
      : afterPermitRank != null
        ? `No — ${opts.permit} still ranked #${afterPermitRank}`
        : `${opts.permit} was not on top gap list before or after`;

  const md = `# Slice 1 phase 3 — ${opts.permit} activation chain

**Started:** ${startedAt}  
**Finished:** ${new Date().toISOString()}  
**Org:** \`${SCC_ORG}\`

## Acceptance checks

| Check | Result |
|-------|--------|
| \`has_permit_limit\` increased | ${deltaPermitLimit >= 0 ? deltaPermitLimit : deltaPermitLimit} (${funnelLine(beforeGaps, 'has_permit_limit')} → ${funnelLine(afterGaps, 'has_permit_limit')}) |
| Pending \`missing_internal\` dropped | ${deltaPending <= 0 ? `${beforePending} → ${afterPending} (Δ ${deltaPending})` : `${beforePending} → ${afterPending} (Δ +${deltaPending})`} |
| ${opts.permit} off top gap list | ${permitOffTop} |
| Scoped detect | ${detectNote} |

## Funnel (before → after)

| Stage | Before | After | Δ |
|-------|-------:|------:|--:|
| Violation keys | ${funnelLine(beforeGaps, 'distinct_violation_keys')} | ${funnelLine(afterGaps, 'distinct_violation_keys')} | ${Number(funnelLine(afterGaps, 'distinct_violation_keys')) - Number(funnelLine(beforeGaps, 'distinct_violation_keys'))} |
| Has permit_limit | ${funnelLine(beforeGaps, 'has_permit_limit')} | ${funnelLine(afterGaps, 'has_permit_limit')} | ${deltaPermitLimit} |
| Mirror keys | ${beforeGaps.mirror_keys ?? '—'} | ${afterGaps.mirror_keys ?? '—'} | ${Number(afterGaps.mirror_keys ?? 0) - Number(beforeGaps.mirror_keys ?? 0)} |

## Commands run

\`\`\`bash
npm run qa:slice1-activation-gaps -- --suffix before
npm run qa:slice1-seed-exceedances -- --limit ${opts.exceedanceLimit} --batches ${opts.exceedanceBatches}
npm run qa:slice1-repair-stuck-keys -- --limit ${opts.repairLimit}
npm run qa:slice1-reconcile -- --limit ${opts.reconcileLimit} --batches ${opts.reconcileBatches}
npm run qa:slice1-activation-gaps -- --suffix after
${opts.skipDetect ? '# detect skipped' : `npm run qa:slice3-echo-batch-detect -- --permit ${opts.permit} --wait ${opts.detectWaitSec}`}
\`\`\`

## Raw gap reports

<details><summary>Before</summary>

\`\`\`json
${JSON.stringify(beforeGaps, null, 2)}
\`\`\`

</details>

<details><summary>After</summary>

\`\`\`json
${JSON.stringify(afterGaps, null, 2)}
\`\`\`

</details>
`;

  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const artifact = resolve(outDir, `slice1-${opts.permit.toLowerCase()}-activation-chain-${STAMP}.md`);
  writeFileSync(artifact, md);
  console.log(`\nChain artifact: ${artifact}`);
}

main().catch((err) => {
  console.error('[activation-chain] FAILED:', err);
  process.exit(1);
});

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
 *     node scripts/slice3-echo-batch-detect.mjs [--limit N] [--offset N] [--wait SEC] [--resume]
 *
 * Optional dry-run: --dry-run (list IDs only)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const PROGRESS_FILE = resolve(REPO_ROOT, '.qa-artifacts', 'slice3-echo-batch-detect-progress.json');

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseArgs(argv) {
  const opts = { limit: null, offset: 0, waitSec: 20, dryRun: false, resume: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--resume') opts.resume = true;
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

async function snapshotDiscrepancies() {
  const orgFilter = `organization_id=eq.${SCC_ORG}`;
  const total = await restCount('discrepancy_reviews', orgFilter);
  const types = ['missing_internal', 'value_mismatch', 'status_mismatch', 'missing_external'];
  const byType = {};
  for (const t of types) {
    byType[t] = await restCount('discrepancy_reviews', `${orgFilter}&discrepancy_type=eq.${t}`);
  }
  return { total, byType };
}

async function jobRunSummary(sinceIso) {
  const rows = await rest(
    `job_runs?select=status,rows_affected,error_detail&job_name=eq.detect-discrepancies-echo&organization_id=eq.${SCC_ORG}&started_at=gte.${sinceIso}&order=started_at.desc`,
  );
  const summary = { succeeded: 0, failed: 0, rows_affected: 0, failures: [] };
  for (const row of rows ?? []) {
    if (row.status === 'succeeded') {
      summary.succeeded++;
      summary.rows_affected += row.rows_affected ?? 0;
    } else if (row.status === 'failed') {
      summary.failed++;
      summary.failures.push(row.error_detail ?? 'unknown');
    }
  }
  return summary;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeProgress(data) {
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function readProgress() {
  if (!existsSync(PROGRESS_FILE)) return null;
  return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'));
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

  if (opts.resume) {
    const progress = readProgress();
    if (progress?.nextOffset != null) {
      opts.offset = progress.nextOffset;
      console.log(`[batch-detect] Resuming from offset ${opts.offset}`);
    }
  }

  const slice = allIds.slice(opts.offset, opts.limit != null ? opts.offset + opts.limit : undefined);

  console.log(`[batch-detect] ${allIds.length} distinct NPDES IDs; processing ${slice.length} (offset=${opts.offset})`);

  if (opts.dryRun) {
    console.log(slice.join('\n'));
    process.exit(0);
  }

  const runStartedAt = new Date().toISOString();
  const before = await snapshotDiscrepancies();
  const beforeDmrs = await restCount('external_echo_dmrs');
  const results = [];

  for (let i = 0; i < slice.length; i++) {
    const npdesId = slice[i];
    const started = Date.now();
    console.log(`[batch-detect] ${opts.offset + i + 1}/${allIds.length} ${npdesId}…`);
    try {
      const requestId = await rpc('run_detect_discrepancies_echo_job', {
        p_organization_id: SCC_ORG,
        p_target_npdes_ids: [npdesId],
      });
      results.push({ npdesId, ok: true, requestId, ms: Date.now() - started });
      writeProgress({
        startedAt: runStartedAt,
        nextOffset: opts.offset + i + 1,
        lastNpdesId: npdesId,
        processed: opts.offset + i + 1,
        total: allIds.length,
      });
    } catch (err) {
      results.push({ npdesId, ok: false, error: err.message, ms: Date.now() - started });
      console.error(`[batch-detect] FAILED ${npdesId}:`, err.message);
    }
    if (i < slice.length - 1 && opts.waitSec > 0) {
      await sleep(opts.waitSec * 1000);
    }
  }

  if (slice.length > 0 && opts.waitSec > 0) {
    console.log(`[batch-detect] Waiting ${opts.waitSec}s for final worker…`);
    await sleep(opts.waitSec * 1000);
  }

  const after = await snapshotDiscrepancies();
  const afterDmrs = await restCount('external_echo_dmrs');
  const jobs = await jobRunSummary(runStartedAt);
  const artifact = resolve(REPO_ROOT, '.qa-artifacts', `slice3-echo-batch-detect-${STAMP}.md`);
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });

  const deltaTotal = after.total - before.total;
  const deltaMissing =
    (after.byType.missing_internal ?? 0) - (before.byType.missing_internal ?? 0);

  const md = `# Slice 3 — batched ECHO discrepancy detect (task 3.35)

**Captured:** ${new Date().toISOString()}  
**Org:** \`${SCC_ORG}\`  
**Batch:** offset=${opts.offset}, limit=${opts.limit ?? 'all'}, processed=${slice.length} / ${allIds.length} facilities

## Before / after

| Metric | Before | After | Δ |
|--------|-------:|------:|--:|
| discrepancy_reviews (total) | ${before.total} | ${after.total} | ${deltaTotal >= 0 ? '+' : ''}${deltaTotal} |
| missing_internal | ${before.byType.missing_internal ?? 0} | ${after.byType.missing_internal ?? 0} | ${deltaMissing >= 0 ? '+' : ''}${deltaMissing} |
| value_mismatch | ${before.byType.value_mismatch ?? 0} | ${after.byType.value_mismatch ?? 0} | ${(after.byType.value_mismatch ?? 0) - (before.byType.value_mismatch ?? 0)} |
| status_mismatch | ${before.byType.status_mismatch ?? 0} | ${after.byType.status_mismatch ?? 0} | ${(after.byType.status_mismatch ?? 0) - (before.byType.status_mismatch ?? 0)} |
| external_echo_dmrs | ${beforeDmrs} | ${afterDmrs} | ${afterDmrs - beforeDmrs} |

## job_runs (detect-discrepancies-echo since batch start)

| Metric | Count |
|--------|------:|
| succeeded | ${jobs.succeeded} |
| failed | ${jobs.failed} |
| rows_affected (sum) | ${jobs.rows_affected} |

${jobs.failures.length > 0 ? `Failures: ${jobs.failures.slice(0, 5).join('; ')}` : ''}

## Per-permit dispatch

| NPDES | OK | ms | detail |
|-------|:--:|---:|--------|
${results.map((r) => `| ${r.npdesId} | ${r.ok ? '✓' : '✗'} | ${r.ms} | ${r.ok ? `req ${r.requestId}` : r.error} |`).join('\n')}

## Remaining

${Math.max(0, allIds.length - opts.offset - slice.length)} permits not processed in this window. Resume with \`--resume\` or \`--offset ${opts.offset + slice.length}\`.

## Notes

- Scoped detect dedupes via \`batch_insert_discrepancies\`; safe to re-run permits.
- \`missing_internal\` shrinks materially only as internal \`dmr_submissions\` / permit data grows (Slice 1).
- WV1024078 DMR sync remains upstream-blocked (EPA 502) per prior slice3 artifact.
`;

  writeFileSync(artifact, md);
  if (opts.offset + slice.length >= allIds.length) {
    writeProgress({ completedAt: new Date().toISOString(), total: allIds.length });
  }
  console.log(`[batch-detect] Wrote ${artifact}`);
  console.log(`[batch-detect] discrepancy_reviews: ${before.total} → ${after.total}`);
  console.log(`[batch-detect] job_runs: ${jobs.succeeded} ok, ${jobs.failed} failed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error('[batch-detect] FAILED:', err);
  process.exit(1);
});

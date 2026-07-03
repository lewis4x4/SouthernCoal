#!/usr/bin/env node
/**
 * Slice 3 — WV1024078 ECHO DMR parameter-sliced sync probe.
 *
 * Usage:
 *   npm run qa:slice3-wv1024078-sync
 *   npm run qa:slice3-wv1024078-sync -- --parameters 00400,50050,00530 --chunk-index 0 --months 1
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const NPDES_ID = 'WV1024078';
const STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const RUN_ID = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

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

function parseArgs(argv) {
  const opts = {
    months: 1,
    chunkIndex: 0,
    parameters: ['00400', '50050', '00530'],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--months') opts.months = Number(argv[++i]);
    else if (a === '--chunk-index') opts.chunkIndex = Number(argv[++i]);
    else if (a === '--parameters') {
      opts.parameters = String(argv[++i])
        .split(',')
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean);
    }
  }
  return opts;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function echoUrl(failure) {
  if (!failure?.start_date || !failure?.end_date) return '';
  const [sy, sm, sd] = failure.start_date.split('-');
  const [ey, em, ed] = failure.end_date.split('-');
  const query = new URLSearchParams({
    p_id: NPDES_ID,
    output: 'JSON',
    p_start_date: `${sm}/${sd}/${sy}`,
    p_end_date: `${em}/${ed}/${ey}`,
  });
  if (failure.parameter_code) query.set('parameter_code', failure.parameter_code);
  return `https://echodata.epa.gov/echo/eff_rest_services.get_effluent_chart?${query}`;
}

loadEnvLocal();
const opts = parseArgs(process.argv);
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.SYNC_ECHO_INTERNAL_SECRET ?? process.env.EMBEDDING_INTERNAL_SECRET;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

async function restCount(table, filter = '') {
  const q = filter ? `?select=id&${filter}` : '?select=id';
  const res = await fetch(`${url}/rest/v1/${table}${q}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  const range = res.headers.get('content-range') ?? '0-0/0';
  return Number(range.split('/').pop() ?? 0);
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function syncBody() {
  return {
    target_npdes_ids: [NPDES_ID],
    run_tag: `slice3-wv1024078-parameter-${RUN_ID}`,
    dmr_only: true,
    dmr_chunk_months: opts.months,
    dmr_chunk_index: opts.chunkIndex,
    dmr_parameter_codes: opts.parameters,
  };
}

async function invokeSync() {
  const res = await fetch(`${url}/functions/v1/sync-echo-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      ...(secret ? { 'x-internal-secret': secret } : {}),
    },
    body: JSON.stringify(syncBody()),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`sync-echo-data ${res.status}: ${text.slice(0, 1000)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function latestSyncLog() {
  const rows = await rest(
    `external_sync_log?select=id,status,records_synced,records_failed,error_details,metadata,started_at,completed_at&source=eq.echo_facility&metadata->>run_tag=eq.${syncBody().run_tag}&order=started_at.desc&limit=1`,
  );
  return rows?.[0] ?? null;
}

async function waitForJobRun(requestId) {
  for (let attempt = 0; attempt < 54; attempt++) {
    const rows = await rest(
      `job_runs?select=id,status,rows_scanned,rows_affected,error_detail,started_at,finished_at,net_request_id&net_request_id=eq.${requestId}&order=started_at.desc&limit=1`,
    );
    const jobRun = rows?.[0] ?? null;
    if (jobRun && !['running', 'dispatched'].includes(jobRun.status)) return jobRun;
    await sleep(5000);
  }
  throw new Error(`dispatch_edge_job request ${requestId} did not finish within 270s`);
}

async function dispatchViaRpc() {
  const requestId = await rpc('dispatch_edge_job', {
    p_job_name: 'sync-echo-npdes-target',
    p_org_id: null,
    p_function_path: 'sync-echo-data',
    p_body: syncBody(),
  });
  const jobRun = await waitForJobRun(requestId);
  const syncLog = await latestSyncLog();
  const metadata = syncLog?.metadata ?? {};
  return {
    success: jobRun.status !== 'failed',
    invocation: 'dispatch_edge_job',
    requestId,
    jobRun,
    syncLog,
    syncLogId: syncLog?.id,
    dmrsInserted: metadata.dmrs_inserted ?? jobRun.rows_affected ?? 0,
    dmr_parameter_slices: metadata.dmr_parameter_slices ?? 0,
    dmr_parameter_failures: metadata.dmr_parameter_failures ?? [],
    errors: syncLog?.error_details?.errors,
  };
}

async function invokeSyncWithFallback() {
  try {
    return await invokeSync();
  } catch (err) {
    if (err.status !== 401) throw err;
    console.warn('Direct Edge invocation returned 401; dispatching via vault-backed dispatch_edge_job RPC.');
    return dispatchViaRpc();
  }
}

async function main() {
  const before = await restCount('external_echo_dmrs', `npdes_id=eq.${NPDES_ID}`);
  const startedAt = new Date().toISOString();
  const syncResult = await invokeSyncWithFallback();
  const after = await restCount('external_echo_dmrs', `npdes_id=eq.${NPDES_ID}`);
  const failures = syncResult.dmr_parameter_failures ?? [];

  const failureRows = failures.map((failure) => ({
    parameter_code: failure.parameter_code ?? '',
    start_date: failure.start_date ?? '',
    end_date: failure.end_date ?? '',
    reason: failure.reason ?? '',
    url: echoUrl(failure),
  }));

  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const artifact = resolve(outDir, `slice3-wv1024078-sync-${STAMP}.md`);
  const csvPath = resolve(outDir, `slice3-wv1024078-sync-failures-${STAMP}.csv`);

  const md = `# Slice 3 — WV1024078 parameter-sliced ECHO DMR sync

**Started:** ${startedAt}
**Finished:** ${new Date().toISOString()}
**Org:** \`${SCC_ORG}\`

## Request

| Field | Value |
|-------|-------|
| NPDES | \`${NPDES_ID}\` |
| chunk_months | ${opts.months} |
| chunk_index | ${opts.chunkIndex} |
| parameters | ${opts.parameters.map((p) => `\`${p}\``).join(', ')} |
| run_tag | \`${syncBody().run_tag}\` |

## Result

| Metric | Count |
|--------|------:|
| DMR rows before | ${before} |
| DMR rows after | ${after} |
| DMR rows delta | ${after - before} |
| dmrsInserted response | ${syncResult.dmrsInserted ?? 0} |
| parameter slices attempted | ${syncResult.dmr_parameter_slices ?? 0} |
| parameter failures | ${failures.length} |
| invocation | ${syncResult.invocation ?? 'direct-edge'} |

## Failed EPA windows

${failureRows.length
    ? `| Parameter | Start | End | Reason |\n|-----------|-------|-----|--------|\n${failureRows
      .map((row) => `| ${row.parameter_code || '-'} | ${row.start_date} | ${row.end_date} | ${row.reason} |`)
      .join('\n')}`
    : '_None_'}

## Raw sync response

\`\`\`json
${JSON.stringify(syncResult, null, 2)}
\`\`\`
`;

  writeFileSync(artifact, md);
  writeFileSync(
    csvPath,
    [
      'parameter_code,start_date,end_date,reason,url',
      ...failureRows.map((row) =>
        [row.parameter_code, row.start_date, row.end_date, row.reason, row.url].map(csvEscape).join(','),
      ),
    ].join('\n') + '\n',
  );

  console.log(`WV1024078 DMR rows: ${before} -> ${after} (delta ${after - before})`);
  console.log(`Parameter failures: ${failures.length}`);
  console.log(`Artifact: ${artifact}`);
  console.log(`Failures CSV: ${csvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

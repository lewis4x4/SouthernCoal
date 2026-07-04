#!/usr/bin/env node
/**
 * Slice 1 - batch activation runner for the next WV missing-limit permits.
 *
 * Pulls the current top missing-limit permits from report_slice1_activation_gaps,
 * runs scripts/slice1-activation-chain.mjs permit-by-permit, and writes one
 * ranked summary artifact with before/after deltas and exact commands.
 *
 * Usage:
 *   npm run qa:slice1-activation-batch
 *   npm run qa:slice1-activation-batch -- --limit 3 --skip-detect
 *   npm run qa:slice1-activation-batch -- --include-existing-today
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const RUN_STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

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
    limit: 5,
    statePrefix: 'WV',
    includeExistingToday: false,
    continueOnError: false,
    skipDetect: false,
    dryRun: false,
    exceedanceLimit: 50,
    exceedanceBatches: 20,
    repairLimit: 50,
    repairBatches: 10,
    reconcileLimit: 10000,
    reconcileBatches: 10,
    detectWaitSec: 20,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--limit') opts.limit = Number(argv[++i]);
    else if (a === '--state-prefix') opts.statePrefix = String(argv[++i] ?? '').trim().toUpperCase();
    else if (a === '--all-states') opts.statePrefix = '';
    else if (a === '--include-existing-today') opts.includeExistingToday = true;
    else if (a === '--continue-on-error') opts.continueOnError = true;
    else if (a === '--skip-detect') opts.skipDetect = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--exceedance-limit') opts.exceedanceLimit = Number(argv[++i]);
    else if (a === '--exceedance-batches') opts.exceedanceBatches = Number(argv[++i]);
    else if (a === '--repair-limit') opts.repairLimit = Number(argv[++i]);
    else if (a === '--repair-batches') opts.repairBatches = Number(argv[++i]);
    else if (a === '--reconcile-limit') opts.reconcileLimit = Number(argv[++i]);
    else if (a === '--reconcile-batches') opts.reconcileBatches = Number(argv[++i]);
    else if (a === '--detect-wait') opts.detectWaitSec = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }

  if (!Number.isFinite(opts.limit) || opts.limit < 1) {
    throw new Error('--limit must be a positive number');
  }
  return opts;
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

async function activationReport() {
  return rpc('report_slice1_activation_gaps', { p_organization_id: SCC_ORG });
}

function topRows(report) {
  return Array.isArray(report?.top_permits_missing_limits) ? report.top_permits_missing_limits : [];
}

function permitId(row) {
  return String(row?.permit_number ?? row?.npdes_id ?? '').trim().toUpperCase();
}

function rowMatchesState(row, statePrefix) {
  if (!statePrefix) return true;
  const permit = permitId(row);
  const npdes = String(row?.npdes_id ?? '').trim().toUpperCase();
  return permit.startsWith(statePrefix) || npdes.startsWith(statePrefix);
}

function findPermitRow(report, permit) {
  const normalized = String(permit).trim().toUpperCase();
  return topRows(report).find((row) => permitId(row) === normalized || String(row.npdes_id ?? '').toUpperCase() === normalized);
}

function permitRank(report, permit) {
  const normalized = String(permit).trim().toUpperCase();
  const idx = topRows(report).findIndex(
    (row) => permitId(row) === normalized || String(row.npdes_id ?? '').toUpperCase() === normalized,
  );
  return idx >= 0 ? idx + 1 : null;
}

function n(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function metric(report, key) {
  if (key in (report?.funnel ?? {})) return n(report.funnel[key]);
  return n(report?.[key]);
}

function signed(delta) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function beforeAfter(before, after) {
  return `${before} -> ${after} (${signed(after - before)})`;
}

function mdTable(rows, cols) {
  const header = `| ${cols.map((c) => c.label).join(' |')} |`;
  const sep = `| ${cols.map((c) => c.align ?? '---').join(' |')} |`;
  const body = rows.map((row) => `| ${cols.map((c) => row[c.key] ?? '').join(' |')} |`).join('\n');
  return [header, sep, body].filter(Boolean).join('\n');
}

function shellQuote(arg) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function commandLine(cmd) {
  return cmd.map(shellQuote).join(' ');
}

function chainArgs(opts, permit) {
  const args = [
    '--permit',
    permit,
    '--exceedance-limit',
    String(opts.exceedanceLimit),
    '--exceedance-batches',
    String(opts.exceedanceBatches),
    '--repair-limit',
    String(opts.repairLimit),
    '--repair-batches',
    String(opts.repairBatches),
    '--reconcile-limit',
    String(opts.reconcileLimit),
    '--reconcile-batches',
    String(opts.reconcileBatches),
    '--detect-wait',
    String(opts.detectWaitSec),
  ];
  if (opts.skipDetect) args.push('--skip-detect');
  return args;
}

function existingChainPermitsToday() {
  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  if (!existsSync(outDir)) return new Set();

  const permits = new Set();
  const re = new RegExp(`^slice1-(.+)-activation-chain-${DATE_STAMP}\\.md$`, 'i');
  for (const file of readdirSync(outDir)) {
    const match = file.match(re);
    if (match) permits.add(match[1].toUpperCase());
  }
  return permits;
}

function chainArtifactPath(permit) {
  return resolve(REPO_ROOT, '.qa-artifacts', `slice1-${permit.toLowerCase()}-activation-chain-${DATE_STAMP}.md`);
}

function rel(path) {
  return relative(REPO_ROOT, path);
}

function selectNextPermit(report, opts, attempted, skippedToday) {
  return topRows(report).find((row) => {
    const permit = permitId(row);
    if (!permit) return false;
    if (!rowMatchesState(row, opts.statePrefix)) return false;
    if (attempted.has(permit)) return false;
    if (!opts.includeExistingToday && skippedToday.has(permit)) return false;
    return true;
  });
}

function summarizeRun(run) {
  const beforeFunnel = run.beforeReport?.funnel ?? {};
  const afterFunnel = run.afterReport?.funnel ?? beforeFunnel;
  const beforeRow = run.beforeRow;
  const afterRow = run.afterRow;
  const artifact = chainArtifactPath(run.permit);

  return {
    run_rank: run.runRank,
    top_rank_before: run.beforeRank ?? 'off top-25',
    top_rank_after: run.afterRank ?? 'off top-25',
    permit: run.permit,
    missing_limit_keys:
      afterRow == null
        ? `${n(beforeRow?.missing_limit_keys)} -> off top-25`
        : beforeAfter(n(beforeRow?.missing_limit_keys), n(afterRow.missing_limit_keys)),
    has_permit_limit: beforeAfter(n(beforeFunnel.has_permit_limit), n(afterFunnel.has_permit_limit)),
    mirror_keys: beforeAfter(n(run.beforeReport?.mirror_keys), n(run.afterReport?.mirror_keys)),
    pending_missing_internal: beforeAfter(
      n(run.beforeReport?.pending_missing_internal),
      n(run.afterReport?.pending_missing_internal),
    ),
    synthetic_limits: beforeAfter(n(run.beforeReport?.synthetic_echo_limits), n(run.afterReport?.synthetic_echo_limits)),
    status: run.status,
    artifact: existsSync(artifact) ? rel(artifact) : '',
  };
}

function writeSummary({ opts, startedAt, finishedAt, initialReport, finalReport, runs, commands, skippedToday }) {
  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `slice1-${opts.statePrefix || 'all'}-batch-activation-${RUN_STAMP}.md`.toLowerCase());
  const summaryRows = runs.map(summarizeRun);
  const status = runs.some((run) => run.status === 'failed') ? 'failed' : opts.dryRun ? 'dry-run' : 'completed';
  const failedRuns = runs.filter((run) => run.status === 'failed');
  const overallRows = [
    {
      metric: 'Violation keys',
      delta: beforeAfter(metric(initialReport, 'distinct_violation_keys'), metric(finalReport, 'distinct_violation_keys')),
    },
    {
      metric: 'Has permit_limit',
      delta: beforeAfter(metric(initialReport, 'has_permit_limit'), metric(finalReport, 'has_permit_limit')),
    },
    {
      metric: 'Mirror keys',
      delta: beforeAfter(metric(initialReport, 'mirror_keys'), metric(finalReport, 'mirror_keys')),
    },
    {
      metric: 'Pending missing_internal',
      delta: beforeAfter(
        metric(initialReport, 'pending_missing_internal'),
        metric(finalReport, 'pending_missing_internal'),
      ),
    },
    {
      metric: 'SYNTHETIC ECHO limits',
      delta: beforeAfter(metric(initialReport, 'synthetic_echo_limits'), metric(finalReport, 'synthetic_echo_limits')),
    },
  ];

  const md = `# Slice 1 ${opts.statePrefix || 'all-state'} batch activation

**Started:** ${startedAt}
**Finished:** ${finishedAt}
**Status:** ${status}
**Org:** \`${SCC_ORG}\`
**Selection:** current \`report_slice1_activation_gaps\` top missing-limit permits, state prefix \`${opts.statePrefix || 'ALL'}\`
**Limit:** ${opts.limit}

## Ranked summary

${
  summaryRows.length
    ? mdTable(summaryRows, [
        { key: 'run_rank', label: 'Run rank', align: '--:' },
        { key: 'top_rank_before', label: 'Top rank before', align: '--:' },
        { key: 'top_rank_after', label: 'Top rank after', align: '--:' },
        { key: 'permit', label: 'Permit' },
        { key: 'missing_limit_keys', label: 'Missing-limit keys' },
        { key: 'has_permit_limit', label: 'Has permit_limit' },
        { key: 'mirror_keys', label: 'Mirror keys' },
        { key: 'pending_missing_internal', label: 'Pending missing_internal' },
        { key: 'synthetic_limits', label: 'Synthetic limits' },
        { key: 'status', label: 'Status' },
        { key: 'artifact', label: 'Chain artifact' },
      ])
    : '_No eligible permits selected._'
}

## Overall deltas

${mdTable(overallRows, [
  { key: 'metric', label: 'Metric' },
  { key: 'delta', label: 'Before -> after' },
])}

## Today's skipped chain artifacts

${opts.includeExistingToday ? '_Existing artifacts were not skipped._' : Array.from(skippedToday).sort().join(', ') || '_None_'}

## Commands run

\`\`\`bash
${commands.length ? commands.join('\n') : '# none'}
\`\`\`

## Failures

${failedRuns.length ? failedRuns.map((run) => `- ${run.permit}: ${run.error ?? 'unknown error'}`).join('\n') : '_None_'}

## Initial gap report

\`\`\`json
${JSON.stringify(initialReport, null, 2)}
\`\`\`

## Final gap report

\`\`\`json
${JSON.stringify(finalReport, null, 2)}
\`\`\`
`;

  writeFileSync(path, md, 'utf8');
  return path;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!url || !key) {
    console.error('Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const skippedToday = existingChainPermitsToday();
  const attempted = new Set();
  const runs = [];
  const commands = [];

  let report = await activationReport();
  const initialReport = report;

  for (let runRank = 1; runRank <= opts.limit; runRank += 1) {
    const row = selectNextPermit(report, opts, attempted, skippedToday);
    if (!row) break;

    const permit = permitId(row);
    const args = chainArgs(opts, permit);
    const cmd = ['npm', 'run', 'qa:slice1-activation-chain', '--', ...args];
    const command = commandLine(cmd);
    const beforeReport = report;
    const beforeRow = findPermitRow(beforeReport, permit) ?? row;
    const beforeRank = permitRank(beforeReport, permit);

    attempted.add(permit);
    commands.push(command);
    console.log(`\n=== Batch ${runRank}: ${permit} ===`);
    console.log(command);

    let status = opts.dryRun ? 'planned' : 'completed';
    let error = null;
    if (!opts.dryRun) {
      const result = spawnSync(cmd[0], cmd.slice(1), {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        env: process.env,
        shell: process.platform === 'win32',
      });
      if (result.status !== 0) {
        status = 'failed';
        error = `${permit} activation chain exited ${result.status ?? 'unknown'}`;
        console.error(error);
      }
    }

    let afterReport = beforeReport;
    try {
      afterReport = opts.dryRun ? beforeReport : await activationReport();
    } catch (err) {
      status = 'failed';
      error = `${error ? `${error}; ` : ''}after-report failed: ${err.message}`;
      console.error(error);
    }

    runs.push({
      runRank,
      permit,
      beforeReport,
      afterReport,
      beforeRow,
      afterRow: findPermitRow(afterReport, permit),
      beforeRank,
      afterRank: permitRank(afterReport, permit),
      status,
      error,
      command,
    });

    report = afterReport;
    if (status === 'failed' && !opts.continueOnError) break;
  }

  const finishedAt = new Date().toISOString();
  const artifact = writeSummary({
    opts,
    startedAt,
    finishedAt,
    initialReport,
    finalReport: report,
    runs,
    commands,
    skippedToday,
  });

  console.log(`\nBatch artifact: ${artifact}`);

  if (runs.some((run) => run.status === 'failed')) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[activation-batch] FAILED:', err);
  process.exit(1);
});

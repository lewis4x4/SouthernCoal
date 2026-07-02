#!/usr/bin/env node
/**
 * Slice 4 — export pending status_mismatch rows for human triage.
 * Invoked by `npm run qa:slice4-status-mismatch`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

async function fetchAll() {
  const res = await fetch(
    `${url}/rest/v1/discrepancy_reviews?select=id,npdes_id,severity,description,internal_value,external_value,detected_at&organization_id=eq.${SCC_ORG}&discrepancy_type=eq.status_mismatch&status=eq.pending&order=severity.desc,npdes_id.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`fetch: ${res.status} ${await res.text()}`);
  return res.json();
}

function summarize(rows) {
  const byExternal = new Map();
  for (const row of rows) {
    const ext = row.external_value ?? 'unknown';
    byExternal.set(ext, (byExternal.get(ext) ?? 0) + 1);
  }
  return [...byExternal.entries()].sort((a, b) => b[1] - a[1]);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows) {
  const header = 'id,npdes_id,severity,description,internal_value,external_value,detected_at';
  const lines = rows.map((r) =>
    [
      r.id,
      r.npdes_id,
      r.severity,
      r.description,
      r.internal_value,
      r.external_value,
      r.detected_at,
    ]
      .map(csvEscape)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

async function main() {
  const rows = await fetchAll();
  const summary = summarize(rows);
  const critical = rows.filter((r) => r.severity === 'critical').length;
  const dateStamp = new Date().toISOString().slice(0, 10);

  const md = `# Slice 4 — status_mismatch triage export

**Date:** ${dateStamp}  
**Pending rows:** ${rows.length}  
**Critical:** ${critical}

## Pattern

All rows are **permit status** mismatches: internal \`npdes_permits.status = active\` vs ECHO facility status.

| ECHO status | Count |
|-------------|------:|
${summary.map(([k, n]) => `| ${k} | ${n} |`).join('\n')}

## Action

Review in **Review Queue** → filter **Type: Status Mismatch**. For each permit decide:

1. Update internal permit status to match ECHO (if SCC confirms termination/expiry), or
2. Dismiss with notes if internal \`active\` is correct (renewal pending, ECHO lag).

**Do not bulk-mark reviewed** — these are permit lifecycle decisions, not detection noise.

## Sample (first 10)

\`\`\`json
${JSON.stringify(rows.slice(0, 10), null, 2)}
\`\`\`
`;

  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const mdPath = resolve(outDir, `slice4-status-mismatch-triage-${dateStamp}.md`);
  const csvPath = resolve(outDir, `slice4-status-mismatch-${dateStamp}.csv`);
  writeFileSync(mdPath, md);
  writeFileSync(csvPath, buildCsv(rows));

  console.log(`Pending status_mismatch: ${rows.length} (${critical} critical)`);
  for (const [k, n] of summary) console.log(`  ${k}: ${n}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(`CSV: ${csvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

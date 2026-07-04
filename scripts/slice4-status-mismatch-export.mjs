#!/usr/bin/env node
/**
 * Slice 4 — export and optionally close safe pending status_mismatch rows.
 *
 * Default mode is read-only. Pass --apply-safe-dismisses to dismiss only rows
 * where ECHO permit_status maps to the current internal npdes_permits.status.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const APPLY_SAFE_DISMISSES = process.argv.includes('--apply-safe-dismisses');
const SAFE_DISMISS_REASON = 'Internal status already matches ECHO semantic status';
const SAFE_DISMISS_NOTE =
  'Auto-dismissed by Slice 4 closeout: ECHO permit_status maps to the current internal npdes_permits.status; no permit lifecycle change required.';

loadEnvLocal();

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or env.');
  process.exit(1);
}

function loadEnvLocal() {
  const envPath = resolve(REPO_ROOT, '.env.local');
  try {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, name, rawValue] = match;
      if (process.env[name] !== undefined) continue;
      process.env[name] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Environment variables may be supplied by the shell in CI.
  }
}

function mapEchoPermitStatusToInternal(echoStatus) {
  const normalized = String(echoStatus ?? '').toLowerCase().trim();
  if (!normalized) return null;
  if (normalized.includes('terminated')) return 'terminated';
  if (normalized.includes('expired')) return 'expired';
  if (normalized.includes('admin continued')) return 'administratively_continued';
  if (normalized.includes('effective')) return 'active';
  if (normalized.includes('pending renewal') || normalized.includes('pending_renewal')) {
    return 'pending_renewal';
  }
  if (normalized.includes('revoked')) return 'revoked';
  if (normalized === 'active') return 'active';
  if (normalized === 'draft') return 'draft';
  return null;
}

function normalizeInternalStatus(status) {
  return String(status ?? '').toLowerCase().trim();
}

function classifyStatusMismatch(row) {
  const mapped = mapEchoPermitStatusToInternal(row.external_value);
  const internal = normalizeInternalStatus(row.internal_value);
  const isEchoPermitStatus =
    row.source === 'echo' &&
    row.discrepancy_type === 'status_mismatch' &&
    row.internal_source_table === 'npdes_permits';

  if (isEchoPermitStatus && mapped && mapped === internal) {
    return {
      classification: 'dismiss_with_note',
      mapped_internal_status: mapped,
      automation_note: SAFE_DISMISS_NOTE,
    };
  }

  if (isEchoPermitStatus && mapped && mapped !== internal && row.internal_source_id) {
    return {
      classification: 'one_click_align_candidate',
      mapped_internal_status: mapped,
      automation_note: `Confirm permit lifecycle, then set internal status to ${mapped}.`,
    };
  }

  return {
    classification: 'human_judgment',
    mapped_internal_status: mapped ?? '',
    automation_note: mapped
      ? 'Mapped status is available, but the row is missing permit-source context required for automation.'
      : 'ECHO status is not recognized by the permit status map.',
  };
}

function classifyRows(rows) {
  const buckets = {
    dismissWithNote: [],
    oneClickAlign: [],
    humanJudgment: [],
  };
  for (const row of rows) {
    const classification = classifyStatusMismatch(row);
    const enriched = { ...row, ...classification };
    if (classification.classification === 'dismiss_with_note') {
      buckets.dismissWithNote.push(enriched);
    } else if (classification.classification === 'one_click_align_candidate') {
      buckets.oneClickAlign.push(enriched);
    } else {
      buckets.humanJudgment.push(enriched);
    }
  }
  return buckets;
}

async function rest(path, options = {}) {
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAll() {
  const query = new URL(`${url}/rest/v1/discrepancy_reviews`);
  query.searchParams.set(
    'select',
    [
      'id',
      'organization_id',
      'npdes_id',
      'source',
      'severity',
      'description',
      'discrepancy_type',
      'internal_value',
      'external_value',
      'internal_source_table',
      'internal_source_id',
      'external_source_id',
      'detected_at',
      'reviewed_at',
      'updated_at',
      'dismiss_reason',
      'review_notes',
      'recurrence_count',
    ].join(','),
  );
  query.searchParams.set('organization_id', `eq.${SCC_ORG}`);
  query.searchParams.set('discrepancy_type', 'eq.status_mismatch');
  query.searchParams.set('status', 'eq.pending');
  query.searchParams.set('order', 'severity.desc,npdes_id.asc');

  const res = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`fetch: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchSafeDismissedSince(dateStamp) {
  const query = new URL(`${url}/rest/v1/discrepancy_reviews`);
  query.searchParams.set(
    'select',
    [
      'id',
      'organization_id',
      'npdes_id',
      'source',
      'severity',
      'description',
      'discrepancy_type',
      'internal_value',
      'external_value',
      'internal_source_table',
      'internal_source_id',
      'external_source_id',
      'detected_at',
      'reviewed_at',
      'updated_at',
      'dismiss_reason',
      'review_notes',
      'recurrence_count',
    ].join(','),
  );
  query.searchParams.set('organization_id', `eq.${SCC_ORG}`);
  query.searchParams.set('discrepancy_type', 'eq.status_mismatch');
  query.searchParams.set('status', 'eq.dismissed');
  query.searchParams.set('dismiss_reason', `eq.${SAFE_DISMISS_REASON}`);
  query.searchParams.set('updated_at', `gte.${dateStamp}T00:00:00.000Z`);
  query.searchParams.set('order', 'updated_at.desc,npdes_id.asc');

  const res = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`fetch dismissed: ${res.status} ${await res.text()}`);
  return res.json();
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

async function applySafeDismisses(rows) {
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const updatedRows = [];

  for (const chunk of chunkRows(rows, 100)) {
    const ids = chunk.map((row) => row.id).join(',');
    const path =
      `/rest/v1/discrepancy_reviews?id=in.(${ids})` +
      '&organization_id=eq.' +
      SCC_ORG +
      '&status=eq.pending&source=eq.echo&discrepancy_type=eq.status_mismatch';

    const data = await rest(path, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'dismissed',
        reviewed_at: now,
        updated_at: now,
        dismiss_reason: SAFE_DISMISS_REASON,
        review_notes: SAFE_DISMISS_NOTE,
      }),
    });
    if (Array.isArray(data)) updatedRows.push(...data);
  }

  const updatedIds = new Set(updatedRows.map((row) => row.id));
  const auditRows = rows.filter((row) => updatedIds.has(row.id)).map((row) => ({
    user_id: null,
    organization_id: row.organization_id,
    action: 'discrepancy_dismissed',
    module: 'external_data',
    table_name: 'discrepancy_reviews',
    record_id: row.id,
    new_values: {
      automation: 'slice4-status-mismatch-export',
      classification: 'dismiss_with_note',
      dismiss_reason: SAFE_DISMISS_REASON,
      mapped_internal_status: row.mapped_internal_status,
      external_value: row.external_value,
      internal_value: row.internal_value,
    },
    description: 'Auto-dismissed semantic ECHO status_mismatch row',
  }));

  for (const chunk of chunkRows(auditRows, 100)) {
    await rest('/rest/v1/audit_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(chunk),
    });
  }

  return updatedRows.length;
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
  const columns = [
    'classification',
    'mapped_internal_status',
    'automation_note',
    'id',
    'npdes_id',
    'source',
    'severity',
    'description',
    'internal_value',
    'external_value',
    'internal_source_table',
    'internal_source_id',
    'external_source_id',
    'detected_at',
    'reviewed_at',
    'updated_at',
    'dismiss_reason',
    'review_notes',
    'recurrence_count',
  ];
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','));
  return [columns.join(','), ...lines].join('\n');
}

function buildMarkdown({
  dateStamp,
  beforeRows,
  beforeBuckets,
  afterRows,
  afterBuckets,
  appliedCount,
  safeDismissedToday,
}) {
  const summary = summarize(afterRows);
  const critical = afterRows.filter((r) => r.severity === 'critical').length;
  const mode = APPLY_SAFE_DISMISSES ? 'Applied safe semantic dismisses' : 'Dry run only';

  return `# Slice 4 — status_mismatch triage export

**Date:** ${dateStamp}
**Mode:** ${mode}
**Pending rows before:** ${beforeRows.length}
**Safe dismiss-with-note candidates before:** ${beforeBuckets.dismissWithNote.length}
**Safe dismisses applied:** ${appliedCount}
**Safe semantic rows dismissed today:** ${safeDismissedToday.length}
**Pending rows after:** ${afterRows.length}
**Critical after:** ${critical}

## Pattern

Rows are **permit status** mismatches: internal \`npdes_permits.status\` vs ECHO facility \`permit_status\`.

| ECHO status | Count after automation |
|-------------|-----------------------:|
${summary.map(([k, n]) => `| ${k} | ${n} |`).join('\n')}

## Automation split

| Bucket | Before | After | Action |
|--------|-------:|------:|--------|
| Dismiss with note | ${beforeBuckets.dismissWithNote.length} | ${afterBuckets.dismissWithNote.length} | Safe only when ECHO status maps to the current internal status |
| One-click align candidate | ${beforeBuckets.oneClickAlign.length} | ${afterBuckets.oneClickAlign.length} | Confirm lifecycle, then use Review Queue's status-align button |
| Human judgment | ${beforeBuckets.humanJudgment.length} | ${afterBuckets.humanJudgment.length} | Missing context or unmapped external status |

## Operator action

Use **Review Queue** → filter **Type: Status Mismatch**. The semantic dismiss action/script only clears rows where no internal permit lifecycle change is needed. For remaining rows, confirm SCC/ECHO authority before clicking **Set internal status** in the detail panel, then dismiss with notes.

## Artifacts

- \`slice4-status-mismatch-dismiss-with-note-${dateStamp}.csv\` — current rows eligible for semantic dismiss.
- \`slice4-status-mismatch-safe-dismissed-${dateStamp}.csv\` — safe semantic rows dismissed today.
- \`slice4-status-mismatch-one-click-align-${dateStamp}.csv\` — rows with an internal target status and permit id.
- \`slice4-status-mismatch-human-judgment-${dateStamp}.csv\` — rows missing safe automation context.
- \`slice4-status-mismatch-operator-final-${dateStamp}.md\` — final operator list excluding rows already safe-dismissed.

## Sample after automation (first 10)

\`\`\`json
${JSON.stringify(afterRows.slice(0, 10), null, 2)}
\`\`\`
`;
}

function buildOperatorMarkdown({ dateStamp, afterBuckets }) {
  const alignRows = afterBuckets.oneClickAlign;
  const manualRows = afterBuckets.humanJudgment;

  return `# Slice 4 — final operator status_mismatch list

**Date:** ${dateStamp}
**One-click align candidates:** ${alignRows.length}
**Human-judgment rows without safe automation context:** ${manualRows.length}

## One-click align candidates

Confirm the permit lifecycle decision first, then open the row in **Review Queue** and click **Set internal status**. After alignment, dismiss the discrepancy with a note.

${alignRows.length === 0 ? '_None._' : buildMarkdownTable(alignRows)}

## Human-judgment rows

These rows were not safe-dismissed and do not have enough mapped permit context for one-click alignment.

${manualRows.length === 0 ? '_None._' : buildMarkdownTable(manualRows)}
`;
}

function buildMarkdownTable(rows) {
  const limited = rows.slice(0, 200);
  const body = limited
    .map((row) =>
      [
        row.npdes_id ?? '',
        row.internal_value ?? '',
        row.external_value ?? '',
        row.mapped_internal_status ?? '',
        row.id,
      ].join(' | '),
    )
    .map((line) => `| ${line} |`)
    .join('\n');
  const suffix =
    rows.length > limited.length
      ? `\n\n_Showing first ${limited.length} of ${rows.length}; use the CSV for the full list._`
      : '';
  return `| NPDES | Internal | ECHO | Target | Review row |
|-------|----------|------|--------|------------|
${body}${suffix}`;
}

async function main() {
  const beforeRows = await fetchAll();
  const beforeBuckets = classifyRows(beforeRows);
  const dateStamp = new Date().toISOString().slice(0, 10);

  let appliedCount = 0;
  if (APPLY_SAFE_DISMISSES) {
    appliedCount = await applySafeDismisses(beforeBuckets.dismissWithNote);
  }

  const afterRows = APPLY_SAFE_DISMISSES ? await fetchAll() : beforeRows;
  const afterBuckets = classifyRows(afterRows);
  const safeDismissedToday = await fetchSafeDismissedSince(dateStamp);
  const afterAllEnriched = [
    ...afterBuckets.dismissWithNote,
    ...afterBuckets.oneClickAlign,
    ...afterBuckets.humanJudgment,
  ];

  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });

  const mdPath = resolve(outDir, `slice4-status-mismatch-triage-${dateStamp}.md`);
  const csvPath = resolve(outDir, `slice4-status-mismatch-${dateStamp}.csv`);
  const dismissPath = resolve(outDir, `slice4-status-mismatch-dismiss-with-note-${dateStamp}.csv`);
  const safeDismissedPath = resolve(outDir, `slice4-status-mismatch-safe-dismissed-${dateStamp}.csv`);
  const alignPath = resolve(outDir, `slice4-status-mismatch-one-click-align-${dateStamp}.csv`);
  const humanPath = resolve(outDir, `slice4-status-mismatch-human-judgment-${dateStamp}.csv`);
  const operatorPath = resolve(outDir, `slice4-status-mismatch-operator-final-${dateStamp}.md`);

  writeFileSync(
    mdPath,
    buildMarkdown({
      dateStamp,
      beforeRows,
      beforeBuckets,
      afterRows,
      afterBuckets,
      appliedCount,
      safeDismissedToday,
    }),
  );
  writeFileSync(csvPath, buildCsv(afterAllEnriched));
  writeFileSync(dismissPath, buildCsv(beforeBuckets.dismissWithNote));
  writeFileSync(safeDismissedPath, buildCsv(safeDismissedToday.map((row) => ({ ...row, ...classifyStatusMismatch(row) }))));
  writeFileSync(alignPath, buildCsv(afterBuckets.oneClickAlign));
  writeFileSync(humanPath, buildCsv(afterBuckets.humanJudgment));
  writeFileSync(operatorPath, buildOperatorMarkdown({ dateStamp, afterBuckets }));

  console.log(`Mode: ${APPLY_SAFE_DISMISSES ? 'apply-safe-dismisses' : 'dry-run'}`);
  console.log(`Pending before: ${beforeRows.length}`);
  console.log(`Safe dismiss candidates before: ${beforeBuckets.dismissWithNote.length}`);
  console.log(`Safe dismisses applied: ${appliedCount}`);
  console.log(`Safe semantic rows dismissed today: ${safeDismissedToday.length}`);
  console.log(`Pending after: ${afterRows.length}`);
  console.log(`One-click align candidates after: ${afterBuckets.oneClickAlign.length}`);
  console.log(`Human-judgment rows after: ${afterBuckets.humanJudgment.length}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Final operator artifact: ${operatorPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

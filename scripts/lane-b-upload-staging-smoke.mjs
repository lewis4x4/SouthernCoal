#!/usr/bin/env node
/**
 * Lane B slice 3 — staging smoke runner + worksheet generator.
 * Invoked by `npm run qa:upload-dashboard-staging`.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ARTIFACT_DIR = resolve(REPO_ROOT, '.qa-artifacts');
const DATE = new Date().toISOString().slice(0, 10);

function extractSmokeTitles() {
  const src = readFileSync(
    resolve(REPO_ROOT, 'src/lib/uploadDashboardSmokeChecklist.ts'),
    'utf8',
  );
  const titles = [...src.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  const steps = [...src.matchAll(/manualSteps: \[\s*\n\s*'([^']+)'/g)].map((m) => m[1]);
  return titles.map((title, i) => ({ order: i + 1, title, hint: steps[i] ?? '' }));
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

const preflight = run('npm', ['run', 'qa:upload-dashboard']);
if (preflight.status !== 0) process.exit(preflight.status ?? 1);

const pipeline = run('npx', ['vitest', 'run', 'uploadDashboardPipeline']);
if (pipeline.status !== 0) process.exit(pipeline.status ?? 1);

mkdirSync(ARTIFACT_DIR, { recursive: true });
const artifactPath = resolve(ARTIFACT_DIR, `lane-b-upload-staging-smoke-${DATE.replace(/-/g, '')}.md`);

const rows = extractSmokeTitles().map(
  (check) =>
    `| **${check.order}. ${check.title}** | ☐ | ${check.hint} |`,
).join('\n');

const body = `# Lane B — Upload Dashboard staging smoke (${DATE})

**Route:** \`/compliance\`  
**Automated gate:** \`npm run qa:upload-dashboard-staging\` — pass (v6 wiring + pipeline logic E2E)  
**Prod:** org RLS \`20260701182156_upload_dashboard_org_rls_hardening\` applied  
**Spec:** \`SCC_Upload_Dashboard_Handoff_v5.md\` + v6 DELTA §12

## Manual sign-off (v6 §12)

| Check | Pass | Notes |
|-------|------|-------|
${rows}

## E2E golden path (recommended first manual run)

1. Log in as COMPLIANCE_UPLOAD role user with org assignment.
2. Drag a WV permit PDF to staging → confirm state/category auto-detect.
3. Upload → confirm \`file_processing_queue\` row with \`organization_id\` + Storage path \`permits/WV/...\`.
4. Click **Process** → confirm status moves to \`processing\` / \`parsed\` via Realtime.
5. Click Compliance Matrix **WV × NPDES Permits** cell → queue filters to WV permits.
6. Export matrix CSV → confirm \`audit_log\` row \`matrix_export_csv\`.

Track in Go-Live: seed group \`upload-dashboard-v6\`.
`;

writeFileSync(artifactPath, body, 'utf8');

console.log(`\nWrote staging worksheet: ${artifactPath}`);
console.log('Next: run manual checks at /compliance and mark pass/fail in the worksheet.\n');

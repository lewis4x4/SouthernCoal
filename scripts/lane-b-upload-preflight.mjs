#!/usr/bin/env node
/**
 * Lane B Upload Dashboard preflight — v6 §12 automated smoke + manual checklist reminder.
 * Invoked by `npm run qa:upload-dashboard`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function runNpmScript(script) {
  return spawnSync('npm', ['run', script], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

const smoke = runNpmScript('smoke:upload-dashboard');
if (smoke.status !== 0) {
  process.exit(smoke.status ?? 1);
}

const orgRls = spawnSync(
  'npx',
  ['vitest', 'run', 'uploadDashboardOrgRlsMigration'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (orgRls.status !== 0) {
  process.exit(orgRls.status ?? 1);
}

console.log('\n--- Lane B Upload Dashboard manual smoke (v6 §12) ---');
console.log('Route: /compliance (Upload Dashboard)');
console.log('In-app panel: Production smoke checklist → expand each of 10 checks');
console.log('Spec: SCC_Upload_Dashboard_Handoff_v5.md + v6 DELTA §12');
console.log('Org RLS hardening: live on prod as 20260701182156_upload_dashboard_org_rls_hardening');
console.log('Ledger drift: remote-only migrations exist — see supabase/BASELINE_ADOPTION.md before db push\n');

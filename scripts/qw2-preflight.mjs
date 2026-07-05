#!/usr/bin/env node
/**
 * Lane C QW2 automated preflight — ¶49 clock + exceedance-only logic tests.
 * Invoked by `npm run qa:qw2`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.qw2.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C QW2 manual verification ---');
console.log('Automated gate passed. Activate ¶49 flags in staging:');
console.log('  1. Apply migrations through 20260705150000_qw2_paragraph49_rpc_hardening.sql');
console.log('  2. Run scripts/seed-qw2-uat-edd-flags.sql (after seed-lane-a-wv-uat.sql)');
console.log('  3. Open /compliance/late-incomplete-edd as wv-uat-admin@invalid.scc.local');
console.log('  4. Expect 1 Late >48h + 1 Exceedance-only row, each with a coupled work order');
console.log('  5. Verify non-manager users cannot update ¶49 triage status via RPC\n');

#!/usr/bin/env node
/**
 * Lane C QW4 automated preflight — PM-due RPC migration tests.
 * Invoked by `npm run qa:qw4`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.qw4.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C QW4 manual verification ---');
console.log('Automated gate passed. Activate overdue gear in staging:');
console.log('  1. Run scripts/seed-qw4-uat-equipment-pm.sql (after seed-lane-a-wv-uat.sql)');
console.log('  2. Open /admin/equipment as wv-uat-admin@invalid.scc.local');
console.log('  3. Overdue Gear tab — expect 1 overdue + 1 due within 14 days (2 total)\n');

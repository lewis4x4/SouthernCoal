#!/usr/bin/env node
/**
 * Lane C QW3 automated preflight — defensible-miss RPC + markdown tests.
 * Invoked by `npm run qa:qw3`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.qw3.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C QW3 manual verification ---');
console.log('Automated gate passed. Activate defensible-miss packets in staging:');
console.log('  1. Run scripts/seed-qw1-uat-calendar.sql + gap detection (if gaps missing)');
console.log('  2. Run scripts/seed-qw3-uat-defensible-miss.sql');
console.log('  3. Open /compliance/defensible-miss as wv-uat-admin@invalid.scc.local');
console.log('  4. Generate packet on missed pH row — expect before + after clean samples');
console.log('  5. Collector table — expect wv-uat-sampler with 4 access_issue visits\n');

#!/usr/bin/env node
/**
 * Lane C obligation ledger automated preflight — migration + parser tests.
 * Invoked by `npm run qa:obligation-ledger`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.obligation-ledger.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C sampling obligation ledger manual verification ---');
console.log('Automated gate passed. Smoke ledger in staging:');
console.log('  1. Apply migration 20260702180000');
console.log('  2. Run scripts/seed-qw1-uat-calendar.sql');
console.log('  3. Open /compliance/sampling-obligations as wv-uat-admin@invalid.scc.local');
console.log('  4. Expect 4 events — 1 missed, 1 at-risk, 1 excused, 1 upcoming\n');

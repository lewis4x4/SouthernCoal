#!/usr/bin/env node
/**
 * Lane C penalty ledger automated preflight — migration contract tests.
 * Invoked by `npm run qa:penalty-ledger`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.penalty-ledger.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C penalty ledger manual verification ---');
console.log('Automated gate passed. Smoke draft ledger in staging:');
console.log('  1. Confirm migration 20260701190000 applied');
console.log('  2. Open /compliance/penalty-ledger as wv-uat-admin@invalid.scc.local');
console.log('  3. Expect DRAFT banner + $0 combined until source tables populate');
console.log('  4. QW1 missed gap contributes draft miss estimate when gaps exist\n');
